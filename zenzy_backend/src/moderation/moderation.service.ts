import { Injectable } from '@nestjs/common';
import { ClientSession, ObjectId } from 'mongodb';
import { Err, escapeRegex, iso, publicUser } from '../common/http';
import { AccessService } from '../core/access.service';
import { Db, isDuplicateKey } from '../core/db';
import { RealtimeGateway } from '../core/realtime.gateway';
import { NotificationsService } from '../core/support.services';
import { EventDoc, PAGE_SIZE, PostDoc, REPORTS_TO_HIDE, ReportDoc, ReportTargetType, ShopDoc, UserDoc } from '../core/types';
import { eventSummary } from '../events/events.service';

export type ModerationAction = 'DISMISS' | 'REMOVE' | 'REMOVE_WARN' | 'REMOVE_SUSPEND';

type Target =
  | { type: 'POST'; doc: PostDoc; ownerId: ObjectId }
  | { type: 'EVENT'; doc: EventDoc; ownerId: ObjectId }
  | { type: 'SHOP'; doc: ShopDoc; ownerId: ObjectId }
  | { type: 'USER'; doc: UserDoc; ownerId: ObjectId };

@Injectable()
export class ModerationService {
  constructor(
    private readonly db: Db,
    private readonly access: AccessService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadTarget(type: ReportTargetType, id: ObjectId, session?: ClientSession): Promise<Target | null> {
    const o = { session };
    switch (type) {
      case 'POST': {
        const doc = await this.db.posts.findOne({ _id: id }, o);
        return doc ? { type, doc, ownerId: doc.author_id } : null;
      }
      case 'EVENT': {
        const doc = await this.db.events.findOne({ _id: id }, o);
        return doc ? { type, doc, ownerId: doc.host_id } : null;
      }
      case 'SHOP': {
        const doc = await this.db.shops.findOne({ _id: id }, o);
        return doc ? { type, doc, ownerId: doc.owner_id } : null;
      }
      case 'USER': {
        const doc = await this.db.users.findOne({ _id: id }, o);
        return doc ? { type, doc, ownerId: doc._id } : null;
      }
    }
  }

  /** Reporters may only report what they can see. */
  private async visibleTo(viewer: UserDoc, t: Target): Promise<boolean> {
    switch (t.type) {
      case 'POST':
        return t.doc.status !== 'REMOVED' && !(await this.access.blockedEitherWay(viewer._id, t.ownerId)) && (t.doc.status === 'ACTIVE' || t.doc.status === 'HIDDEN');
      case 'EVENT':
        return t.doc.status === 'HIDDEN' || (await this.access.canSeeEvent(viewer, t.doc));
      case 'SHOP':
        return t.doc.status === 'APPROVED';
      case 'USER':
        return !(await this.access.hasBlocked(t.ownerId, viewer._id));
    }
  }

  // ---------------------------------------------------------------------------
  // POST /reports (UC-16, SEQ-05)
  // ---------------------------------------------------------------------------

  async report(user: UserDoc, input: { target_type: ReportTargetType; target_id: ObjectId; reason: string; note: string }) {
    const target = await this.loadTarget(input.target_type, input.target_id);
    if (!target || !(await this.visibleTo(user, target))) throw Err.notFound('Reported item not found');
    if (target.ownerId.equals(user._id)) throw Err.badRequest('OWN_CONTENT', 'You cannot report your own content');

    const doc: ReportDoc = {
      _id: new ObjectId(),
      reporter_id: user._id,
      target_type: input.target_type,
      target_id: input.target_id,
      reason: input.reason,
      note: input.note,
      status: 'OPEN',
      created_at: new Date(),
    };
    try {
      await this.db.reports.insertOne(doc); // unique (reporter_id, target_type, target_id)
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      const existing = await this.db.reports.findOne({ reporter_id: user._id, target_type: input.target_type, target_id: input.target_id });
      return { created: false, report: this.reportView(existing!), hidden: await this.isHidden(input.target_type, input.target_id) };
    }

    // BR-03: once 3 distinct users have open reports on it, a post or event is hidden until an admin
    // reviews it. Shops are never hidden by reports: only an admin hides, blocks or bans a shop.
    const openReporters = await this.db.reports.countDocuments({ target_type: input.target_type, target_id: input.target_id, status: 'OPEN' });
    let hidden = await this.isHidden(input.target_type, input.target_id);
    if (input.target_type !== 'SHOP' && openReporters >= REPORTS_TO_HIDE && !hidden) {
      await this.hide(target);
      hidden = await this.isHidden(input.target_type, input.target_id);
    }
    return { created: true, report: this.reportView(doc), hidden };
  }

  private async isHidden(type: ReportTargetType, id: ObjectId): Promise<boolean> {
    switch (type) {
      case 'POST':
        return (await this.db.posts.countDocuments({ _id: id, status: 'HIDDEN' })) > 0;
      case 'EVENT':
        return (await this.db.events.countDocuments({ _id: id, status: 'HIDDEN' })) > 0;
      case 'SHOP':
        return (await this.db.shops.countDocuments({ _id: id, hidden: true })) > 0;
      case 'USER':
        return false; // accounts are never auto-hidden; an admin decides (see README open questions)
    }
  }

  private async hide(t: Target): Promise<void> {
    const now = new Date();
    if (t.type === 'POST') {
      await this.db.posts.updateOne({ _id: t.doc._id, status: 'ACTIVE' }, { $set: { status: 'HIDDEN', updated_at: now } });
    } else if (t.type === 'EVENT') {
      if (t.doc.status !== 'OPEN' && t.doc.status !== 'FULL') return;
      const viewers = await this.access.filterEventViewers(t.doc, await this.realtime.connectedUserIds());
      const res = await this.db.events.updateOne(
        { _id: t.doc._id, status: t.doc.status },
        { $set: { status: 'HIDDEN', status_before_hidden: t.doc.status, updated_at: now } },
      );
      if (res.modifiedCount) this.realtime.emitToUsers(viewers, 'event:updated', { id: t.doc._id.toHexString(), status: 'HIDDEN' });
    } else if (t.type === 'SHOP') {
      await this.db.shops.updateOne({ _id: t.doc._id }, { $set: { hidden: true, updated_at: now } });
    }
  }

  private reportView(r: ReportDoc) {
    return {
      id: r._id.toHexString(),
      target_type: r.target_type,
      target_id: r.target_id.toHexString(),
      reason: r.reason,
      note: r.note,
      status: r.status,
      created_at: iso(r.created_at),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /admin/reports (UC-19): one row per reported item, most reported first, then oldest first
  // ---------------------------------------------------------------------------

  async queue(status: 'OPEN' | 'RESOLVED', cursor?: string) {
    const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) : 0;
    if (!Number.isInteger(offset) || offset < 0) throw Err.badRequest('INVALID_CURSOR', 'cursor is not valid');
    const groups = await this.db.reports
      .aggregate<{
        _id: { target_type: ReportTargetType; target_id: ObjectId };
        report_count: number;
        first_report_id: ObjectId;
        first_reported_at: Date;
        last_reported_at: Date;
        reasons: string[];
        notes: string[];
      }>([
        { $match: { status } },
        { $sort: { created_at: 1 } },
        {
          $group: {
            _id: { target_type: '$target_type', target_id: '$target_id' },
            report_count: { $sum: 1 },
            first_report_id: { $first: '$_id' },
            first_reported_at: { $first: '$created_at' },
            last_reported_at: { $last: '$created_at' },
            reasons: { $addToSet: '$reason' },
            notes: { $push: '$note' },
          },
        },
        { $sort: { report_count: -1, first_reported_at: 1 } },
        { $skip: offset },
        { $limit: PAGE_SIZE + 1 },
      ])
      .toArray();

    const items = await Promise.all(
      groups.slice(0, PAGE_SIZE).map(async (g) => {
        const target = await this.loadTarget(g._id.target_type, g._id.target_id);
        return {
          report_id: g.first_report_id.toHexString(),
          target_type: g._id.target_type,
          target_id: g._id.target_id.toHexString(),
          report_count: g.report_count,
          reasons: g.reasons,
          notes: g.notes.filter(Boolean),
          first_reported_at: iso(g.first_reported_at),
          last_reported_at: iso(g.last_reported_at),
          target: target ? await this.targetSummary(target) : null, // null: already deleted by its owner
        };
      }),
    );
    return {
      items,
      next_cursor: groups.length > PAGE_SIZE ? Buffer.from(String(offset + PAGE_SIZE)).toString('base64url') : null,
    };
  }

  private async targetSummary(t: Target) {
    const owner = publicUser(await this.db.users.findOne({ _id: t.ownerId }));
    switch (t.type) {
      case 'POST':
        return { owner, status: t.doc.status, text: t.doc.text, photo_urls: t.doc.photos, created_at: iso(t.doc.created_at) };
      case 'EVENT':
        return { owner, ...eventSummary(t.doc) };
      case 'SHOP':
        return { owner, status: t.doc.status, hidden: t.doc.hidden, name: t.doc.name, description: t.doc.description, address: t.doc.address };
      case 'USER':
        return { owner, status: t.doc.status, bio: t.doc.bio, warnings: t.doc.warnings };
    }
  }

  // ---------------------------------------------------------------------------
  // PATCH /admin/reports/{id} (UC-19, UC-20, SEQ-05): one transaction for content, reports and audit log
  // ---------------------------------------------------------------------------

  async resolve(admin: UserDoc, reportId: ObjectId, action: ModerationAction, reason: string) {
    const report = await this.db.reports.findOne({ _id: reportId });
    if (!report) throw Err.notFound('Report not found');
    const now = new Date();
    const resolution = { action, reason, admin_id: admin._id, at: now };

    const outcome = await this.db.tx(async (session) => {
      // Two admins at once: the conditional update lets only the first one through.
      const claimed = await this.db.reports.updateOne({ _id: report._id, status: 'OPEN' }, { $set: { status: 'RESOLVED', resolution } }, { session });
      if (!claimed.modifiedCount) throw Err.conflict('ALREADY_RESOLVED', 'This report was already resolved');
      await this.db.reports.updateMany(
        { target_type: report.target_type, target_id: report.target_id, status: 'OPEN' },
        { $set: { status: 'RESOLVED', resolution } },
        { session },
      );

      const target = await this.loadTarget(report.target_type, report.target_id, session);
      let applied: string = action;
      if (!target) {
        applied = 'TARGET_ALREADY_DELETED';
      } else if (action === 'DISMISS') {
        await this.restore(target, session, now);
      } else {
        if (target.type === 'USER' && target.ownerId.equals(admin._id)) throw Err.badRequest('INVALID_INPUT', 'You cannot moderate your own account');
        await this.remove(target, reason, session, now);
        if (action === 'REMOVE_WARN') await this.db.users.updateOne({ _id: target.ownerId }, { $inc: { warnings: 1 } }, { session });
        if (action === 'REMOVE_SUSPEND') await this.suspendInTx(target.ownerId, reason, session, now);
      }
      // BR-07: insert-only audit entry, written in the same transaction.
      await this.db.auditLog.insertOne(
        {
          admin_id: admin._id,
          action: `REPORT_${action}`,
          applied,
          target_type: report.target_type,
          target_id: report.target_id,
          report_id: report._id,
          reason,
          created_at: now,
        },
        { session },
      );
      return { target, applied };
    });

    if (outcome.target) await this.afterResolve(outcome.target, action, reason);
    return {
      report_id: report._id.toHexString(),
      status: 'RESOLVED',
      action,
      applied: outcome.applied,
      target_type: report.target_type,
      target_id: report.target_id.toHexString(),
    };
  }

  private async restore(t: Target, session: ClientSession, now: Date): Promise<void> {
    const o = { session };
    if (t.type === 'POST') await this.db.posts.updateOne({ _id: t.doc._id, status: 'HIDDEN' }, { $set: { status: 'ACTIVE', updated_at: now } }, o);
    if (t.type === 'EVENT' && t.doc.status === 'HIDDEN') {
      const back = t.doc.ends_at <= now ? 'ENDED' : (t.doc.status_before_hidden ?? 'OPEN');
      await this.db.events.updateOne({ _id: t.doc._id }, { $set: { status: back, status_before_hidden: null, updated_at: now } }, o);
    }
    if (t.type === 'SHOP') await this.db.shops.updateOne({ _id: t.doc._id }, { $set: { hidden: false, updated_at: now } }, o);
  }

  private async remove(t: Target, reason: string, session: ClientSession, now: Date): Promise<void> {
    const o = { session };
    if (t.type === 'POST') await this.db.posts.updateOne({ _id: t.doc._id }, { $set: { status: 'REMOVED', updated_at: now } }, o);
    if (t.type === 'EVENT') await this.db.events.updateOne({ _id: t.doc._id }, { $set: { status: 'REMOVED', updated_at: now } }, o);
    if (t.type === 'SHOP') {
      // The shop status enum has no REMOVED value: a removed shop is REJECTED (invisible) with the reason.
      await this.db.shops.updateOne(
        { _id: t.doc._id },
        { $set: { status: 'REJECTED', hidden: true, reject_reason: reason, updated_at: now } },
        o,
      );
      await this.db.deals.updateMany({ shop_id: t.doc._id, status: 'ACTIVE' }, { $set: { status: 'CANCELLED', updated_at: now } }, o);
    }
    if (t.type === 'USER') {
      // "Removing" a reported profile clears the user-written parts of it.
      await this.db.users.updateOne({ _id: t.doc._id }, { $set: { display_name: t.doc.username, bio: '', avatar_url: null, updated_at: now } }, o);
    }
  }

  private async suspendInTx(userId: ObjectId, reason: string, session: ClientSession, now: Date): Promise<void> {
    await this.db.users.updateOne({ _id: userId }, { $set: { status: 'SUSPENDED', suspend_reason: reason, updated_at: now } }, { session });
    await this.db.refreshTokens.deleteMany({ user_id: userId }, { session });
    await this.db.userLocations.deleteOne({ _id: userId }, { session });
  }

  private async afterSuspend(userId: ObjectId): Promise<void> {
    const friends = await this.access.friendIds(userId);
    this.realtime.emitToUsers(friends, 'location:hide', { user_id: userId.toHexString() });
    this.realtime.disconnectUser(userId);
  }

  private async afterResolve(t: Target, action: ModerationAction, reason: string): Promise<void> {
    if (t.type === 'EVENT' && action !== 'DISMISS') {
      this.realtime.emitToUsers(await this.realtime.connectedUserIds(), 'event:updated', { id: t.doc._id.toHexString(), status: 'REMOVED' });
    }
    const what = t.type === 'USER' ? 'your profile' : `your ${t.type.toLowerCase()}`;
    const message =
      action === 'DISMISS'
        ? `A report about ${what} was reviewed and no action was taken`
        : `${what[0].toUpperCase()}${what.slice(1)} was removed by a moderator: ${reason}${action === 'REMOVE_SUSPEND' ? '. Your account is suspended' : ''}`;
    await this.notifications.notify(t.ownerId, 'MODERATION', message, {
      target_type: t.type,
      target_id: t.doc._id.toHexString(),
      action,
      reason,
    });
    if (action === 'REMOVE_SUSPEND') await this.afterSuspend(t.ownerId);
  }

  // ---------------------------------------------------------------------------
  // Shops (UC-18)
  // ---------------------------------------------------------------------------

  async shops(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const shops = await this.db.shops.find({ status }).sort({ created_at: 1 }).limit(200).toArray();
    const owners = await this.db.users.find({ _id: { $in: shops.map((s) => s.owner_id) } }).toArray();
    const byId = new Map(owners.map((u) => [u._id.toHexString(), u]));
    return {
      items: shops.map((s) => ({
        id: s._id.toHexString(),
        owner: publicUser(byId.get(s.owner_id.toHexString())),
        name: s.name,
        description: s.description,
        address: s.address,
        latitude: s.loc.coordinates[1],
        longitude: s.loc.coordinates[0],
        menu: s.menu,
        status: s.status,
        hidden: s.hidden,
        reject_reason: s.reject_reason,
        created_at: iso(s.created_at),
      })),
    };
  }

  async reviewShop(admin: UserDoc, shopId: ObjectId, decision: 'APPROVE' | 'REJECT', reason: string | null) {
    if (decision === 'REJECT' && !reason) throw Err.badRequest('INVALID_INPUT', 'reason is required to reject a shop');
    const now = new Date();
    const shop = await this.db.tx(async (session) => {
      const updated = await this.db.shops.findOneAndUpdate(
        { _id: shopId, status: 'PENDING' },
        {
          $set: {
            status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            reviewed_by: admin._id,
            reject_reason: decision === 'REJECT' ? reason : null,
            updated_at: now,
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) {
        const exists = await this.db.shops.countDocuments({ _id: shopId }, { session, limit: 1 });
        if (!exists) throw Err.notFound('Shop not found');
        throw Err.conflict('SHOP_NOT_PENDING', 'This shop is not waiting for review');
      }
      await this.db.auditLog.insertOne(
        { admin_id: admin._id, action: `SHOP_${decision}`, target_type: 'SHOP', target_id: shopId, reason: reason ?? '', created_at: now },
        { session },
      );
      return updated;
    });
    await this.notifications.notify(
      shop.owner_id,
      'SHOP_REVIEW',
      decision === 'APPROVE' ? `Your shop "${shop.name}" was approved and is now on the map` : `Your shop "${shop.name}" was rejected: ${reason}`,
      { shop_id: shop._id.toHexString(), status: shop.status, reason },
    );
    return { id: shop._id.toHexString(), status: shop.status, reviewed_by: admin._id.toHexString(), reject_reason: shop.reject_reason };
  }

  // ---------------------------------------------------------------------------
  // Accounts (UC-20)
  // ---------------------------------------------------------------------------

  async users(q: string) {
    const users = await this.db.users
      .find(q ? { username: { $regex: `^${escapeRegex(q.toLowerCase())}` } } : {})
      .sort({ username: 1 })
      .limit(50)
      .toArray();
    return {
      items: await Promise.all(
        users.map(async (u) => {
          const [postIds, eventIds, shopIds] = await Promise.all([
            this.db.posts.distinct('_id', { author_id: u._id }),
            this.db.events.distinct('_id', { host_id: u._id }),
            this.db.shops.distinct('_id', { owner_id: u._id }),
          ]);
          const [profileReports, contentReports, openReports] = await Promise.all([
            this.db.reports.countDocuments({ target_type: 'USER', target_id: u._id }),
            this.db.reports.countDocuments({ target_id: { $in: [...postIds, ...eventIds, ...shopIds] } }),
            this.db.reports.countDocuments({
              status: 'OPEN',
              $or: [{ target_type: 'USER', target_id: u._id }, { target_id: { $in: [...postIds, ...eventIds, ...shopIds] } }],
            }),
          ]);
          return {
            ...publicUser(u),
            role: u.role,
            status: u.status,
            suspend_reason: u.suspend_reason,
            warnings: u.warnings,
            created_at: iso(u.created_at),
            report_counts: { profile: profileReports, content: contentReports, open: openReports },
          };
        }),
      ),
    };
  }

  async setUserStatus(admin: UserDoc, userId: ObjectId, status: 'SUSPENDED' | 'ACTIVE', reason: string) {
    if (userId.equals(admin._id)) throw Err.badRequest('INVALID_INPUT', 'You cannot change your own account status');
    const now = new Date();
    await this.db.tx(async (session) => {
      const user = await this.db.users.findOne({ _id: userId }, { session });
      if (!user) throw Err.notFound('User not found');
      if (status === 'SUSPENDED') await this.suspendInTx(userId, reason, session, now);
      else await this.db.users.updateOne({ _id: userId }, { $set: { status: 'ACTIVE', suspend_reason: null, updated_at: now } }, { session });
      await this.db.auditLog.insertOne(
        { admin_id: admin._id, action: status === 'SUSPENDED' ? 'USER_SUSPEND' : 'USER_RESTORE', target_type: 'USER', target_id: userId, reason, created_at: now },
        { session },
      );
    });
    if (status === 'SUSPENDED') await this.afterSuspend(userId);
    await this.notifications.notify(
      userId,
      'ACCOUNT',
      status === 'SUSPENDED' ? `Your account was suspended: ${reason}` : `Your account was restored: ${reason}`,
      { status, reason },
    );
    return { id: userId.toHexString(), status, reason };
  }
}
