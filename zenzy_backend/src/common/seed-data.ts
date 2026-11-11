import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';
import type { DatabaseService, Doc } from './database.js';

/** Dữ liệu mẫu đúng theo thiết kế Figma (cùng file với assets/sample của app Flutter). */
export function loadSeed(): Record<string, any> {
  const path = fileURLToPath(new URL('../../seed/seed-data.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Nạp dữ liệu mẫu. Chạy lại nhiều lần vẫn an toàn: chỉ ghi đè các tài liệu mẫu (theo `_id`),
 * không đụng tới dữ liệu do người dùng tạo.
 */
export async function seedDatabase(db: DatabaseService): Promise<number> {
  const seed = loadSeed();
  let count = 0;
  const upsert = async (collection: string, docs: Doc[]) => {
    for (const doc of docs) {
      const { _id, ...rest } = doc;
      await db.col(collection).updateOne({ _id }, { $set: rest }, { upsert: true });
      count++;
    }
  };

  const pins: Doc[] = [];
  const activities: Doc[] = [];
  for (const view of Object.keys(seed.map)) {
    for (const pin of seed.map[view].pins) {
      const { id, ...rest } = pin;
      pins.push({ _id: id, view, seeded: true, ...rest });
    }
    activities.push({ _id: view, ...seed.map[view].activity });
  }
  await upsert('map_pins', pins);
  await upsert('activities', activities);
  await upsert('settings', [{ _id: 'new_pin_location', ...seed.new_pin_location }]);

  const withId = (list: any[]): Doc[] => list.map(({ id, ...rest }) => ({ _id: id, ...rest }));
  await upsert('shops', withId(seed.shops));
  await upsert('events', withId(seed.events));
  await upsert('posts', withId(seed.posts).map((p, order) => ({ ...p, order })));
  await upsert('notifications', withId(seed.notifications).map((n, order) => ({ ...n, order })));

  const conversations: Doc[] = [];
  const messages: Doc[] = [];
  seed.conversations.forEach((c: any, order: number) => {
    const { id, messages: list, ...rest } = c;
    conversations.push({ _id: id, order, ...rest });
    (list ?? []).forEach((m: any, i: number) => {
      const { id: messageId, ...message } = m;
      messages.push({ _id: `${id}-${messageId}`, conversation_id: id, order: i, seeded: true, ...message });
    });
  });
  await upsert('conversations', conversations);
  await upsert('messages', messages);

  // Người dùng mẫu (Clara). Mật khẩu ngẫu nhiên: không ai đăng nhập được vào tài khoản này.
  const { email, ...profile } = seed.profile;
  const existing = await db.col('users').findOne({ _id: config.demoUserId });
  await upsert('users', [
    {
      _id: config.demoUserId,
      email,
      name: profile.name,
      password_hash: existing?.password_hash ?? (await bcrypt.hash(randomBytes(24).toString('hex'), 10)),
      profile,
      privacy: seed.privacy,
      shop_id: seed.shops[0]?.id ?? null,
    },
  ]);
  return count;
}
