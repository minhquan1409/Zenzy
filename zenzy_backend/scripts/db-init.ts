/**
 * Creates collections, JSON Schema validators and indexes (spec 4.8: versioned index scripts),
 * then optionally creates the first admin account and the banned-keyword list.
 *
 *   npm run db:init
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD='...' npm run db:init
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD_HASH_B64=<base64 of a bcrypt hash> node dist/scripts/db-init.js
 *     (used by deploy/aws/setup-admin.ps1, so the plain password never leaves the admin's PC)
 *   BANNED_KEYWORDS='word1,word2' npm run db:init
 */
import * as bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';
import { ensureSchema, SCHEMA_VERSION } from '../src/core/schema';

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? 'zenzy');
  await ensureSchema(db, (m) => console.warn(m));
  console.log(`schema v${SCHEMA_VERSION} applied to "${db.databaseName}"`);

  const words = (process.env.BANNED_KEYWORDS ?? '')
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  for (const keyword of words) {
    await db.collection('banned_keywords').updateOne({ keyword }, { $setOnInsert: { keyword } }, { upsert: true });
  }
  if (words.length) console.log(`banned keywords upserted: ${words.length}`);

  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const givenHash = Buffer.from(process.env.ADMIN_PASSWORD_HASH_B64 ?? '', 'base64').toString('utf8');
  if (givenHash && !/^\$2[aby]\$\d\d\$/.test(givenHash)) throw new Error('ADMIN_PASSWORD_HASH_B64 is not a bcrypt hash');
  if (username && (password || givenHash)) {
    if (password && password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');
    const passwordHash = givenHash || (await bcrypt.hash(password!, 12));
    const users = db.collection('users');
    const existing = await users.findOne({ username });
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: { role: 'ADMIN', status: 'ACTIVE' } });
      await db
        .collection('credentials')
        .updateOne({ user_id: existing._id }, { $set: { password_hash: passwordHash } }, { upsert: true });
      console.log(`existing user "${username}" is ADMIN; password set`);
    } else {
      const now = new Date();
      const _id = new ObjectId();
      await users.insertOne({
        _id,
        username,
        display_name: 'Admin',
        avatar_url: null,
        bio: '',
        role: 'ADMIN',
        status: 'ACTIVE',
        suspend_reason: null,
        warnings: 0,
        ghost_mode: true,
        location_sharing: { enabled: false, audience: 'FRIENDS', until: null, precise: true, hidden_from: [] },
        notification_settings: {},
        date_of_birth: new Date('1990-01-01T00:00:00Z'),
        guardian_consent: false,
        event_writes: 0,
        created_at: now,
        updated_at: now,
      });
      await db.collection('credentials').insertOne({ user_id: _id, password_hash: passwordHash });
      console.log(`admin "${username}" created`);
    }
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
