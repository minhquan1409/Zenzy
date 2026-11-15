import { Injectable } from '@nestjs/common';
import { ADDRESS, listenHost, listenPort } from './address';

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All runtime configuration, read once from environment variables (see .env.example). */
@Injectable()
export class AppConfig {
  readonly nodeEnv = process.env.NODE_ENV ?? 'development';
  /** Địa chỉ lắng nghe: xem src/core/address.ts (nguồn duy nhất). */
  readonly host = listenHost;
  readonly port = listenPort;

  readonly mongoUri = process.env.MONGODB_URI || ADDRESS.localMongoUri;
  readonly mongoDbName = process.env.MONGODB_DB ?? 'zenzy';

  readonly jwtSecret = process.env.JWT_SECRET ?? '';
  /** NFR-08: access tokens live 15 minutes, refresh tokens 30 days. */
  readonly accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900);
  readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  readonly bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

  /** OAuth client IDs accepted as the audience of a Google ID token. */
  readonly googleClientIds = [
    ...list(process.env.GOOGLE_CLIENT_IDS),
    ...list(process.env.GOOGLE_IOS_CLIENT_ID),
  ];

  /** Browser origins allowed by CORS (the admin dashboard). Mobile apps do not need CORS. */
  readonly corsOrigins = list(process.env.CORS_ORIGINS);
  /** Number of reverse proxies in front of the API (1 behind Caddy), so the client IP is read correctly. */
  readonly trustProxy = Number(process.env.TRUST_PROXY ?? 0);

  readonly s3Bucket = process.env.S3_BUCKET ?? '';
  readonly s3Region = process.env.AWS_REGION ?? process.env.S3_REGION ?? 'ap-southeast-1';
  /** Public base URL that serves uploaded objects (CloudFront domain), without a trailing slash. */
  readonly mediaPublicBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

  /**
   * Development fallback when S3 is not configured: uploads are stored in this folder and served at
   * /media/. Disabled in production unless set explicitly.
   */
  readonly mediaLocalDir =
    process.env.MEDIA_LOCAL_DIR ?? ((process.env.NODE_ENV ?? 'development') === 'production' ? '' : 'media-local');
  /** Optional public origin of the API (e.g. https://api.example.com); otherwise taken from the request. */
  readonly publicBaseUrl = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

  /** SMTP for outgoing e-mail (password-reset codes). Empty host = e-mail disabled. */
  readonly smtpHost = process.env.SMTP_HOST ?? '';
  readonly smtpPort = Number(process.env.SMTP_PORT ?? 587);
  readonly smtpUser = process.env.SMTP_USER ?? '';
  readonly smtpPass = process.env.SMTP_PASS ?? '';
  readonly mailFrom = process.env.MAIL_FROM ?? (process.env.SMTP_USER ? `Zenzy <${process.env.SMTP_USER}>` : 'Zenzy <no-reply@zenzy.app>');
  /** Sign-ups per IP every 15 minutes (code checks: 4 times this). Raised by the tests. */
  readonly signupIpLimit = Number(process.env.SIGNUP_IP_LIMIT ?? 5);
  /** Minutes an e-mail verification code of a new account stays valid. */
  readonly signupCodeTtlMinutes = Number(process.env.SIGNUP_CODE_TTL_MINUTES ?? 15);

  /** Where admin security alerts go (an IP blocked after wrong admin passwords). Empty = no e-mail. */
  readonly adminAlertEmail = (process.env.ADMIN_ALERT_EMAIL ?? '').trim();
  /** Wrong admin passwords from one IP before it is blocked, and how long the block lasts. */
  readonly adminMaxFailures = Number(process.env.ADMIN_MAX_FAILURES ?? 3);
  readonly adminBlockHours = Number(process.env.ADMIN_BLOCK_HOURS ?? 24);

  /**
   * Password of the APK download page (/download/), checked by GET /v1/internal/download-auth for
   * Caddy's forward_auth. The bcrypt hash is stored base64-encoded so "$" survives env files.
   */
  readonly downloadUser = process.env.DOWNLOAD_USER ?? '';
  readonly downloadPasswordHash = Buffer.from(process.env.DOWNLOAD_PASSWORD_HASH_B64 ?? '', 'base64').toString('utf8');
  readonly downloadMaxFailures = Number(process.env.DOWNLOAD_MAX_FAILURES ?? 10);
  readonly downloadBlockHours = Number(process.env.DOWNLOAD_BLOCK_HOURS ?? 24);

  /**
   * Anti-scraping (see AbuseService). RATE_LIMIT_SCALE multiplies every request limit (the tests raise
   * it; 0 turns rate limits off). A user who opens more than SCRAPE_PROFILE_LIMIT strangers' profiles in
   * one hour cannot use the reading APIs for SCRAPE_LOCK_MINUTES, and the admin gets an e-mail.
   */
  rateLimitScale = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  scrapeProfileLimit = Number(process.env.SCRAPE_PROFILE_LIMIT ?? 60);
  readonly scrapeLockMinutes = Number(process.env.SCRAPE_LOCK_MINUTES ?? 60);
  /** Map / NEARBY centre more than this far from the previous one (within 10 minutes) is a "jump". */
  readonly geoJumpKm = Number(process.env.GEO_JUMP_KM ?? 50);
  /** Jumps allowed per hour before map / NEARBY searches answer 429 LOCATION_JUMP. */
  geoJumpsPerHour = Number(process.env.GEO_JUMPS_PER_HOUR ?? 5);

  /** Minutes a password-reset code stays valid. */
  readonly passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 10);

  /** Base64 of the Firebase service-account JSON; push is disabled when empty. */
  readonly fcmServiceAccountB64 = process.env.FCM_SERVICE_ACCOUNT_BASE64 ?? '';

  /** Background jobs (end deals/events, expire time-limited sharing). Off in tests. */
  readonly jobsEnabled = (process.env.JOBS_ENABLED ?? 'true') === 'true';
  readonly bannedKeywordCacheMs = Number(process.env.BANNED_KEYWORD_CACHE_MS ?? 30000);

  constructor() {
    if (this.jwtSecret.length < 32) {
      if (this.nodeEnv === 'production') {
        throw new Error('JWT_SECRET must be set to at least 32 characters in production');
      }
      (this as { jwtSecret: string }).jwtSecret = this.jwtSecret || 'dev-only-secret-change-me-dev-only-secret';
    }
  }
}
