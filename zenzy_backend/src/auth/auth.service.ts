import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { ApiError, Err, iso } from '../common/http';
import { AppConfig } from '../core/config';
import { MailService } from '../core/mail.service';
import { Db, isDuplicateKey } from '../core/db';
import { LoginFailures, NOTIFICATION_TYPES, UserDoc } from '../core/types';

export interface GoogleIdentity {
  sub: string;
  name?: string;
  picture?: string;
  /** Verified e-mail of the Google account, when Google says it is verified. */
  email?: string;
}

/** Verifies a Google ID token (UC-01). Replaced by a fake in the automated tests. */
@Injectable()
export class GoogleVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: AppConfig) {}

  async verify(idToken: string): Promise<GoogleIdentity | null> {
    if (!this.config.googleClientIds.length) return null;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.config.googleClientIds });
      const p = ticket.getPayload();
      return p?.sub ? { sub: p.sub, name: p.name, picture: p.picture, email: p.email_verified ? p.email : undefined } : null;
    } catch {
      return null;
    }
  }
}

/** Failed logins allowed per IP every 15 minutes (any username), against password spraying. */
const MAX_FAILED_LOGINS_PER_IP = 30;
/** Wrong passwords in a row on one account -> how long it is locked (seconds). */
const LOGIN_LOCK_STEPS: Array<[failures: number, seconds: number]> = [
  [5, 60],
  [10, 300],
  [15, 600],
];
/** From this many wrong passwords in a row the account can only sign in again after a password reset. */
const LOGIN_RESET_REQUIRED_AT = 20;
/** Failures older than this no longer count. */
const LOGIN_FAILURE_MEMORY_MS = 24 * 3600_000;
/** A used refresh token presented again within this time is a race of the same client, not a theft. */
const REFRESH_REUSE_GRACE_MS = 10_000;
/** Same cost as real hashes, so an unknown username takes as long as a wrong password. */
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z8W5f2T1p9o9m1S8u5l0W5p0Yq7dK';
/** Wrong password-reset codes allowed per account in RESET_FAILURE_WINDOW_MS (about 10 in a million). */
const RESET_MAX_FAILURES = 10;
const RESET_FAILURE_WINDOW_MS = 24 * 3600_000;

export function ageOn(dob: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** NFR-20: under 16 needs recorded guardian consent before location sharing can be enabled. */
export function needsGuardianConsent(u: UserDoc): boolean {
  return ageOn(u.date_of_birth) < 16 && !u.guardian_consent;
}

export function privacyOf(u: UserDoc) {
  const s = u.location_sharing;
  return {
    ghost_mode: u.ghost_mode,
    sharing_enabled: s.enabled && (s.until === null || s.until > new Date()),
    audience: s.audience,
    share_until: iso(s.until),
    precise: s.precise,
    hidden_from: s.hidden_from.map((id) => id.toHexString()),
    guardian_consent_required: needsGuardianConsent(u),
    discoverable: u.discoverable !== false,
  };
}

export function notificationSettingsOf(u: UserDoc): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of NOTIFICATION_TYPES) out[t] = u.notification_settings?.[t] !== false;
  return out;
}

/** The caller's own account. Never includes the password hash (NFR-07). */
export function selfUser(u: UserDoc, hasPassword: boolean) {
  return {
    id: u._id.toHexString(),
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    bio: u.bio,
    role: u.role,
    status: u.status,
    date_of_birth: u.date_of_birth.toISOString().slice(0, 10),
    guardian_consent: u.guardian_consent,
    has_password: hasPassword,
    email: u.email ?? null,
    created_at: iso(u.created_at),
  };
}

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly google: GoogleVerifier,
    private readonly mail: MailService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Issues a 15-minute access token and a 30-day refresh token; only the refresh token's hash is stored. */
  async issueTokens(user: UserDoc, familyId: string = randomUUID()) {
    const access_token = jwt.sign({ role: user.role, typ: 'access' }, this.config.jwtSecret, {
      algorithm: 'HS256',
      subject: user._id.toHexString(),
      expiresIn: this.config.accessTtlSeconds,
    });
    const refresh_token = randomBytes(48).toString('base64url');
    await this.db.refreshTokens.insertOne({
      user_id: user._id,
      token_hash: this.hashToken(refresh_token),
      family_id: familyId,
      used_at: null,
      expires_at: new Date(Date.now() + this.config.refreshTtlDays * 86400_000),
      created_at: new Date(),
    });
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: this.config.accessTtlSeconds };
  }

  private newUser(username: string, dateOfBirth: Date, extra: Partial<UserDoc> = {}): UserDoc {
    const now = new Date();
    return {
      _id: new ObjectId(),
      username,
      display_name: username,
      avatar_url: null,
      bio: '',
      role: 'USER',
      status: 'ACTIVE',
      suspend_reason: null,
      warnings: 0,
      ghost_mode: false,
      // UC-23: location sharing is off until the user agrees.
      location_sharing: { enabled: false, audience: 'FRIENDS', until: null, precise: true, hidden_from: [] },
      notification_settings: {},
      date_of_birth: dateOfBirth,
      guardian_consent: false,
      event_writes: 0,
      created_at: now,
      updated_at: now,
      ...extra,
    };
  }

  private async insertUser(user: UserDoc, passwordHash: string | null): Promise<void> {
    try {
      await this.db.tx(async (session) => {
        await this.db.users.insertOne(user, { session });
        if (passwordHash) await this.db.credentials.insertOne({ user_id: user._id, password_hash: passwordHash }, { session });
      });
    } catch (e) {
      if (isDuplicateKey(e)) {
        const msg = String((e as { message?: string }).message ?? '');
        if (msg.includes('email')) throw Err.conflict('EMAIL_TAKEN', 'This e-mail is already linked to another account');
        throw Err.conflict('USERNAME_TAKEN', 'This username is already in use');
      }
      throw e;
    }
  }

  private sixDigitCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private async assertAvailable(username: string, email: string): Promise<void> {
    if (await this.db.users.countDocuments({ username }, { limit: 1 })) {
      throw Err.conflict('USERNAME_TAKEN', 'This username is already in use');
    }
    if (await this.db.users.countDocuments({ email }, { limit: 1 })) {
      throw Err.conflict('EMAIL_TAKEN', 'This e-mail is already linked to another account');
    }
  }

  private async deliverSignupCode(email: string, username: string, code: string) {
    const minutes = this.config.signupCodeTtlMinutes;
    const answer: { verification_required: true; email: string; expires_in: number; dev_code?: string } = {
      verification_required: true,
      email,
      expires_in: minutes * 60,
    };
    if (this.mail.configured) {
      await this.mail.sendSignupCode(email, code, minutes);
      return answer;
    }
    this.log.warn(`SMTP not configured - sign-up code for ${username}: ${code}`);
    return { ...answer, dev_code: code };
  }

  /**
   * Sign-up step 1: checks the username and e-mail, keeps the sign-up aside and e-mails a 6-digit code.
   * No account exists until the code is confirmed (step 2), so nobody can hold a username or an
   * address they do not own. Limited to SIGNUP_IP_LIMIT (5) sign-ups per IP every 15 minutes.
   */
  async register(username: string, password: string, dateOfBirth: Date, email: string, ip = 'unknown') {
    await this.limitRequests([`signup:ip:${ip}`], this.config.signupIpLimit, 15 * 60_000, 'Too many sign-ups from this network; try again later');
    if (!this.mail.configured && this.config.nodeEnv === 'production') {
      throw new ApiError(503, 'MAIL_NOT_CONFIGURED', 'E-mail sending is not configured on this server');
    }
    await this.assertAvailable(username, email);
    const code = this.sixDigitCode();
    const now = new Date();
    await this.db.pendingSignups.replaceOne(
      { email },
      {
        email,
        username,
        password_hash: await bcrypt.hash(password, this.config.bcryptRounds),
        date_of_birth: dateOfBirth,
        code_hash: this.hashToken(code),
        code_expires_at: new Date(now.getTime() + this.config.signupCodeTtlMinutes * 60_000),
        attempts: 0,
        expires_at: new Date(now.getTime() + 24 * 3600_000),
        created_at: now,
      },
      { upsert: true },
    );
    return this.deliverSignupCode(email, username, code);
  }

  /** Sends a new code for a pending sign-up (3 per address, 10 per IP every 15 minutes). Same answer when there is none. */
  async resendSignupCode(email: string, ip = 'unknown') {
    await this.limitRequests([`signup:resend:ip:${ip}`], 10, 15 * 60_000);
    const minutes = this.config.signupCodeTtlMinutes;
    const pending = await this.db.pendingSignups.findOne({ email });
    if (!pending) return { verification_required: true as const, email, expires_in: minutes * 60 };
    await this.limitRequests([`signup:resend:${email}`], 3, 15 * 60_000);
    const code = this.sixDigitCode();
    await this.db.pendingSignups.updateOne(
      { _id: pending._id },
      { $set: { code_hash: this.hashToken(code), code_expires_at: new Date(Date.now() + minutes * 60_000), attempts: 0 } },
    );
    return this.deliverSignupCode(email, pending.username, code);
  }

  /**
   * Sign-up step 2: the 6-digit code creates the account and signs it in. Five wrong codes discard the
   * sign-up (the user registers again); at most 4 x SIGNUP_IP_LIMIT tries per IP every 15 minutes.
   */
  async verifySignup(email: string, code: string, ip = 'unknown') {
    await this.limitRequests([`signup:try:ip:${ip}`], this.config.signupIpLimit * 4, 15 * 60_000);
    const invalid = () => Err.badRequest('INVALID_VERIFICATION_CODE', 'The code is wrong or has expired; request a new one');
    const pending = await this.db.pendingSignups.findOne({ email });
    if (!pending || pending.code_expires_at <= new Date()) throw invalid();
    if (pending.code_hash !== this.hashToken(code)) {
      if (pending.attempts + 1 >= 5) {
        await this.db.pendingSignups.deleteOne({ _id: pending._id });
        throw Err.badRequest('SIGNUP_EXPIRED', 'Too many wrong codes; please sign up again');
      }
      await this.db.pendingSignups.updateOne({ _id: pending._id }, { $inc: { attempts: 1 } });
      throw invalid();
    }
    // Someone may have taken the username (or the e-mail through Google) since step 1.
    try {
      await this.assertAvailable(pending.username, email);
    } catch (e) {
      await this.db.pendingSignups.deleteOne({ _id: pending._id });
      throw e;
    }
    const user = this.newUser(pending.username, pending.date_of_birth, { email });
    await this.insertUser(user, pending.password_hash);
    await this.db.pendingSignups.deleteOne({ _id: pending._id });
    return { user: selfUser(user, true), tokens: await this.issueTokens(user) };
  }

  /** Lock state after one more wrong password (see LOGIN_LOCK_STEPS). */
  private nextFailures(previous: LoginFailures | undefined, now: Date): LoginFailures {
    const recent = !!previous && now.getTime() - previous.last_at.getTime() < LOGIN_FAILURE_MEMORY_MS;
    const count = (recent ? previous!.count : 0) + 1;
    const step = LOGIN_LOCK_STEPS.find(([n]) => count === n);
    return {
      count,
      last_at: now,
      locked_until: step ? new Date(now.getTime() + step[1] * 1000) : null,
      reset_required: count >= LOGIN_RESET_REQUIRED_AT,
    };
  }

  private lockError(f: LoginFailures, now: Date): ApiError | null {
    if (f.reset_required) {
      return Err.forbidden(
        'PASSWORD_RESET_REQUIRED',
        'Too many wrong passwords. Use "Forgot password" to set a new password before signing in.',
      );
    }
    if (f.locked_until && f.locked_until > now) {
      const seconds = Math.ceil((f.locked_until.getTime() - now.getTime()) / 1000);
      return new ApiError(429, 'ACCOUNT_LOCKED', `Too many wrong passwords. Try again in ${seconds} seconds.`, { retry_after: seconds });
    }
    return null;
  }

  /**
   * Password sign-in for the app. Wrong passwords in a row lock the account for 1, 5 and 10 minutes
   * (after 5, 10 and 15), and after 20 only "forgot password" unlocks it. Admin accounts cannot sign in
   * here: they use the admin web page (AdminAuthService), which blocks an IP after 3 wrong passwords.
   */
  async login(username: string, password: string, ip: string) {
    const ipKey = `ip:${ip}`;
    const since = new Date(Date.now() - 15 * 60_000);
    if ((await this.db.loginAttempts.countDocuments({ key: ipKey, created_at: { $gt: since } })) >= MAX_FAILED_LOGINS_PER_IP) {
      throw Err.tooMany('Too many failed logins from this network; try again in 15 minutes');
    }
    const now = new Date();
    const user = await this.db.users.findOne({ username });
    const locked = user?.login_failures ? this.lockError(user.login_failures, now) : null;
    if (locked) throw locked;

    const cred = user && user.role !== 'ADMIN' ? await this.db.credentials.findOne({ user_id: user._id }) : null;
    // Compare even when the account is unknown so response time does not reveal which usernames exist.
    const ok = await bcrypt.compare(password, cred?.password_hash ?? DUMMY_HASH);
    if (!user || !cred || !ok) {
      await this.db.loginAttempts.insertOne({ key: ipKey, created_at: now });
      if (user && cred) {
        const failures = this.nextFailures(user.login_failures, now);
        await this.db.users.updateOne({ _id: user._id }, { $set: { login_failures: failures } });
        const err = this.lockError(failures, now);
        if (err) throw err;
      }
      throw Err.unauthorized('INVALID_CREDENTIALS', 'Wrong username or password');
    }
    this.assertActive(user);
    if (user.login_failures) await this.db.users.updateOne({ _id: user._id }, { $unset: { login_failures: '' } });
    return { user: selfUser(user, true), tokens: await this.issueTokens(user) };
  }

  private assertActive(user: UserDoc): void {
    if (user.status !== 'ACTIVE') {
      throw Err.forbidden('ACCOUNT_SUSPENDED', `Account suspended: ${user.suspend_reason ?? 'no reason given'}`);
    }
  }

  /**
   * Username for a new Google account: the part of the e-mail before "@", reduced to the allowed
   * characters (a-z 0-9 _ .), with digits appended when it is taken.
   */
  private async usernameFromGoogle(identity: { email?: string | null; name?: string | null }): Promise<string> {
    const source = identity.email?.split('@')[0] || identity.name || 'user';
    let base = source
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // bỏ dấu tiếng Việt
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9_.]/g, '')
      .slice(0, 30);
    if (base.length < 3) base = `${base}user`.slice(0, 30);
    for (let i = 0; i < 20; i++) {
      const suffix = i === 0 ? '' : String(Math.floor(Math.random() * 10 ** Math.min(2 + i, 6)));
      const candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`;
      if (!(await this.db.users.countDocuments({ username: candidate }, { limit: 1 }))) return candidate;
    }
    return `user${new ObjectId().toHexString().slice(-10)}`;
  }

  async googleSignIn(idToken: string, username?: string | null, dateOfBirth?: Date | null) {
    const identity = await this.google.verify(idToken);
    if (!identity) throw Err.unauthorized('INVALID_GOOGLE_TOKEN', 'The Google ID token is not valid');

    let user = await this.db.users.findOne({ google_id: identity.sub });
    if (!user) {
      if (!dateOfBirth) {
        throw Err.badRequest('PROFILE_REQUIRED', 'First Google sign-in: send date_of_birth (username is optional)');
      }
      const name = username ?? (await this.usernameFromGoogle(identity));
      user = this.newUser(name, dateOfBirth, {
        google_id: identity.sub,
        display_name: identity.name?.slice(0, 50) || name,
        avatar_url: identity.picture ?? null,
        // The Google e-mail doubles as the password-reset address, unless another account already uses it.
        email:
          identity.email && !(await this.db.users.countDocuments({ email: identity.email.toLowerCase() }, { limit: 1 }))
            ? identity.email.toLowerCase()
            : null,
      });
      await this.insertUser(user, null);
    }
    this.assertActive(user);
    if (user.role === 'ADMIN') throw Err.forbidden('ADMIN_WEB_ONLY', 'Admin accounts sign in on the admin web page');
    const hasPassword = (await this.db.credentials.countDocuments({ user_id: user._id }, { limit: 1 })) > 0;
    return { user: selfUser(user, hasPassword), tokens: await this.issueTokens(user) };
  }

  /**
   * Rotation: each refresh token works exactly once and is exchanged for a new pair in the same family.
   * A used token is kept (marked used) until it expires: if it is presented again, someone else has a
   * copy, so every token of that family is revoked and both the thief and the owner must sign in again.
   * A repeat within REFRESH_REUSE_GRACE_MS is treated as two parallel requests of the same app.
   */
  async refresh(refreshToken: string) {
    const now = new Date();
    const hash = this.hashToken(refreshToken);
    const invalid = () => Err.unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    const row = await this.db.refreshTokens.findOneAndUpdate(
      { token_hash: hash, used_at: null, expires_at: { $gt: now } },
      { $set: { used_at: now } },
    );
    if (!row) {
      const used = await this.db.refreshTokens.findOne({ token_hash: hash });
      if (used?.used_at && now.getTime() - used.used_at.getTime() > REFRESH_REUSE_GRACE_MS) {
        const filter = used.family_id ? { family_id: used.family_id } : { user_id: used.user_id };
        const { deletedCount } = await this.db.refreshTokens.deleteMany(filter);
        this.log.warn(`refresh token reused for user ${used.user_id.toHexString()}: revoked ${deletedCount} token(s) of that session`);
        throw Err.unauthorized('REFRESH_TOKEN_REUSED', 'This session was signed out for safety; please sign in again');
      }
      throw invalid();
    }
    const user = await this.db.users.findOne({ _id: row.user_id });
    if (!user) throw invalid();
    this.assertActive(user);
    return this.issueTokens(user, row.family_id ?? randomUUID());
  }

  /** Ends the session: every token of the presented token's family, used or not. */
  async logout(userId: ObjectId, refreshToken: string): Promise<void> {
    const row = await this.db.refreshTokens.findOne({ user_id: userId, token_hash: this.hashToken(refreshToken) });
    if (!row) return;
    await this.db.refreshTokens.deleteMany(row.family_id ? { user_id: userId, family_id: row.family_id } : { _id: row._id });
  }

  async hasPassword(userId: ObjectId): Promise<boolean> {
    return (await this.db.credentials.countDocuments({ user_id: userId }, { limit: 1 })) > 0;
  }

  /**
   * Changes the password and signs out every other session. The caller's own session survives when it
   * sends its refresh token (the app does); otherwise all sessions end and the app signs in again.
   */
  async changePassword(userId: ObjectId, current: string, next: string, keepRefreshToken?: string): Promise<void> {
    const cred = await this.db.credentials.findOne({ user_id: userId });
    if (!cred) throw Err.conflict('NO_PASSWORD', 'This account signs in with Google and has no password');
    if (!(await bcrypt.compare(current, cred.password_hash))) {
      throw Err.badRequest('WRONG_PASSWORD', 'The current password is wrong');
    }
    await this.db.credentials.updateOne(
      { user_id: userId },
      { $set: { password_hash: await bcrypt.hash(next, this.config.bcryptRounds) } },
    );
    await this.db.refreshTokens.deleteMany({
      user_id: userId,
      ...(keepRefreshToken ? { token_hash: { $ne: this.hashToken(keepRefreshToken) } } : {}),
    });
  }

  // ---- Forgot password: 6-digit code by e-mail, then a new password without the old one -------------

  private async findByUsernameOrEmail(login: string): Promise<UserDoc | null> {
    const v = login.trim().toLowerCase();
    return this.db.users.findOne(v.includes('@') ? { email: v } : { username: v });
  }

  /** Counts one request per key and refuses once a key reached `max` in the window (at most 15 minutes, the TTL). */
  private async limitRequests(keys: string[], max: number, windowMs: number, message = 'Too many requests; try again later'): Promise<void> {
    const since = new Date(Date.now() - windowMs);
    for (const key of keys) {
      if ((await this.db.loginAttempts.countDocuments({ key, created_at: { $gt: since } })) >= max) {
        throw Err.tooMany(message);
      }
    }
    const now = new Date();
    await this.db.loginAttempts.insertMany(keys.map((key) => ({ key, created_at: now })));
  }

  /** True while the account has used up its wrong reset codes for the day (RESET_MAX_FAILURES per 24 h). */
  private resetLocked(user: UserDoc, now = new Date()): boolean {
    const f = user.reset_failures;
    return !!f && f.count >= RESET_MAX_FAILURES && now.getTime() - f.since.getTime() < RESET_FAILURE_WINDOW_MS;
  }

  /**
   * Sends a 6-digit code to the account's e-mail. Limited to 3 requests per account and 10 per IP
   * every 15 minutes. The answer is the same whether or not the account exists or has an e-mail, so the
   * endpoint cannot be used to find out which usernames or addresses are registered. Without SMTP the
   * code is logged and returned as dev_code (development) or the request fails (production).
   */
  async forgotPassword(login: string, ip: string) {
    await this.limitRequests([`reset:ip:${ip}`], 10, 15 * 60_000);
    if (!this.mail.configured && this.config.nodeEnv === 'production') {
      throw new ApiError(503, 'MAIL_NOT_CONFIGURED', 'E-mail sending is not configured on this server');
    }
    const minutes = this.config.passwordResetTtlMinutes;
    const answer: { sent: true; expires_in: number; dev_code?: string } = { sent: true, expires_in: minutes * 60 };

    const user = await this.findByUsernameOrEmail(login);
    if (!user?.email || user.status !== 'ACTIVE' || this.resetLocked(user)) return answer;
    const since = new Date(Date.now() - 15 * 60_000);
    const userKey = `reset:user:${user._id.toHexString()}`;
    if ((await this.db.loginAttempts.countDocuments({ key: userKey, created_at: { $gt: since } })) >= 3) return answer;
    await this.db.loginAttempts.insertOne({ key: userKey, created_at: new Date() });

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    await this.db.passwordResets.updateOne(
      { user_id: user._id },
      { $set: { code_hash: this.hashToken(code), expires_at: new Date(now.getTime() + minutes * 60_000), attempts: 0, created_at: now } },
      { upsert: true },
    );

    if (this.mail.configured) {
      await this.mail.sendPasswordResetCode(user.email, code, minutes);
      return answer;
    }
    this.log.warn(`SMTP not configured - password reset code for ${user.username}: ${code}`);
    return { ...answer, dev_code: code };
  }

  /**
   * Checks the code and sets the new password (also for Google-only accounts), then signs the user out
   * everywhere. Guessing is capped three ways: 5 tries per code, RESET_MAX_FAILURES wrong codes per
   * account per day, and 20 tries per IP every 15 minutes.
   */
  async resetPassword(login: string, code: string, newPassword: string, ip = 'unknown'): Promise<void> {
    await this.limitRequests([`reset:try:ip:${ip}`], 20, 15 * 60_000);
    const invalid = () => Err.badRequest('INVALID_RESET_CODE', 'The code is wrong or has expired; request a new one');
    const user = await this.findByUsernameOrEmail(login);
    if (user && this.resetLocked(user)) throw Err.tooMany('Too many wrong codes; try again tomorrow');
    const row = user ? await this.db.passwordResets.findOne({ user_id: user._id }) : null;
    if (!user || !row || row.expires_at <= new Date()) throw invalid();
    if (row.code_hash !== this.hashToken(code)) {
      if (row.attempts + 1 >= 5) await this.db.passwordResets.deleteOne({ _id: row._id });
      else await this.db.passwordResets.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
      await this.recordResetFailure(user);
      throw invalid();
    }
    this.assertActive(user);
    const password_hash = await bcrypt.hash(newPassword, this.config.bcryptRounds);
    await this.db.credentials.updateOne({ user_id: user._id }, { $set: { password_hash } }, { upsert: true });
    await this.db.passwordResets.deleteOne({ _id: row._id });
    await this.db.refreshTokens.deleteMany({ user_id: user._id });
    // A new password also lifts the wrong-password lock (including "reset required").
    await this.db.users.updateOne({ _id: user._id }, { $unset: { reset_failures: '', login_failures: '' } });
    await this.db.loginAttempts.deleteMany({ key: `reset:user:${user._id.toHexString()}` });
  }

  /** Counts a wrong reset code against the account; the count restarts after 24 hours. */
  private async recordResetFailure(user: UserDoc): Promise<void> {
    const now = new Date();
    const f = user.reset_failures;
    const fresh = !f || now.getTime() - f.since.getTime() >= RESET_FAILURE_WINDOW_MS;
    await this.db.users.updateOne(
      { _id: user._id },
      fresh ? { $set: { reset_failures: { count: 1, since: now } } } : { $inc: { 'reset_failures.count': 1 } },
    );
    if (!fresh && f!.count + 1 >= RESET_MAX_FAILURES) {
      // The account is locked for the rest of the window: drop the pending code as well.
      await this.db.passwordResets.deleteOne({ user_id: user._id });
    }
  }

  /** Re-authentication before account deletion: the password, or a fresh Google ID token for Google accounts. */
  async verifyOwner(user: UserDoc, password?: string, idToken?: string): Promise<boolean> {
    if (password) {
      const cred = await this.db.credentials.findOne({ user_id: user._id });
      return !!cred && (await bcrypt.compare(password, cred.password_hash));
    }
    if (idToken && user.google_id) {
      const identity = await this.google.verify(idToken);
      return identity?.sub === user.google_id;
    }
    return false;
  }
}
