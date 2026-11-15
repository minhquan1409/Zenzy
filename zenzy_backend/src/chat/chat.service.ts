import { Injectable } from '@nestjs/common';
import { Filter, ObjectId } from 'mongodb';
import { Err, iso, publicUser } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db, isDuplicateKey } from '../core/db';
import { RealtimeGateway } from '../core/realtime.gateway';
import { NotificationsService } from '../core/support.services';
import { ConversationDoc, MessageDoc, UserDoc } from '../core/types';

const directKey = (a: ObjectId, b: ObjectId) => [a.toHexString(), b.toHexString()].sort().join(':');

export function messageView(m: MessageDoc) {
  return {
    id: m._id.toHexString(),
    conversation_id: m.conversation_id.toHexString(),
    sender_id: m.sender_id.toHexString(),
    content: m.text,
    created_at: iso(m.created_at),
  };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /** Only members may read or write a conversation (spec 5.1). */
  private async loadAsMember(user: UserDoc, id: ObjectId): Promise<ConversationDoc> {
    const c = await this.db.conversations.findOne({ _id: id });
    if (!c) throw Err.notFound('Conversation not found');
    if (!c.member_ids.some((m) => m.equals(user._id))) throw Err.forbidden('NOT_A_MEMBER', 'You are not a member of this conversation');
    return c;
  }

  private async present(user: UserDoc, convs: ConversationDoc[]) {
    const otherIds = convs.flatMap((c) => (c.type === 'DIRECT' ? c.member_ids.filter((m) => !m.equals(user._id)) : []));
    const others = await this.db.users.find({ _id: { $in: otherIds } }).toArray();
    const byId = new Map(others.map((u) => [u._id.toHexString(), u]));
    const blocked = await this.access.blockRelatedIds(user._id);
    return Promise.all(
      convs.map(async (c) => {
        const since = c.read_at?.[user._id.toHexString()] ?? new Date(0);
        const unread_count = await this.db.messages.countDocuments({
          conversation_id: c._id,
          sender_id: { $nin: [user._id, ...blocked] },
          created_at: { $gt: since },
        });
        const other = c.type === 'DIRECT' ? byId.get(c.member_ids.find((m) => !m.equals(user._id))?.toHexString() ?? '') : undefined;
        const last = c.last_message && !blocked.some((b) => b.equals(c.last_message!.sender_id)) ? c.last_message : null;
        return {
          id: c._id.toHexString(),
          type: c.type,
          name: c.type === 'DIRECT' ? (other?.display_name ?? null) : c.name,
          other_user: c.type === 'DIRECT' ? publicUser(other) : null,
          event_id: c.event_id ? c.event_id.toHexString() : null,
          member_count: c.member_ids.length,
          last_message: last
            ? { id: last.id.toHexString(), sender_id: last.sender_id.toHexString(), content: last.content, created_at: iso(last.created_at) }
            : null,
          unread_count,
          muted: c.muted_by.some((m) => m.equals(user._id)),
          updated_at: iso(c.updated_at),
        };
      }),
    );
  }

  async list(user: UserDoc, type?: 'DIRECT' | 'GROUP' | 'EVENT') {
    const filter: Filter<ConversationDoc> = { member_ids: user._id, hidden_for: { $ne: user._id }, ...(type ? { type } : {}) };
    const convs = await this.db.conversations.find(filter).sort({ updated_at: -1 }).limit(200).toArray();
    return { items: await this.present(user, convs) };
  }

  /** POST /conversations: a direct chat needs an accepted friend with no block; a group needs friends only. */
  async create(user: UserDoc, type: 'DIRECT' | 'GROUP', memberIds: ObjectId[], name: string | null) {
    const others = memberIds.filter((m, i) => !m.equals(user._id) && memberIds.findIndex((x) => x.equals(m)) === i);
    if (!others.length) throw Err.badRequest('INVALID_INPUT', 'member_ids must contain at least one other user');
    if (type === 'DIRECT' && others.length !== 1) throw Err.badRequest('INVALID_INPUT', 'A direct chat has exactly one other member');
    for (const id of others) {
      if ((await this.access.blockedEitherWay(user._id, id)) || !(await this.access.areFriends(user._id, id))) {
        throw Err.forbidden('NOT_FRIENDS', 'You can only chat with friends who have not blocked you');
      }
    }
    const now = new Date();
    if (type === 'DIRECT') {
      const key = directKey(user._id, others[0]);
      const existing = await this.db.conversations.findOne({ direct_key: key });
      if (existing) {
        await this.db.conversations.updateOne({ _id: existing._id }, { $pull: { hidden_for: user._id } });
        return (await this.present(user, [{ ...existing, hidden_for: [] }]))[0];
      }
    }
    const conv: ConversationDoc = {
      _id: new ObjectId(),
      type,
      member_ids: [user._id, ...others],
      name: type === 'GROUP' ? (name ?? 'Group') : null,
      ...(type === 'DIRECT' ? { direct_key: directKey(user._id, others[0]) } : {}),
      created_by: user._id,
      muted_by: [],
      hidden_for: [],
      read_at: {},
      last_message: null,
      created_at: now,
      updated_at: now,
    };
    try {
      await this.db.conversations.insertOne(conv);
    } catch (e) {
      if (isDuplicateKey(e) && type === 'DIRECT') {
        const existing = await this.db.conversations.findOne({ direct_key: conv.direct_key });
        return (await this.present(user, [existing!]))[0];
      }
      throw e;
    }
    for (const m of conv.member_ids) this.realtime.joinConversation(m, conv._id);
    return (await this.present(user, [conv]))[0];
  }

  /** History, newest first; messages of users in a block relation with the caller are left out. */
  async messages(user: UserDoc, id: ObjectId, limit: number, before?: Date) {
    const conv = await this.loadAsMember(user, id);
    const blocked = await this.access.blockRelatedIds(user._id);
    const rows = await this.db.messages
      .find({ conversation_id: conv._id, sender_id: { $nin: blocked }, ...(before ? { created_at: { $lt: before } } : {}) })
      .sort({ created_at: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return {
      items: rows.map(messageView),
      next_before: rows.length === limit ? iso(rows[rows.length - 1].created_at) : null,
    };
  }

  async send(user: UserDoc, id: ObjectId, content: string) {
    const conv = await this.loadAsMember(user, id);
    const others = conv.member_ids.filter((m) => !m.equals(user._id));
    if (conv.type === 'DIRECT') {
      const other = others[0];
      if (!other || (await this.access.blockedEitherWay(user._id, other)) || !(await this.access.areFriends(user._id, other))) {
        throw Err.forbidden('BLOCKED', 'You cannot message this user');
      }
    }
    if (conv.type === 'EVENT' && conv.event_id) {
      const event = await this.db.events.findOne({ _id: conv.event_id }, { projection: { status: 1 } });
      if (event && (event.status === 'HIDDEN' || event.status === 'REMOVED')) throw Err.forbidden('EVENT_UNAVAILABLE', 'This event chat is closed');
    }
    const now = new Date();
    const msg: MessageDoc = { _id: new ObjectId(), conversation_id: conv._id, sender_id: user._id, text: content, created_at: now };
    await this.db.messages.insertOne(msg);
    await this.db.conversations.updateOne(
      { _id: conv._id },
      {
        $set: {
          last_message: { id: msg._id, sender_id: user._id, content, created_at: now },
          updated_at: now,
          [`read_at.${user._id.toHexString()}`]: now,
          hidden_for: [], // a new message brings the chat back to every member's list
        },
      },
    );

    // Members in a block relation with the sender (group and event chats) never receive the message.
    const blocked = await this.access.blockRelatedIds(user._id);
    const view = messageView(msg);
    this.realtime.emitToConversation(conv._id, 'chat:message', { conversation_id: conv._id.toHexString(), message: view }, blocked);

    // Recipients that are not connected get a push (UC-06 step 4), unless they muted the chat.
    for (const r of others) {
      if (blocked.some((b) => b.equals(r)) || conv.muted_by.some((m) => m.equals(r))) continue;
      if (await this.realtime.isOnline(r)) continue;
      await this.notifications.pushIfEnabled(r, 'CHAT_MESSAGE', `${user.display_name}: ${content.slice(0, 100)}`, {
        conversation_id: conv._id.toHexString(),
      });
    }
    return view;
  }

  async markRead(user: UserDoc, id: ObjectId): Promise<void> {
    const conv = await this.loadAsMember(user, id);
    await this.db.conversations.updateOne({ _id: conv._id }, { $set: { [`read_at.${user._id.toHexString()}`]: new Date() } });
  }

  async setMuted(user: UserDoc, id: ObjectId, muted: boolean) {
    const conv = await this.loadAsMember(user, id);
    await this.db.conversations.updateOne(
      { _id: conv._id },
      muted ? { $addToSet: { muted_by: user._id } } : { $pull: { muted_by: user._id } },
    );
    return { id: conv._id.toHexString(), muted };
  }

  /** Removes the conversation from the caller's own list; a new message brings it back. */
  async hide(user: UserDoc, id: ObjectId): Promise<void> {
    const conv = await this.loadAsMember(user, id);
    await this.db.conversations.updateOne({ _id: conv._id }, { $addToSet: { hidden_for: user._id } });
  }
}
