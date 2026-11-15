import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { notificationSettingsOf, privacyOf, selfUser, AuthService } from '../auth/auth.service';
import { Err, escapeRegex, publicUser } from '../common/http';
import { AbuseService } from '../core/abuse.service';
import { AccessService, otherOf } from '../core/access.service';
import { Db } from '../core/db';
import { MediaService } from '../core/media.service';
import { RealtimeGateway } from '../core/realtime.gateway';
import { NotificationsService } from '../core/support.services';
import { UserDoc } from '../core/types';

@Injectable()
export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly auth: AuthService,
    private readonly media: MediaService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly abuse: AbuseService,
  ) {}

  async stats(userId: ObjectId) {
    const [friends, events, posts] = await Promise.all([
      this.db.friendships.countDocuments({ $or: [{ user_a: userId }, { user_b: userId }], status: 'ACCEPTED' }),
      this.db.participants.countDocuments({ user_id: userId, status: 'APPROVED' }),
      this.db.posts.countDocuments({ author_id: userId, status: 'ACTIVE' }),
    ]);
    return { friends_count: friends, events_joined: events, posts_count: posts };
  }

  async me(user: UserDoc) {
    return {
      profile: { ...selfUser(user, await this.auth.hasPassword(user._id)), ...(await this.stats(user._id)) },
      privacy: privacyOf(user),
      notification_settings: notificationSettingsOf(user),
    };
  }

  /**
   * PATCH /me. Changing the e-mail needs the password (or a fresh Google ID token for Google-only
   * accounts): the e-mail receives password-reset codes, so a stolen access token alone must not be
   * enough to point it at another inbox and take the account over.
   */
  async updateProfile(
    user: UserDoc,
    patch: { display_name?: string; avatar_url?: string | null; bio?: string; email?: string | null },
    reauth: { password?: string; idToken?: string } = {},
  ) {
    if (patch.avatar_url) this.media.assertOwnMediaUrls([patch.avatar_url]);
    if (patch.email !== undefined && (patch.email ?? null) !== (user.email ?? null)) {
      if (!(await this.auth.verifyOwner(user, reauth.password, reauth.idToken))) {
        throw Err.forbidden('REAUTH_REQUIRED', 'Enter your password (or sign in with Google again) to change your e-mail');
      }
    }
    if (patch.email && (await this.db.users.countDocuments({ email: patch.email, _id: { $ne: user._id } }, { limit: 1 }))) {
      throw Err.conflict('EMAIL_TAKEN', 'This e-mail is already linked to another account');
    }
    const updated = await this.db.users.findOneAndUpdate(
      { _id: user._id },
      { $set: { ...patch, updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    return selfUser(updated!, await this.auth.hasPassword(user._id));
  }

  async setGuardianConsent(user: UserDoc, confirmed: boolean) {
    await this.db.users.updateOne({ _id: user._id }, { $set: { guardian_consent: confirmed, updated_at: new Date() } });
    return { guardian_consent: confirmed };
  }

  /** Public profile. A user who blocked the caller looks like a user that does not exist (404). */
  async profile(viewer: UserDoc, userId: ObjectId) {
    const target = await this.db.users.findOne({ _id: userId });
    if (!target || (await this.access.hasBlocked(userId, viewer._id))) throw Err.notFound('User not found');
    const blockedByMe = await this.access.hasBlocked(viewer._id, userId);
    const f = userId.equals(viewer._id) ? null : await this.access.friendship(viewer._id, userId);
    let friendship_status = 'NONE';
    if (userId.equals(viewer._id)) friendship_status = 'SELF';
    else if (blockedByMe) friendship_status = 'BLOCKED';
    else if (f?.status === 'ACCEPTED') friendship_status = 'FRIENDS';
    else if (f?.status === 'PENDING') friendship_status = f.requested_by.equals(viewer._id) ? 'PENDING_OUTGOING' : 'PENDING_INCOMING';
    // Scraping detection: opening many strangers' profiles in a short time pauses browsing.
    if (friendship_status === 'NONE') await this.abuse.recordProfileView(viewer, userId);
    return {
      ...publicUser(target),
      bio: target.bio,
      ...(await this.stats(userId)),
      friendship_status,
      friend_request_id: f?.status === 'PENDING' ? f._id.toHexString() : null,
      close_friend: !!f && f.close_for.some((id) => id.equals(viewer._id)),
    };
  }

  /**
   * Search by username prefix (UC-05); blocked users (either direction) are excluded. Against mass
   * collection: at least 3 characters (checked by the controller), 10 results, no bio, and users who
   * turned "discoverable" off are found only by their exact username.
   */
  async search(viewer: UserDoc, username: string) {
    const name = username.toLowerCase();
    const blocked = await this.access.blockRelatedIds(viewer._id);
    const users = await this.db.users
      .find({
        username: { $regex: `^${escapeRegex(name)}` },
        $or: [{ discoverable: { $ne: false } }, { username: name }],
        _id: { $nin: [...blocked, viewer._id] },
        role: 'USER',
        status: 'ACTIVE',
      })
      .sort({ username: 1 })
      .limit(10)
      .toArray();
    return { items: users.map((u) => publicUser(u)) };
  }

  /**
   * NFR-10: permanent removal of the account's personal data and media. It runs immediately,
   * which satisfies the 72-hour limit; the endpoint answers 202 as specified.
   */
  async deleteAccount(user: UserDoc, password?: string, idToken?: string): Promise<void> {
    if (!(await this.auth.verifyOwner(user, password, idToken))) {
      throw Err.forbidden('REAUTH_FAILED', 'Password or Google ID token is wrong');
    }
    const id = user._id;
    const hosted = await this.db.events.find({ host_id: id }).toArray();
    const activeHosted = hosted.filter((e) => e.status === 'OPEN' || e.status === 'FULL');
    const friendships = await this.db.friendships.find({ $or: [{ user_a: id }, { user_b: id }] }).toArray();
    const affected = await this.db.participants
      .find({ event_id: { $in: activeHosted.map((e) => e._id) }, status: { $in: ['PENDING', 'APPROVED'] } })
      .toArray();

    await this.db.tx(async (session) => {
      const o = { session };
      const postIds = (await this.db.posts.find({ author_id: id }, { session, projection: { _id: 1 } }).toArray()).map((p) => p._id);
      const eventIds = hosted.map((e) => e._id);
      const shopIds = (await this.db.shops.find({ owner_id: id }, { session, projection: { _id: 1 } }).toArray()).map((s) => s._id);

      // counters on other people's posts, then the user's own reactions
      const liked = await this.db.postLikes.find({ user_id: id }, o).toArray();
      if (liked.length) await this.db.posts.updateMany({ _id: { $in: liked.map((l) => l.post_id) } }, { $inc: { like_count: -1 } }, o);
      const comments = await this.db.postComments.find({ author_id: id }, o).toArray();
      for (const c of comments) await this.db.posts.updateOne({ _id: c.post_id }, { $inc: { comment_count: -1 } }, o);
      await this.db.postLikes.deleteMany({ $or: [{ user_id: id }, { post_id: { $in: postIds } }] }, o);
      await this.db.postComments.deleteMany({ $or: [{ author_id: id }, { post_id: { $in: postIds } }] }, o);
      await this.db.savedPosts.deleteMany({ $or: [{ user_id: id }, { post_id: { $in: postIds } }] }, o);
      await this.db.posts.deleteMany({ author_id: id }, o);

      // events hosted by the user, and seats held in other events
      const seats = await this.db.participants.find({ user_id: id, status: 'APPROVED' }, o).toArray();
      for (const s of seats) {
        await this.db.events.updateOne({ _id: s.event_id }, { $inc: { approved_count: -1 } }, o);
        await this.db.events.updateOne({ _id: s.event_id, status: 'FULL' }, { $set: { status: 'OPEN' } }, o);
      }
      await this.db.participants.deleteMany({ $or: [{ user_id: id }, { event_id: { $in: eventIds } }] }, o);
      await this.db.events.deleteMany({ host_id: id }, o);

      await this.db.deals.deleteMany({ shop_id: { $in: shopIds } }, o);
      await this.db.shops.deleteMany({ owner_id: id }, o);

      // chat: direct and event chats of the user disappear; the user leaves group chats
      const gone = await this.db.conversations
        .find({ $or: [{ type: 'DIRECT', member_ids: id }, { event_id: { $in: eventIds } }] }, { session, projection: { _id: 1 } })
        .toArray();
      const goneIds = gone.map((c) => c._id);
      await this.db.messages.deleteMany({ $or: [{ sender_id: id }, { conversation_id: { $in: goneIds } }] }, o);
      await this.db.conversations.deleteMany({ _id: { $in: goneIds } }, o);
      await this.db.conversations.updateMany({ member_ids: id }, { $pull: { member_ids: id, muted_by: id, hidden_for: id } }, o);

      await this.db.friendships.deleteMany({ $or: [{ user_a: id }, { user_b: id }] }, o);
      await this.db.blocks.deleteMany({ $or: [{ blocker_id: id }, { blocked_id: id }] }, o);
      await this.db.users.updateMany({ 'location_sharing.hidden_from': id }, { $pull: { 'location_sharing.hidden_from': id } }, o);
      await this.db.userLocations.deleteOne({ _id: id }, o);
      await this.db.notifications.deleteMany({ user_id: id }, o);
      await this.db.deviceTokens.deleteMany({ user_id: id }, o);
      await this.db.reports.deleteMany(
        { $or: [{ reporter_id: id }, { target_type: 'USER', target_id: id }, { target_id: { $in: [...postIds, ...eventIds, ...shopIds] } }] },
        o,
      );
      await this.db.idempotencyKeys.deleteMany({ user_id: id }, o);
      await this.db.refreshTokens.deleteMany({ user_id: id }, o);
      await this.db.credentials.deleteMany({ user_id: id }, o);
      await this.db.users.deleteOne({ _id: id }, o);
    });

    await this.media.deleteUserMedia(id);
    this.realtime.emitToUsers(friendships.map((f) => otherOf(f, id)), 'location:hide', { user_id: id.toHexString() });
    this.realtime.disconnectUser(id);
    for (const m of affected) {
      const e = activeHosted.find((x) => x._id.equals(m.event_id))!;
      await this.notifications.notify(m.user_id, 'EVENT_UPDATE', `"${e.title}" was cancelled`, {
        event_id: e._id.toHexString(),
        status: 'CANCELLED',
      });
    }
  }
}
