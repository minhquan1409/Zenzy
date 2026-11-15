import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { ApiError, Err } from '../common/http';
import { AppConfig } from '../core/config';
import { Db } from '../core/db';
import { MailService } from '../core/mail.service';
import { IpBlockDoc } from '../core/types';
import { AuthService, selfUser } from './auth.service';

/** Same cost as real hashes, so an unknown admin username takes as long as a wrong password. */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z8W5f2T1p9o9m1S8u5l0W5p0Yq7dK';

type Scope = IpBlockDoc['scope'];

/**
 * Areas guarded per IP instead of per account:
 * - the admin web page: 3 wrong sign-ins block the IP (24 hours by default) and e-mail an alert;
 * - the APK download page: 10 wrong passwords block the IP (24 hours by default).
 */
@Injectable()
export class SecurityService {
  private readonly log = new Logger('Security');

  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async blockOf(ip: string, scope: Scope): Promise<IpBlockDoc | null> {
    return this.db.ipBlocks.findOne({ ip, scope, until: { $gt: new Date() } });
  }

  private blockedError(block: IpBlockDoc): ApiError {
    const seconds = Math.max(1, Math.ceil((block.until.getTime() - Date.now()) / 1000));
    return new ApiError(403, 'IP_BLOCKED', 'Too many wrong passwords from this network. Access is blocked for now.', {
      retry_after: seconds,
    });
  }

  /** Throws 403 IP_BLOCKED while the IP is blocked from the admin area (used by AuthGuard for /admin routes). */
  async assertAdminIpAllowed(ip: string): Promise<void> {
    const block = await this.blockOf(ip, 'ADMIN');
    if (block) throw this.blockedError(block);
  }

  /** Records a failure and blocks the IP once it reached `max` in 24 hours. Returns the block, if any. */
  private async recordFailure(scope: Scope, ip: string, max: number, hours: number, detail: { username?: string; user_agent?: string }) {
    const now = new Date();
    await this.db.securityFailures.insertOne({ scope, ip, created_at: now, ...detail });
    const since = new Date(now.getTime() - 24 * 3600_000);
    const count = await this.db.securityFailures.countDocuments({ scope, ip, created_at: { $gt: since } });
    if (count < max) return { count, block: null };
    const block: IpBlockDoc = {
      ip,
      scope,
      until: new Date(now.getTime() + hours * 3600_000),
      reason: `${count} wrong passwords in 24 hours`,
      created_at: now,
    };
    await this.db.ipBlocks.updateOne({ ip, scope }, { $set: block }, { upsert: true });
    this.log.warn(`blocked ${ip} from ${scope} for ${hours} h after ${count} wrong passwords`);
    return { count, block };
  }

  /**
   * POST /admin/login: the only way an ADMIN account signs in (the app's /auth/login refuses admins).
   * After `adminMaxFailures` wrong tries from one IP in 24 hours the IP is blocked from the admin area
   * and the administrator gets an e-mail with the details.
   */
  async adminLogin(username: string, password: string, ip: string, userAgent: string) {
    await this.assertAdminIpAllowed(ip);
    const user = await this.db.users.findOne({ username });
    const cred = user?.role === 'ADMIN' ? await this.db.credentials.findOne({ user_id: user._id }) : null;
    const ok = await bcrypt.compare(password, cred?.password_hash ?? DUMMY_HASH);
    if (!user || !cred || !ok) {
      const max = this.config.adminMaxFailures;
      const { count, block } = await this.recordFailure('ADMIN', ip, max, this.config.adminBlockHours, {
        username: username.slice(0, 64),
        user_agent: userAgent.slice(0, 300),
      });
      if (block) {
        await this.alertAdminBlocked(block, ip);
        throw this.blockedError(block);
      }
      throw Err.unauthorized('INVALID_CREDENTIALS', `Wrong username or password. ${max - count} attempt(s) left before this network is blocked.`);
    }
    if (user.status !== 'ACTIVE') throw Err.forbidden('ACCOUNT_SUSPENDED', 'This admin account is suspended');
    await this.db.securityFailures.deleteMany({ scope: 'ADMIN', ip });
    return { user: selfUser(user, true), tokens: await this.auth.issueTokens(user) };
  }

  private async alertAdminBlocked(block: IpBlockDoc, ip: string): Promise<void> {
    const to = this.config.adminAlertEmail;
    if (!to || !this.mail.configured) {
      this.log.warn('admin alert e-mail not sent: ADMIN_ALERT_EMAIL or SMTP is not configured');
      return;
    }
    const tries = await this.db.securityFailures
      .find({ scope: 'ADMIN', ip, created_at: { $gt: new Date(Date.now() - 24 * 3600_000) } })
      .sort({ created_at: 1 })
      .toArray();
    const lines = [
      `IP ${ip} was blocked from the admin page after ${tries.length} wrong sign-ins.`,
      `Blocked until: ${block.until.toISOString()} (UTC)`,
      '',
      'Attempts (UTC time, username tried, browser):',
      ...tries.map((t) => `- ${t.created_at.toISOString()} | ${t.username ?? '?'} | ${t.user_agent ?? '?'}`),
      '',
      'If this was you, wait until the block ends or remove the row for this IP from the ip_blocks collection.',
    ];
    try {
      await this.mail.sendAdminAlert(to, `Admin page: IP ${ip} blocked`, lines);
    } catch (e) {
      this.log.error(`admin alert e-mail failed: ${(e as Error).message}`);
    }
  }

  /**
   * GET /internal/download-auth, called by Caddy (forward_auth) for every /download/ request with the
   * browser's Basic credentials. 204 lets the request through; 401 makes the browser ask again.
   */
  async checkDownload(authorization: string | undefined, ip: string): Promise<void> {
    const block = await this.blockOf(ip, 'DOWNLOAD');
    if (block) throw this.blockedError(block);
    if (!this.config.downloadUser || !this.config.downloadPasswordHash.startsWith('$2')) {
      throw new ApiError(503, 'DOWNLOAD_NOT_CONFIGURED', 'The download page password is not configured');
    }
    const challenge = () => new ApiError(401, 'UNAUTHENTICATED', 'Username and password required');
    if (!authorization?.startsWith('Basic ')) throw challenge();
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    const user = colon < 0 ? decoded : decoded.slice(0, colon);
    const pass = colon < 0 ? '' : decoded.slice(colon + 1);
    const a = Buffer.from(user);
    const b = Buffer.from(this.config.downloadUser);
    const userOk = a.length === b.length && timingSafeEqual(a, b);
    const passOk = await bcrypt.compare(pass, this.config.downloadPasswordHash);
    if (userOk && passOk) return;
    const { block: newBlock } = await this.recordFailure('DOWNLOAD', ip, this.config.downloadMaxFailures, this.config.downloadBlockHours, {
      username: user.slice(0, 64),
    });
    if (newBlock) throw this.blockedError(newBlock);
    throw challenge();
  }
}
