import { Injectable } from '@nestjs/common';
import { Filter, ObjectId } from 'mongodb';
import { Err, iso, point, publicUser } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db, isDuplicateKey } from '../core/db';
import { RealtimeGateway } from '../core/realtime.gateway';
import { NotificationsService, TextModeration } from '../core/support.services';
import { ConversationDoc, EventDoc, EventType, MAX_ACTIVE_EVENTS, ParticipantDoc, ParticipantStatus, UserDoc } from '../core/types';

export interface EventInput {
  title: string;
  type: EventType;
  description: string;
  latitude: number;
  longitude: number;
  place_name: string;
  start_time?: Date;
  end_time: Date;
  max_participants: number | null;
  audience: 'EVERYONE' | 'CLOSE_FRIENDS';
}

export function eventSummary(e: EventDoc, now = new Date()) {
  return {
    id: e._id.toHexString(),
    host_id: e.host_id.toHexString(),
    title: e.title,
    type: e.type,
    description: e.description,
    latitude: e.loc.coordinates[1],
    longitude: e.loc.coordinates[0],
    place_name: e.place_name,
    start_time: iso(e.starts_at),
    end_time: iso(e.ends_at),
    is_live: e.starts_at <= now && e.ends_at > now && (e.status === 'OPEN' || e.status === 'FULL'),
    max_participants: e.max_participants,
    participants_count: e.approved_count,
    spots_left: e.max_participants === null ? null : Math.max(0, e.max_participants - e.approved_count),
    audience: e.audience,
    status: e.status,
  };
}

/** Events that count as "active" (BR-02) and that are listed on the map (UC-08). */
export const activeEventFilter = (now: Date): Filter<EventDoc> => ({ status: { $in: ['OPEN', 'FULL'] }, ends_at: { $gt: now } });

@Injectable()
export class EventsService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly text: TextModeration,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /** Emits an event summary only to connected users who are allowed to see the event. */
  private async broadcast(name: 'event:created' | 'event:updated', event: EventDoc): Promise<void> {
    const viewers = await this.access.filterEventViewers(event, await this.realtime.connectedUserIds());
    this.realtime.emitToUsers(viewers, name, eventSummary(event));
  }

  private async load(eventId: ObjectId): Promise<EventDoc> {
    const event = await this.db.events.findOne({ _id: eventId });
    if (!event) throw Err.notFound('Event not found');
    return event;
  }

  /** BR-06: only the host may edit, cancel, approve or remove. */
  private async loadAsHost(user: UserDoc, eventId: ObjectId): Promise<EventDoc> {
    const event = await this.load(eventId);
    if (!event.host_id.equals(user._id)) {
      if (!(await this.access.canSeeEvent(user, event))) throw Err.notFound('Event not found');
      throw Err.forbidden('NOT_HOST', 'Only the host can do this');
    }
    if (event.status === 'REMOVED') throw Err.notFound('Event not found');
    return event;
  }

  // ----- create / edit / cancel (UC-11, SEQ-03) -----

  async create(user: UserDoc, input: EventInput) {
    const now = new Date();
    const starts = input.start_time ?? now;
    if (input.end_time <= starts) throw Err.badRequest('INVALID_INPUT', 'end_time must be later than start_time');
    if (input.end_time <= now) throw Err.badRequest('INVALID_INPUT', 'end_time must be in the future');
    await this.text.assertClean(input.title, input.description, input.place_name); // BR-01 -> 422, nothing saved

    const event: EventDoc = {
      _id: new ObjectId(),
      host_id: user._id,
      title: input.title,
      type: input.type,
      description: input.description,
      loc: point(input.latitude, input.longitude),
      place_name: input.place_name,
      starts_at: starts,
      ends_at: input.end_time,
      max_participants: input.max_participants,
      approved_count: 0,
      audience: input.audience,
      status: 'OPEN',
      conversation_id: new ObjectId(),
      created_at: now,
      updated_at: now,
    };
    const conversation: ConversationDoc = {
      _id: event.conversation_id,
      type: 'EVENT',
      member_ids: [user._id],
      name: input.title,
      event_id: event._id,
      created_by: user._id,
      muted_by: [],
      hidden_for: [],
      read_at: {},
      last_message: null,
      created_at: now,
      updated_at: now,
    };

    await this.db.tx(async (session) => {
      // Writing the host's document first makes two concurrent creates conflict, so the count below is safe.
      await this.db.users.updateOne({ _id: user._id }, { $inc: { event_writes: 1 } }, { session });
      const active = await this.db.events.countDocuments({ host_id: user._id, ...activeEventFilter(now) }, { session });
      if (active >= MAX_ACTIVE_EVENTS) {
        throw Err.conflict('EVENT_LIMIT', `You already have ${MAX_ACTIVE_EVENTS} active events`); // BR-02
      }
      await this.db.conversations.insertOne(conversation, { session });
      await this.db.events.insertOne(event, { session });
    });

    this.realtime.joinConversation(user._id, conversation._id);
    await this.broadcast('event:created', event);
    return { ...eventSummary(event), conversation_id: conversation._id.toHexString() };
  }

  async update(user: UserDoc, eventId: ObjectId, patch: Partial<EventInput>) {
    const event = await this.loadAsHost(user, eventId);
    if (event.status !== 'OPEN' && event.status !== 'FULL') {
      throw Err.conflict('EVENT_NOT_ACTIVE', 'Only an active event can be edited');
    }
    const starts = patch.start_time ?? event.starts_at;
    const ends = patch.end_time ?? event.ends_at;
    if (ends <= starts) throw Err.badRequest('INVALID_INPUT', 'end_time must be later than start_time');
    const max = patch.max_participants !== undefined ? patch.max_participants : event.max_participants;
    if (max !== null && max < event.approved_count) {
      throw Err.conflict('MAX_BELOW_APPROVED', 'max_participants is lower than the number of approved members');
    }
    await this.text.assertClean(patch.title, patch.description, patch.place_name);

    const set: Partial<EventDoc> = { starts_at: starts, ends_at: ends, max_participants: max, updated_at: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.type !== undefined) set.type = patch.type;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.place_name !== undefined) set.place_name = patch.place_name;
    if (patch.audience !== undefined) set.audience = patch.audience;
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
      set.loc = point(patch.latitude ?? event.loc.coordinates[1], patch.longitude ?? event.loc.coordinates[0]);
    }
    set.status = max !== null && event.approved_count >= max ? 'FULL' : 'OPEN';

    const updated = await this.db.events.findOneAndUpdate(
      { _id: event._id, status: { $in: ['OPEN', 'FULL'] } },
      { $set: set },
      { returnDocument: 'after' },
    );
    if (!updated) throw Err.conflict('EVENT_NOT_ACTIVE', 'Only an active event can be edited');
    if (patch.title !== undefined) await this.db.conversations.updateOne({ _id: event.conversation_id }, { $set: { name: patch.title } });
    await this.broadcast('event:updated', updated);
    return eventSummary(updated);
  }

  async cancel(user: UserDoc, eventId: ObjectId, reason: string | null) {
    const event = await this.loadAsHost(user, eventId);
    const updated = await this.db.events.findOneAndUpdate(
      { _id: event._id, status: { $in: ['OPEN', 'FULL'] } },
      { $set: { status: 'CANCELLED', cancel_reason: reason, updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) throw Err.conflict('EVENT_NOT_ACTIVE', 'Only an active event can be cancelled');

    const members = await this.db.participants.find({ event_id: event._id, status: { $in: ['PENDING', 'APPROVED'] } }).toArray();
    for (const m of members) {
      await this.notifications.notify(m.user_id, 'EVENT_UPDATE', `"${event.title}" was cancelled${reason ? `: ${reason}` : ''}`, {
        event_id: event._id.toHexString(),
        status: 'CANCELLED',
      });
    }
    await this.broadcast('event:updated', updated);
    return eventSummary(updated);
  }

  // ----- browse (UC-08) -----

  async list(
    viewer: UserDoc,
    q: { latitude: number; longitude: number; radius: number; type?: EventType; when?: 'NOW' | 'SCHEDULED' },
  ) {
    const now = new Date();
    const filter: Filter<EventDoc> = {
      $and: [
        activeEventFilter(now),
        await this.access.visibleEventFilter(viewer._id),
        // GeoJSON order is [longitude, latitude]; $centerSphere takes the radius in radians.
        { loc: { $geoWithin: { $centerSphere: [[q.longitude, q.latitude], q.radius / 6378100] } } },
        ...(q.type ? [{ type: q.type }] : []),
        ...(q.when === 'NOW' ? [{ starts_at: { $lte: now } }] : []),
        ...(q.when === 'SCHEDULED' ? [{ starts_at: { $gt: now } }] : []),
      ],
    };
    const events = await this.db.events.find(filter).sort({ starts_at: 1 }).limit(200).toArray();
    return events.map((e) => eventSummary(e, now));
  }

  async detail(viewer: UserDoc, eventId: ObjectId) {
    const event = await this.load(eventId);
    if (!(await this.access.canSeeEvent(viewer, event))) throw Err.notFound('Event not found');
    const isHost = event.host_id.equals(viewer._id);
    const [host, mine] = await Promise.all([
      this.db.users.findOne({ _id: event.host_id }),
      isHost ? null : this.db.participants.findOne({ event_id: event._id, user_id: viewer._id }),
    ]);
    const inChat = isHost || mine?.status === 'APPROVED';
    return {
      ...eventSummary(event),
      host: publicUser(host),
      my_status: isHost ? 'HOST' : (mine?.status ?? null),
      my_request_id: mine ? mine._id.toHexString() : null,
      conversation_id: inChat ? event.conversation_id.toHexString() : null,
      cancel_reason: event.status === 'CANCELLED' ? (event.cancel_reason ?? null) : null,
    };
  }

  async participants(viewer: UserDoc, eventId: ObjectId, status?: ParticipantStatus) {
    const event = await this.load(eventId);
    if (!(await this.access.canSeeEvent(viewer, event))) throw Err.notFound('Event not found');
    const isHost = event.host_id.equals(viewer._id);
    // The host sees every status; everyone else sees only approved members.
    const filter: Filter<ParticipantDoc> = { event_id: event._id, ...(isHost ? (status ? { status } : {}) : { status: 'APPROVED' }) };
    const rows = await this.db.participants.find(filter).sort({ created_at: 1 }).toArray();
    const blocked = isHost ? [] : await this.access.blockRelatedIds(viewer._id);
    const users = await this.db.users.find({ _id: { $in: rows.map((r) => r.user_id), $nin: blocked } }).toArray();
    const byId = new Map(users.map((u) => [u._id.toHexString(), u]));
    return {
      items: rows
        .filter((r) => byId.has(r.user_id.toHexString()))
        .map((r) => ({
          request_id: r._id.toHexString(),
          user: publicUser(byId.get(r.user_id.toHexString())),
          status: r.status,
          requested_at: iso(r.created_at),
        })),
    };
  }

  // ----- join / approve / leave (UC-09, UC-10, UC-11, SEQ-04) -----

  async requestJoin(user: UserDoc, eventId: ObjectId) {
    const event = await this.load(eventId);
    if (event.host_id.equals(user._id)) throw Err.badRequest('OWN_EVENT', 'You are the host of this event');
    if (await this.access.hasBlocked(event.host_id, user._id)) throw Err.forbidden('BLOCKED_BY_HOST', 'You cannot join this event');
    if (!(await this.access.canSeeEvent(user, event))) throw Err.notFound('Event not found');
    const now = new Date();
    if (event.status === 'CANCELLED' || event.status === 'ENDED' || event.ends_at <= now) {
      throw Err.conflict('EVENT_ENDED', 'This event has ended or was cancelled');
    }
    if (event.status === 'FULL') throw Err.conflict('EVENT_FULL', 'This event is full');

    const duplicate = () => Err.conflict('DUPLICATE_REQUEST', 'You already sent a request for this event');
    let requestId: ObjectId;
    const existing = await this.db.participants.findOne({ event_id: event._id, user_id: user._id });
    if (existing) {
      // A request the user withdrew may be sent again; one the host declined or removed may not.
      if (existing.status !== 'CANCELLED' && existing.status !== 'LEFT') throw duplicate();
      const res = await this.db.participants.updateOne(
        { _id: existing._id, status: existing.status },
        { $set: { status: 'PENDING', updated_at: now } },
      );
      if (!res.modifiedCount) throw duplicate();
      requestId = existing._id;
    } else {
      requestId = new ObjectId();
      try {
        // The unique index on (event_id, user_id) guarantees one request per user and event.
        await this.db.participants.insertOne({
          _id: requestId,
          event_id: event._id,
          user_id: user._id,
          status: 'PENDING',
          created_at: now,
          updated_at: now,
        });
      } catch (e) {
        if (isDuplicateKey(e)) throw duplicate();
        throw e;
      }
    }
    await this.notifications.notify(event.host_id, 'EVENT_JOIN_REQUEST', `${user.display_name} wants to join "${event.title}"`, {
      event_id: event._id.toHexString(),
      request_id: requestId.toHexString(),
      user_id: user._id.toHexString(),
    });
    return { request_id: requestId.toHexString(), event_id: event._id.toHexString(), status: 'PENDING' };
  }

  async decide(user: UserDoc, eventId: ObjectId, requestId: ObjectId, status: 'APPROVED' | 'REJECTED') {
    const event = await this.loadAsHost(user, eventId); // 403 for anyone but the host (BR-06)
    const now = new Date();

    const { participant, updatedEvent } = await this.db.tx(async (session) => {
      const participant = await this.db.participants.findOneAndUpdate(
        { _id: requestId, event_id: event._id, status: 'PENDING' },
        { $set: { status, updated_at: now } },
        { session, returnDocument: 'after' },
      );
      if (!participant) {
        const exists = await this.db.participants.countDocuments({ _id: requestId, event_id: event._id }, { session, limit: 1 });
        if (!exists) throw Err.notFound('Request not found');
        throw Err.conflict('REQUEST_NOT_PENDING', 'This request is no longer pending');
      }
      if (status === 'REJECTED') return { participant, updatedEvent: null };

      // Take a seat only if one is free; otherwise the whole transaction (including the approval) is rolled back.
      let updatedEvent = await this.db.events.findOneAndUpdate(
        {
          _id: event._id,
          status: 'OPEN',
          ends_at: { $gt: now },
          $or: [{ max_participants: null }, { $expr: { $lt: ['$approved_count', '$max_participants'] } }],
        },
        { $inc: { approved_count: 1 }, $set: { updated_at: now } },
        { session, returnDocument: 'after' },
      );
      if (!updatedEvent) {
        const current = await this.db.events.findOne({ _id: event._id }, { session });
        if (current?.status === 'FULL') throw Err.conflict('EVENT_FULL', 'This event is full');
        throw Err.conflict('EVENT_ENDED', 'This event has ended or was cancelled');
      }
      if (updatedEvent.max_participants !== null && updatedEvent.approved_count >= updatedEvent.max_participants) {
        updatedEvent = await this.db.events.findOneAndUpdate(
          { _id: event._id },
          { $set: { status: 'FULL' } },
          { session, returnDocument: 'after' },
        );
      }
      await this.db.conversations.updateOne(
        { _id: event.conversation_id },
        { $addToSet: { member_ids: participant.user_id }, $pull: { hidden_for: participant.user_id } },
        { session },
      );
      return { participant, updatedEvent };
    });

    if (updatedEvent) {
      this.realtime.joinConversation(participant.user_id, event.conversation_id);
      await this.broadcast('event:updated', updatedEvent);
    }
    await this.notifications.notify(
      participant.user_id,
      'EVENT_REQUEST_RESULT',
      status === 'APPROVED' ? `You are in! Your request to join "${event.title}" was approved` : `Your request to join "${event.title}" was declined`,
      { event_id: event._id.toHexString(), request_id: requestId.toHexString(), status },
    );
    return {
      request_id: requestId.toHexString(),
      status,
      event: eventSummary(updatedEvent ?? event),
    };
  }

  /** Frees a seat: the member leaves the chat and a FULL event becomes OPEN again. */
  private async releaseSeat(
    participant: ParticipantDoc,
    event: EventDoc,
    newStatus: 'LEFT' | 'KICKED',
  ): Promise<EventDoc> {
    const now = new Date();
    const updated = await this.db.tx(async (session) => {
      const res = await this.db.participants.updateOne(
        { _id: participant._id, status: 'APPROVED' },
        { $set: { status: newStatus, updated_at: now } },
        { session },
      );
      if (!res.modifiedCount) throw Err.conflict('NOT_A_MEMBER', 'This user is no longer a member');
      await this.db.events.updateOne({ _id: event._id }, { $inc: { approved_count: -1 }, $set: { updated_at: now } }, { session });
      await this.db.events.updateOne({ _id: event._id, status: 'FULL' }, { $set: { status: 'OPEN' } }, { session });
      await this.db.conversations.updateOne({ _id: event.conversation_id }, { $pull: { member_ids: participant.user_id } }, { session });
      return this.db.events.findOne({ _id: event._id }, { session });
    });
    this.realtime.leaveConversation(participant.user_id, event.conversation_id);
    await this.broadcast('event:updated', updated!);
    return updated!;
  }

  /** DELETE /events/{id}/requests/me: cancel a pending request, or leave after approval (allowed even after the start). */
  async withdraw(user: UserDoc, eventId: ObjectId): Promise<void> {
    const event = await this.load(eventId);
    const p = await this.db.participants.findOne({ event_id: event._id, user_id: user._id });
    if (!p || (p.status !== 'PENDING' && p.status !== 'APPROVED')) throw Err.notFound('You have no request for this event');

    if (p.status === 'PENDING') {
      const res = await this.db.participants.updateOne(
        { _id: p._id, status: 'PENDING' },
        { $set: { status: 'CANCELLED', updated_at: new Date() } },
      );
      if (!res.modifiedCount) throw Err.conflict('REQUEST_NOT_PENDING', 'This request is no longer pending');
    } else {
      await this.releaseSeat(p, event, 'LEFT');
    }
    await this.notifications.notify(
      event.host_id,
      'EVENT_UPDATE',
      p.status === 'PENDING' ? `${user.display_name} cancelled the request to join "${event.title}"` : `${user.display_name} left "${event.title}"`,
      { event_id: event._id.toHexString(), user_id: user._id.toHexString(), status: p.status === 'PENDING' ? 'CANCELLED' : 'LEFT' },
    );
  }

  async kick(user: UserDoc, eventId: ObjectId, memberId: ObjectId): Promise<void> {
    const event = await this.loadAsHost(user, eventId);
    const p = await this.db.participants.findOne({ event_id: event._id, user_id: memberId, status: 'APPROVED' });
    if (!p) throw Err.notFound('Member not found');
    await this.releaseSeat(p, event, 'KICKED');
    await this.notifications.notify(memberId, 'EVENT_UPDATE', `You were removed from "${event.title}"`, {
      event_id: event._id.toHexString(),
      status: 'KICKED',
    });
  }

  /** Events the caller hosts or has a request for, newest first (UC-10, UC-11). */
  async mine(user: UserDoc) {
    const now = new Date();
    const [hosted, parts] = await Promise.all([
      this.db.events.find({ host_id: user._id, status: { $ne: 'REMOVED' } }).sort({ starts_at: -1 }).limit(100).toArray(),
      this.db.participants.find({ user_id: user._id, status: { $in: ['PENDING', 'APPROVED'] } }).toArray(),
    ]);
    const joined = await this.db.events
      .find({ _id: { $in: parts.map((p) => p.event_id) }, status: { $nin: ['HIDDEN', 'REMOVED'] } })
      .sort({ starts_at: -1 })
      .toArray();
    const statusOf = new Map(parts.map((p) => [p.event_id.toHexString(), p.status]));
    const pending = await this.db.participants
      .aggregate<{ _id: ObjectId; n: number }>([
        { $match: { event_id: { $in: hosted.map((e) => e._id) }, status: 'PENDING' } },
        { $group: { _id: '$event_id', n: { $sum: 1 } } },
      ])
      .toArray();
    const pendingOf = new Map(pending.map((p) => [p._id.toHexString(), p.n]));
    return {
      hosted: hosted.map((e) => ({ ...eventSummary(e, now), pending_requests: pendingOf.get(e._id.toHexString()) ?? 0 })),
      joined: joined.map((e) => ({ ...eventSummary(e, now), my_status: statusOf.get(e._id.toHexString()) ?? null })),
    };
  }

  /** Called by the scheduler: events whose end time has passed become ENDED. */
  async endPastEvents(now = new Date()): Promise<number> {
    const res = await this.db.events.updateMany(
      { status: { $in: ['OPEN', 'FULL'] }, ends_at: { $lte: now } },
      { $set: { status: 'ENDED', updated_at: now } },
    );
    return res.modifiedCount;
  }
}
