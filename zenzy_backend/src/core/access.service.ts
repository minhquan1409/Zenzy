import { Injectable } from '@nestjs/common';
import { Filter, ObjectId } from 'mongodb';
import { Db } from './db';
import { EventDoc, FriendshipDoc, GeoPoint, LOCATION_TTL_SECONDS, PostDoc, ShopDoc, UserDoc } from './types';

const has = (ids: ObjectId[], id: ObjectId) => ids.some((x) => x.equals(id));

export function pairOf(a: ObjectId, b: ObjectId): { user_a: ObjectId; user_b: ObjectId } {
  return a.toHexString() < b.toHexString() ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

export function otherOf(f: FriendshipDoc, me: ObjectId): ObjectId {
  return f.user_a.equals(me) ? f.user_b : f.user_a;
}

/** True while the user is actually sharing: not in Ghost Mode, sharing on, and the time limit not passed. */
export function sharingActive(u: Pick<UserDoc, 'ghost_mode' | 'location_sharing' | 'status'>, now = new Date()): boolean {
  const s = u.location_sharing;
  return u.status === 'ACTIVE' && !u.ghost_mode && s.enabled && (s.until === null || s.until > now);
}

export interface VisibleLocation {
  user: UserDoc;
  loc: GeoPoint;
  accuracy: number | null;
  updated_at: Date;
}

/**
 * Central authorisation layer (NFR-09, NFR-15, spec 4.8).
 * Every rule about who may see what lives here, so that REST reads and socket emits
 * use the same decision. Controllers never decide visibility on their own.
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: Db) {}

  // ----- blocks -----

  /** IDs of every user who blocked `userId` or was blocked by `userId`. */
  async blockRelatedIds(userId: ObjectId): Promise<ObjectId[]> {
    const rows = await this.db.blocks.find({ $or: [{ blocker_id: userId }, { blocked_id: userId }] }).toArray();
    return rows.map((r) => (r.blocker_id.equals(userId) ? r.blocked_id : r.blocker_id));
  }

  async hasBlocked(blocker: ObjectId, blocked: ObjectId): Promise<boolean> {
    return (await this.db.blocks.countDocuments({ blocker_id: blocker, blocked_id: blocked }, { limit: 1 })) > 0;
  }

  async blockedEitherWay(a: ObjectId, b: ObjectId): Promise<boolean> {
    const n = await this.db.blocks.countDocuments(
      { $or: [{ blocker_id: a, blocked_id: b }, { blocker_id: b, blocked_id: a }] },
      { limit: 1 },
    );
    return n > 0;
  }

  // ----- friendships -----

  friendship(a: ObjectId, b: ObjectId): Promise<FriendshipDoc | null> {
    return this.db.friendships.findOne(pairOf(a, b));
  }

  acceptedFriendships(userId: ObjectId): Promise<FriendshipDoc[]> {
    return this.db.friendships.find({ $or: [{ user_a: userId }, { user_b: userId }], status: 'ACCEPTED' }).toArray();
  }

  async friendIds(userId: ObjectId): Promise<ObjectId[]> {
    return (await this.acceptedFriendships(userId)).map((f) => otherOf(f, userId));
  }

  async areFriends(a: ObjectId, b: ObjectId): Promise<boolean> {
    return (await this.friendship(a, b))?.status === 'ACCEPTED';
  }

  /** The users that `userId` marked as close friends. */
  async closeFriendIdsOf(userId: ObjectId): Promise<ObjectId[]> {
    return (await this.acceptedFriendships(userId)).filter((f) => has(f.close_for, userId)).map((f) => otherOf(f, userId));
  }

  /** The users who marked `viewer` as a close friend. */
  async usersWhoMarkedClose(viewer: ObjectId): Promise<ObjectId[]> {
    return (await this.acceptedFriendships(viewer))
      .filter((f) => has(f.close_for, otherOf(f, viewer)))
      .map((f) => otherOf(f, viewer));
  }

  // ----- location -----

  /** Who may see `user`'s position right now. Used before every location emit. */
  async locationViewerIds(user: UserDoc, now = new Date()): Promise<ObjectId[]> {
    if (!sharingActive(user, now)) return [];
    const blocked = await this.blockRelatedIds(user._id);
    const s = user.location_sharing;
    return (await this.acceptedFriendships(user._id))
      .filter((f) => s.audience === 'FRIENDS' || has(f.close_for, user._id))
      .map((f) => otherOf(f, user._id))
      .filter((id) => !has(s.hidden_from, id) && !has(blocked, id));
  }

  /** The friends whose position `viewer` may see right now. Used by every location read. */
  async visibleFriendLocations(viewer: ObjectId, now = new Date()): Promise<VisibleLocation[]> {
    const friendships = await this.acceptedFriendships(viewer);
    if (!friendships.length) return [];
    const blocked = await this.blockRelatedIds(viewer);
    const markedViewerClose = new Set(
      friendships.filter((f) => has(f.close_for, otherOf(f, viewer))).map((f) => otherOf(f, viewer).toHexString()),
    );
    const candidateIds = friendships.map((f) => otherOf(f, viewer)).filter((id) => !has(blocked, id));
    if (!candidateIds.length) return [];

    const users = await this.db.users.find({ _id: { $in: candidateIds }, status: 'ACTIVE', ghost_mode: false }).toArray();
    const allowed = users.filter((u) => {
      const s = u.location_sharing;
      if (!sharingActive(u, now)) return false;
      if (has(s.hidden_from, viewer)) return false;
      return s.audience === 'FRIENDS' || markedViewerClose.has(u._id.toHexString());
    });
    if (!allowed.length) return [];

    // The TTL index removes old documents about once a minute; the read ignores them as well.
    const fresh = new Date(now.getTime() - LOCATION_TTL_SECONDS * 1000);
    const locs = await this.db.userLocations
      .find({ _id: { $in: allowed.map((u) => u._id) }, updated_at: { $gt: fresh } })
      .toArray();
    const byId = new Map(allowed.map((u) => [u._id.toHexString(), u]));
    return locs.map((l) => ({ user: byId.get(l._id.toHexString())!, loc: l.loc, accuracy: l.accuracy, updated_at: l.updated_at }));
  }

  // ----- events -----

  /** Mongo filter matching only the events `viewer` may see (audience and blocks; status is the caller's concern). */
  async visibleEventFilter(viewer: ObjectId): Promise<Filter<EventDoc>> {
    const [blocked, closeHosts] = await Promise.all([this.blockRelatedIds(viewer), this.usersWhoMarkedClose(viewer)]);
    return {
      host_id: { $nin: blocked },
      $or: [{ audience: 'EVERYONE' }, { host_id: viewer }, { host_id: { $in: closeHosts } }],
    };
  }

  async canSeeEvent(viewer: UserDoc, event: EventDoc): Promise<boolean> {
    if (event.host_id.equals(viewer._id)) return event.status !== 'REMOVED';
    if (event.status === 'HIDDEN' || event.status === 'REMOVED') return viewer.role === 'ADMIN';
    if (await this.blockedEitherWay(viewer._id, event.host_id)) return false;
    if (event.audience === 'CLOSE_FRIENDS') return has(await this.closeFriendIdsOf(event.host_id), viewer._id);
    return true;
  }

  /** From a list of candidate users, those who may see the event (used for socket emits). */
  async filterEventViewers(event: EventDoc, candidates: ObjectId[]): Promise<ObjectId[]> {
    if (event.status === 'HIDDEN' || event.status === 'REMOVED') return candidates.filter((c) => c.equals(event.host_id));
    const blocked = await this.blockRelatedIds(event.host_id);
    const close = event.audience === 'CLOSE_FRIENDS' ? await this.closeFriendIdsOf(event.host_id) : null;
    return candidates.filter(
      (c) => c.equals(event.host_id) || (!has(blocked, c) && (close === null || has(close, c))),
    );
  }

  // ----- shops & posts -----

  /** BR-04: only APPROVED (and not report-hidden) shops are visible, except to their owner and admins. */
  canSeeShop(viewer: UserDoc, shop: ShopDoc): boolean {
    if (shop.owner_id.equals(viewer._id) || viewer.role === 'ADMIN') return true;
    return shop.status === 'APPROVED' && !shop.hidden;
  }

  async canSeePost(viewer: UserDoc, post: PostDoc): Promise<boolean> {
    if (post.status !== 'ACTIVE') return false;
    if (post.author_id.equals(viewer._id)) return true;
    return !(await this.blockedEitherWay(viewer._id, post.author_id));
  }
}
