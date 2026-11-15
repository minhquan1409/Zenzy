import { CanActivate, ExecutionContext, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ObjectId } from 'mongodb';
import { ApiError } from '../common/http';
import { AppConfig } from './config';
import { Db, isDuplicateKey } from './db';
import { MailService } from './mail.service';
import { UserDoc } from './types';

/** One rate rule: at most `perUser` calls per signed-in user and `perIp` per IP in each window. */
export interface RateRule {
  bucket: string;
  windowSec: number;
  perUser?: number;
  perIp?: number;
}

/**
 * Marks a route that reads other people's data. Besides its own limits, such a route is refused
 * while the caller is paused for scraping (see AbuseService.recordProfileView).
 */
export const RateLimit = (...rules: RateRule[]) => SetMetadata('rateLimits', rules);

/** Every signed-in request counts here as well (a ceiling no normal app use comes close to). */
const DEFAULT_RULE: RateRule = { bucket: 'api', windowSec: 60, perUser: 600 };

const HOUR = 3600_000;

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Protection against mass data collection (scraping):
 * - rate limits per account and per IP (fixed windows counted in MongoDB, so they hold across restarts);
 * - a pause for accounts that open too many strangers' profiles, with an e-mail to the admin;
 * - a limit on how often the map / NEARBY search centre can jump far away (probing other cities).
 */
@Injectable()
export class AbuseService {
  private readonly log = new Logger('Abuse');

  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {}

  /** Counts one call against `max` per window; throws 429 RATE_LIMITED (with retry_after) when over. */
  async hit(key: string, max: number, windowSec: number): Promise<void> {
    const scale = this.config.rateLimitScale;
    if (!(scale > 0)) return;
    const limit = Math.ceil(max * scale);
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const start = Math.floor(now / windowMs) * windowMs;
    const _id = `${key}:${start}`;
    const bump = () =>
      this.db.rateCounters.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 }, $setOnInsert: { expires_at: new Date(start + windowMs) } },
        { upsert: true, returnDocument: 'after' },
      );
    let doc;
    try {
      doc = await bump();
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      doc = await bump(); // two first calls raced on the upsert
    }
    if ((doc?.count ?? 0) > limit) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests; please slow down and try again shortly', {
        retry_after: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
      });
    }
  }

  async applyRules(rules: RateRule[], user: UserDoc | undefined, ip: string): Promise<void> {
    for (const r of rules) {
      if (user && r.perUser) await this.hit(`${r.bucket}:u:${user._id.toHexString()}`, r.perUser, r.windowSec);
      if (r.perIp) await this.hit(`${r.bucket}:ip:${ip}`, r.perIp, r.windowSec);
    }
  }

  /** 429 BROWSING_PAUSED while the account is paused for scraping. */
  assertNotPaused(user: UserDoc): void {
    const until = user.browse_locked_until;
    if (until && until > new Date()) {
      throw new ApiError(429, 'BROWSING_PAUSED', 'Unusual activity: browsing is paused for a while', {
        retry_after: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)),
      });
    }
  }

  /**
   * Called when `viewer` opens the profile of someone who is not a friend. More than
   * `scrapeProfileLimit` different strangers in one hour pauses browsing for `scrapeLockMinutes`
   * and e-mails the admin.
   */
  async recordProfileView(viewer: UserDoc, targetId: ObjectId): Promise<void> {
    const res = await this.db.profileViews.updateOne(
      { viewer_id: viewer._id, target_id: targetId },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
    if (!res.upsertedCount) return;
    const since = new Date(Date.now() - HOUR);
    const distinct = await this.db.profileViews.countDocuments({ viewer_id: viewer._id, created_at: { $gt: since } });
    if (distinct <= this.config.scrapeProfileLimit) return;
    const until = new Date(Date.now() + this.config.scrapeLockMinutes * 60_000);
    await this.db.users.updateOne({ _id: viewer._id }, { $set: { browse_locked_until: until } });
    await this.db.profileViews.deleteMany({ viewer_id: viewer._id });
    this.log.warn(`paused browsing of ${viewer.username} until ${until.toISOString()} (${distinct} profiles in 1 h)`);
    await this.alertAdmin(`Zenzy: possible scraping by @${viewer.username}`, [
      `The account @${viewer.username} (id ${viewer._id.toHexString()}) opened ${distinct} profiles of people who are not its friends within one hour.`,
      `Its browsing (search, profiles, feed, map) is paused until ${until.toISOString()} (UTC).`,
      '',
      'If this looks like a bot, suspend the account from the admin page. Otherwise nothing needs to be done.',
    ]);
    this.assertNotPaused({ ...viewer, browse_locked_until: until });
  }

  /**
   * Map / NEARBY searches: moving the centre more than `geoJumpKm` within 10 minutes is a jump; more than
   * `geoJumpsPerHour` jumps in an hour answers 429 LOCATION_JUMP (sweeping other cities for posts, events or shops).
   */
  async checkSearchCenter(user: UserDoc, latitude: number, longitude: number): Promise<void> {
    if (!(this.config.rateLimitScale > 0)) return;
    const now = new Date();
    const prev = await this.db.searchCenters.findOne({ _id: user._id });
    let jumps = (prev?.jumps ?? []).filter((t) => t.getTime() > now.getTime() - HOUR);
    if (prev && now.getTime() - prev.at.getTime() < 10 * 60_000 && km(prev.latitude, prev.longitude, latitude, longitude) > this.config.geoJumpKm) {
      if (jumps.length >= this.config.geoJumpsPerHour) {
        const retry = Math.max(1, Math.ceil((jumps[0].getTime() + HOUR - now.getTime()) / 1000));
        throw new ApiError(429, 'LOCATION_JUMP', 'The search area changed too far too often; try again later', { retry_after: retry });
      }
      jumps = [...jumps, now];
    }
    await this.db.searchCenters.updateOne(
      { _id: user._id },
      { $set: { latitude, longitude, at: now, jumps } },
      { upsert: true },
    );
  }

  private async alertAdmin(subject: string, lines: string[]): Promise<void> {
    const to = this.config.adminAlertEmail;
    if (!to || !this.mail.configured) return;
    try {
      await this.mail.sendAdminAlert(to, subject, lines);
    } catch (e) {
      this.log.error(`admin alert e-mail failed: ${(e as Error).message}`);
    }
  }
}

/** Global guard after AuthGuard: applies the default limit and the route's @RateLimit rules. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abuse: AbuseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest();
    const user: UserDoc | undefined = req.user;
    const rules = this.reflector.getAllAndOverride<RateRule[]>('rateLimits', [ctx.getHandler(), ctx.getClass()]);
    if (user && rules?.length) this.abuse.assertNotPaused(user);
    await this.abuse.applyRules(user ? [DEFAULT_RULE, ...(rules ?? [])] : (rules ?? []), user, req.ip ?? 'unknown');
    return true;
  }
}
