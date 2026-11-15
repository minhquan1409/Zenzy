import { Db as MongoDb, IndexDescription } from 'mongodb';
import { LOCATION_TTL_SECONDS } from './types';

/**
 * Versioned index and validation definitions (spec 4.8 / 5.1).
 * Applied idempotently at start-up and by `npm run db:init`.
 */
interface CollectionDef {
  name: string;
  indexes?: IndexDescription[];
  /** Fields that must be present, and enum constraints, enforced by MongoDB JSON Schema validation. */
  required?: string[];
  enums?: Record<string, string[]>;
}

export const SCHEMA_VERSION = 1;

export const COLLECTIONS: CollectionDef[] = [
  {
    name: 'users',
    indexes: [
      { key: { username: 1 }, unique: true },
      { key: { google_id: 1 }, unique: true, partialFilterExpression: { google_id: { $type: 'string' } } },
      { key: { email: 1 }, unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    ],
    required: ['username', 'role', 'status', 'ghost_mode', 'location_sharing', 'date_of_birth'],
    enums: { role: ['USER', 'ADMIN'], status: ['ACTIVE', 'SUSPENDED'] },
  },
  { name: 'credentials', indexes: [{ key: { user_id: 1 }, unique: true }], required: ['user_id', 'password_hash'] },
  {
    name: 'refresh_tokens',
    indexes: [
      { key: { token_hash: 1 }, unique: true },
      { key: { user_id: 1 } },
      { key: { family_id: 1 } },
      { key: { expires_at: 1 }, expireAfterSeconds: 0 },
    ],
    required: ['user_id', 'token_hash', 'expires_at'],
  },
  {
    name: 'friendships',
    indexes: [
      { key: { user_a: 1, user_b: 1 }, unique: true },
      { key: { user_a: 1, status: 1 } },
      { key: { user_b: 1, status: 1 } },
    ],
    required: ['user_a', 'user_b', 'status', 'requested_by'],
    enums: { status: ['PENDING', 'ACCEPTED'] },
  },
  {
    name: 'blocks',
    indexes: [{ key: { blocker_id: 1, blocked_id: 1 }, unique: true }, { key: { blocked_id: 1 } }],
    required: ['blocker_id', 'blocked_id'],
  },
  {
    name: 'user_locations',
    indexes: [{ key: { loc: '2dsphere' } }, { key: { updated_at: 1 }, expireAfterSeconds: LOCATION_TTL_SECONDS }],
    required: ['loc', 'updated_at'],
  },
  {
    name: 'events',
    indexes: [{ key: { loc: '2dsphere' } }, { key: { status: 1, starts_at: 1 } }, { key: { host_id: 1, status: 1 } }],
    required: ['host_id', 'title', 'type', 'loc', 'starts_at', 'ends_at', 'audience', 'status'],
    enums: {
      type: ['EVENT', 'SPORTS', 'STUDY', 'OTHER'],
      audience: ['EVERYONE', 'CLOSE_FRIENDS'],
      status: ['OPEN', 'FULL', 'CANCELLED', 'ENDED', 'HIDDEN', 'REMOVED'],
    },
  },
  {
    name: 'event_participants',
    indexes: [{ key: { event_id: 1, user_id: 1 }, unique: true }, { key: { user_id: 1, status: 1 } }],
    required: ['event_id', 'user_id', 'status'],
    enums: { status: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'LEFT', 'KICKED'] },
  },
  {
    name: 'shops',
    indexes: [{ key: { loc: '2dsphere' } }, { key: { owner_id: 1 } }, { key: { status: 1, created_at: 1 } }],
    required: ['owner_id', 'name', 'loc', 'status', 'menu'],
    enums: { status: ['PENDING', 'APPROVED', 'REJECTED'] },
  },
  {
    name: 'flash_deals',
    indexes: [{ key: { shop_id: 1, ends_at: 1 } }, { key: { status: 1, ends_at: 1 } }],
    required: ['shop_id', 'title', 'discount', 'starts_at', 'ends_at', 'status'],
    enums: { status: ['ACTIVE', 'ENDED', 'CANCELLED'] },
  },
  {
    name: 'posts',
    indexes: [{ key: { status: 1, created_at: -1 } }, { key: { author_id: 1, created_at: -1 } }, { key: { loc: '2dsphere' } }],
    required: ['author_id', 'text', 'photos', 'status'],
    enums: { status: ['ACTIVE', 'HIDDEN', 'REMOVED'] },
  },
  { name: 'post_likes', indexes: [{ key: { post_id: 1, user_id: 1 }, unique: true }, { key: { user_id: 1 } }] },
  { name: 'post_comments', indexes: [{ key: { post_id: 1, created_at: 1 } }, { key: { author_id: 1 } }] },
  {
    name: 'saved_posts',
    indexes: [{ key: { user_id: 1, post_id: 1 }, unique: true }, { key: { user_id: 1, created_at: -1 } }],
  },
  {
    name: 'conversations',
    indexes: [
      { key: { member_ids: 1, updated_at: -1 } },
      { key: { direct_key: 1 }, unique: true, partialFilterExpression: { direct_key: { $type: 'string' } } },
      { key: { event_id: 1 }, unique: true, partialFilterExpression: { event_id: { $type: 'objectId' } } },
    ],
    required: ['type', 'member_ids'],
    enums: { type: ['DIRECT', 'GROUP', 'EVENT'] },
  },
  {
    name: 'messages',
    indexes: [{ key: { conversation_id: 1, created_at: -1 } }, { key: { sender_id: 1 } }],
    required: ['conversation_id', 'sender_id', 'text', 'created_at'],
  },
  { name: 'notifications', indexes: [{ key: { user_id: 1, created_at: -1 } }], required: ['user_id', 'type'] },
  { name: 'device_tokens', indexes: [{ key: { token: 1 }, unique: true }, { key: { user_id: 1 } }] },
  {
    name: 'reports',
    indexes: [
      { key: { reporter_id: 1, target_type: 1, target_id: 1 }, unique: true },
      { key: { target_type: 1, target_id: 1, status: 1 } },
      { key: { status: 1, created_at: 1 } },
    ],
    required: ['reporter_id', 'target_type', 'target_id', 'reason', 'status'],
    enums: {
      target_type: ['POST', 'EVENT', 'SHOP', 'USER'],
      reason: ['SPAM', 'SCAM', 'HARASSMENT', 'ILLEGAL', 'SENSITIVE', 'OTHER'],
      status: ['OPEN', 'RESOLVED'],
    },
  },
  { name: 'banned_keywords', indexes: [{ key: { keyword: 1 }, unique: true }], required: ['keyword'] },
  {
    // BR-07 / NFR-16: insert-only. The API exposes no update or delete for this collection.
    name: 'admin_audit_log',
    indexes: [{ key: { created_at: -1 } }, { key: { admin_id: 1, created_at: -1 } }],
    required: ['admin_id', 'action', 'reason', 'created_at'],
  },
  {
    // NFR-06: stored result of a write so a retried request never creates a duplicate.
    name: 'idempotency_keys',
    indexes: [
      { key: { user_id: 1, scope: 1, key: 1 }, unique: true },
      { key: { created_at: 1 }, expireAfterSeconds: 86400 },
    ],
  },
  {
    // NFR-08: failed logins per account and per IP, kept for 15 minutes.
    name: 'login_attempts',
    indexes: [{ key: { key: 1, created_at: 1 } }, { key: { created_at: 1 }, expireAfterSeconds: 900 }],
  },
  {
    // Forgot password: one pending 6-digit code per user, removed by TTL when it expires.
    name: 'password_resets',
    indexes: [{ key: { user_id: 1 }, unique: true }, { key: { expires_at: 1 }, expireAfterSeconds: 0 }],
    required: ['user_id', 'code_hash', 'expires_at'],
  },
  {
    // E-mail verification of a new account: one pending sign-up per address, removed after 24 hours.
    name: 'pending_signups',
    indexes: [{ key: { email: 1 }, unique: true }, { key: { expires_at: 1 }, expireAfterSeconds: 0 }],
    required: ['email', 'username', 'password_hash', 'code_hash', 'expires_at'],
  },
  {
    // IPs blocked from the admin sign-in or the download page; removed when the block ends.
    name: 'ip_blocks',
    indexes: [{ key: { ip: 1, scope: 1 }, unique: true }, { key: { until: 1 }, expireAfterSeconds: 0 }],
    required: ['ip', 'scope', 'until'],
    enums: { scope: ['ADMIN', 'DOWNLOAD'] },
  },
  {
    // Failed admin sign-ins and download passwords per IP, kept 24 hours.
    name: 'security_failures',
    indexes: [{ key: { scope: 1, ip: 1, created_at: 1 } }, { key: { created_at: 1 }, expireAfterSeconds: 86400 }],
  },
  {
    // Request counters for rate limits (one row per bucket, caller and time window).
    name: 'rate_counters',
    indexes: [{ key: { expires_at: 1 }, expireAfterSeconds: 0 }],
  },
  {
    // Strangers' profiles opened in the last hour (scraping detection).
    name: 'profile_views',
    indexes: [{ key: { viewer_id: 1, target_id: 1 }, unique: true }, { key: { created_at: 1 }, expireAfterSeconds: 3600 }],
  },
  {
    // Last map / NEARBY search centre per user (location probing); dropped after a day without searches.
    name: 'search_centers',
    indexes: [{ key: { at: 1 }, expireAfterSeconds: 86400 }],
  },
];

function validatorOf(def: CollectionDef): Record<string, unknown> | null {
  if (!def.required && !def.enums) return null;
  const properties: Record<string, unknown> = {};
  for (const [field, values] of Object.entries(def.enums ?? {})) properties[field] = { enum: values };
  return { $jsonSchema: { bsonType: 'object', required: def.required ?? [], properties } };
}

export async function ensureSchema(db: MongoDb, log: (msg: string) => void = () => undefined): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const def of COLLECTIONS) {
    const validator = validatorOf(def);
    if (!existing.has(def.name)) {
      await db.createCollection(def.name, validator ? { validator } : {});
    } else if (validator) {
      try {
        await db.command({ collMod: def.name, validator });
      } catch (e) {
        log(`could not update validator of ${def.name}: ${(e as Error).message}`);
      }
    }
    if (def.indexes?.length) {
      // A database shared with another deployment may already index the same keys with other options
      // (name or uniqueness); MongoDB rejects a second index on the same keys, so keep what exists.
      const coll = db.collection(def.name);
      const present = new Set((await coll.indexes()).map((i) => JSON.stringify(i.key)));
      const wanted = def.indexes.filter((i) => !present.has(JSON.stringify(i.key)));
      const skipped = def.indexes.length - wanted.length;
      if (skipped) log(`${def.name}: ${skipped} index(es) already exist with other options; left as they are`);
      if (wanted.length) await coll.createIndexes(wanted);
    }
  }
}
