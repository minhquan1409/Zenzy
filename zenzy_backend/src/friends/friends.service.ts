import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { Err, escapeRegex, iso, publicUser } from '../common/http';
import { AccessService, otherOf, pairOf } from '../core/access.service';
import { Db, isDuplicateKey } from '../core/db';
import { RealtimeGateway } from '../core/realtime.gateway';
import { NotificationsService } from '../core/support.services';
import { FriendshipDoc, UserDoc } from '../core/types';

@Injectable()
export class FriendsService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: UserDoc, status: 'ACCEPTED' | 'PENDING', q?: string) {
    const rows = await this.db.friendships.find({ $or: [{ user_a: user._id }, { user_b: user._id }], status }).toArray();
    const others = await this.db.users
      .find({
        _id: { $in: rows.map((f) => otherOf(f, user._id)) },
        ...(q ? { $or: [{ username: { $regex: escapeRegex(q.toLowerCase()) } }, { display_name: { $regex: escapeRegex(q), $options: 'i' } }] } : {}),
      })
      .toArray();
    const byId = new Map(others.map((u) => [u._id.toHexString(), u]));
    const items = rows
      .filter((f) => byId.has(otherOf(f, user._id).toHexString()))
      .map((f) => ({
        request_id: f._id.toHexString(),
        user: publicUser(byId.get(otherOf(f, user._id).toHexString())),
        status: f.status,
        direction: f.status === 'PENDING' ? (f.requested_by.equals(user._id) ? 'OUTGOING' : 'INCOMING') : null,
        close_friend: f.close_for.some((id) => id.equals(user._id)),
        created_at: iso(f.created_at),
      }))
      .sort((a, b) => a.user!.username.localeCompare(b.user!.username));
    return { items };
  }

  async sendRequest(user: UserDoc, receiverId: ObjectId) {
    if (receiverId.equals(user._id)) throw Err.badRequest('INVALID_INPUT', 'You cannot add yourself');
    const receiver = await this.db.users.findOne({ _id: receiverId, status: 'ACTIVE' });
    if (!receiver) throw Err.notFound('User not found');
    if (await this.access.blockedEitherWay(user._id, receiverId)) throw Err.forbidden('BLOCKED', 'You cannot send a request to this user');

    const now = new Date();
    const doc: FriendshipDoc = {
      _id: new ObjectId(),
      ...pairOf(user._id, receiverId),
      status: 'PENDING',
      requested_by: user._id,
      close_for: [],
      created_at: now,
      updated_at: now,
    };
    try {
      await this.db.friendships.insertOne(doc); // the unique pair index rejects duplicates
    } catch (e) {
      if (isDuplicateKey(e)) throw Err.conflict('DUPLICATE_REQUEST', 'A request or friendship with this user already exists');
      throw e;
    }
    await this.notifications.notify(receiverId, 'FRIEND_REQUEST', `${user.display_name} sent you a friend request`, {
      request_id: doc._id.toHexString(),
      user_id: user._id.toHexString(),
    });
    return { request_id: doc._id.toHexString(), status: 'PENDING', user: publicUser(receiver) };
  }

  async respond(user: UserDoc, requestId: ObjectId, action: 'ACCEPT' | 'REJECT') {
    const f = await this.db.friendships.findOne({ _id: requestId });
    if (!f || (!f.user_a.equals(user._id) && !f.user_b.equals(user._id))) throw Err.notFound('Request not found');
    if (f.requested_by.equals(user._id)) throw Err.forbidden('NOT_RECIPIENT', 'Only the recipient can answer a friend request');
    if (f.status !== 'PENDING') throw Err.conflict('ALREADY_ANSWERED', 'This request was already answered');

    if (action === 'REJECT') {
      await this.db.friendships.deleteOne({ _id: f._id, status: 'PENDING' });
      return { request_id: f._id.toHexString(), status: 'REJECTED' };
    }
    await this.db.friendships.updateOne({ _id: f._id, status: 'PENDING' }, { $set: { status: 'ACCEPTED', updated_at: new Date() } });
    await this.notifications.notify(f.requested_by, 'FRIEND_ACCEPTED', `${user.display_name} accepted your friend request`, {
      user_id: user._id.toHexString(),
    });
    return { request_id: f._id.toHexString(), status: 'ACCEPTED' };
  }

  /** Both users stop seeing each other's position the moment the friendship ends. */
  private hideEachOther(a: ObjectId, b: ObjectId): void {
    this.realtime.emitToUser(a, 'location:hide', { user_id: b.toHexString() });
    this.realtime.emitToUser(b, 'location:hide', { user_id: a.toHexString() });
  }

  /** Unfriend, or withdraw a pending request. */
  async remove(user: UserDoc, otherId: ObjectId): Promise<void> {
    const res = await this.db.friendships.deleteOne(pairOf(user._id, otherId));
    if (res.deletedCount) this.hideEachOther(user._id, otherId);
  }

  async setClose(user: UserDoc, otherId: ObjectId, close: boolean) {
    const f = await this.access.friendship(user._id, otherId);
    if (!f || f.status !== 'ACCEPTED') throw Err.notFound('Friend not found');
    await this.db.friendships.updateOne(
      { _id: f._id },
      close ? { $addToSet: { close_for: user._id }, $set: { updated_at: new Date() } } : { $pull: { close_for: user._id }, $set: { updated_at: new Date() } },
    );
    // Removing a close friend while sharing with close friends only hides the user from that friend.
    if (!close && user.location_sharing.audience === 'CLOSE_FRIENDS') {
      this.realtime.emitToUser(otherId, 'location:hide', { user_id: user._id.toHexString() });
    }
    return { user_id: otherId.toHexString(), close_friend: close };
  }

  async listBlocks(user: UserDoc) {
    const rows = await this.db.blocks.find({ blocker_id: user._id }).sort({ created_at: -1 }).toArray();
    const users = await this.db.users.find({ _id: { $in: rows.map((r) => r.blocked_id) } }).toArray();
    const byId = new Map(users.map((u) => [u._id.toHexString(), u]));
    return {
      items: rows
        .filter((r) => byId.has(r.blocked_id.toHexString()))
        .map((r) => ({ user: publicUser(byId.get(r.blocked_id.toHexString())), blocked_at: iso(r.created_at) })),
    };
  }

  /** UC-05: blocking ends any friendship; the two users disappear from each other's map, search, chat and feed. */
  async block(user: UserDoc, otherId: ObjectId) {
    if (otherId.equals(user._id)) throw Err.badRequest('INVALID_INPUT', 'You cannot block yourself');
    if (!(await this.db.users.countDocuments({ _id: otherId }, { limit: 1 }))) throw Err.notFound('User not found');
    await this.db.tx(async (session) => {
      await this.db.blocks.updateOne(
        { blocker_id: user._id, blocked_id: otherId },
        { $setOnInsert: { created_at: new Date() } },
        { upsert: true, session },
      );
      await this.db.friendships.deleteOne(pairOf(user._id, otherId), { session });
      await this.db.users.updateOne({ _id: otherId }, { $pull: { 'location_sharing.hidden_from': user._id } }, { session });
    });
    this.hideEachOther(user._id, otherId);
    return { user_id: otherId.toHexString(), blocked: true };
  }

  /** Unblocking never restores the friendship. */
  async unblock(user: UserDoc, otherId: ObjectId): Promise<void> {
    await this.db.blocks.deleteOne({ blocker_id: user._id, blocked_id: otherId });
  }
}
