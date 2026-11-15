/**
 * Fills a development server with demo data through the real API (so every business rule applies):
 * users, friendships, close friends, shared locations, an approved shop with menu and flash deal,
 * events and live pins, posts, a chat. For local testing only.
 *
 *   npm run seed:demo                 # against the local server (src/core/address.ts)
 *   npm run seed:demo -- --live       # keep moving the demo friends every 30 s (real-time testing)
 *
 * All demo accounts use the password "password123". The admin account is "thao".
 */
import { MongoClient } from 'mongodb';
import { ADDRESS, localBaseUrl } from '../src/core/address';

const BASE = (process.env.SEED_BASE_URL || localBaseUrl).replace(/\/+$/, '');
const PASSWORD = 'password123';
const CENTER = { latitude: 10.8035, longitude: 106.735 }; // Thảo Điền, HCMC

type Session = { id: string; username: string; token: string };

async function call<T = any>(s: Session | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${text}`), { status: res.status, json });
  return json as T;
}

async function account(username: string, displayName: string, bio: string, dob = '2003-04-12'): Promise<Session> {
  let r: any;
  const email = `${username.replace(/[^a-z0-9]/g, '')}@zenzy.local`;
  try {
    const signup: any = await call(null, 'POST', '/auth/register', { username, password: PASSWORD, date_of_birth: dob, email });
    const code = signup?.dev_code ?? '000000';
    r = await call(null, 'POST', '/auth/register/verify', { email, code });
  } catch (e: any) {
    if (e.status !== 409) throw e;
    r = await call(null, 'POST', '/auth/login', { username, password: PASSWORD });
  }
  const s = { id: r.user.id, username, token: r.tokens.access_token };
  await call(s, 'PATCH', '/me', { display_name: displayName, bio });
  return s;
}

async function befriend(a: Session, b: Session): Promise<void> {
  try {
    const req = await call(a, 'POST', '/friends/requests', { receiver_id: b.id });
    await call(b, 'PATCH', `/friends/requests/${req.request_id}`, { action: 'ACCEPT' });
  } catch (e: any) {
    if (e.status !== 409) throw e; // already friends
  }
}

const jitter = (d = 0.004) => (Math.random() - 0.5) * d;
const at = (dLat: number, dLng: number) => ({ latitude: CENTER.latitude + dLat, longitude: CENTER.longitude + dLng });
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function main(): Promise<void> {
  const live = process.argv.includes('--live');
  console.log(`seeding ${BASE}`);

  const minh = await account('minh', 'Minh Nguyễn', 'Student · always asking "where are you?" 📍');
  const lan = await account('lan', 'Lan Trần', 'Event organiser · basketball & study groups 🏀');
  const vy = await account('vy.pham', 'Vy Phạm', 'Office worker, flash-deal hunter ☕');
  const hung = await account('hung', 'Hùng Lê', 'Owner of Zenzy Coffee & Tea', '1995-08-20');
  const chloe = await account('chloe', 'Chloe', 'Firepit hangouts & weekend runs 🔥');
  const alex = await account('alex', 'Alex Kim', 'New in Thảo Điền 👋');
  const thao = await account('thao', 'Thảo (Admin)', 'Platform admin', '1999-01-01');

  // Promote "thao" to admin directly in the database (there is no API for creating admins).
  const mongo = new MongoClient(process.env.MONGODB_URI || ADDRESS.localMongoUri);
  await mongo.connect();
  await mongo.db(process.env.MONGODB_DB ?? 'zenzy').collection('users').updateOne({ username: 'thao' }, { $set: { role: 'ADMIN' } });
  await mongo.db(process.env.MONGODB_DB ?? 'zenzy').collection('banned_keywords').updateOne(
    { keyword: 'scam' },
    { $setOnInsert: { keyword: 'scam' } },
    { upsert: true },
  );
  await mongo.close();

  for (const [a, b] of [[minh, lan], [minh, vy], [minh, chloe], [minh, alex], [lan, vy], [lan, chloe], [vy, hung], [chloe, alex]] as const) {
    await befriend(a, b);
  }
  await call(minh, 'PUT', `/friends/${lan.id}/close`, { close: true });
  await call(chloe, 'PUT', `/friends/${minh.id}/close`, { close: true });

  // Friends sharing their location around Thảo Điền.
  const sharing: Array<[Session, { latitude: number; longitude: number }]> = [
    [lan, at(0.0021, -0.0032)],
    [chloe, at(-0.0018, 0.0026)],
    [alex, at(0.0034, 0.0019)],
    [vy, at(-0.0029, -0.0021)],
  ];
  for (const [s] of sharing) await call(s, 'PUT', '/me/privacy', { sharing_enabled: true, ghost_mode: false, audience: 'FRIENDS' });
  const move = async () => {
    for (const [s, p] of sharing) {
      await call(s, 'PUT', '/me/location', { latitude: p.latitude + jitter(0.0008), longitude: p.longitude + jitter(0.0008), accuracy: 12 });
    }
  };
  await move();

  // Shop (pre-moderated) approved by the admin, with a menu and a flash deal.
  const mine = await call(hung, 'GET', '/me/shops');
  let shop = mine.items.find((s: any) => s.name === 'Zenzy Coffee & Tea');
  if (!shop) {
    shop = await call(hung, 'POST', '/shops', {
      name: 'Zenzy Coffee & Tea',
      description: 'Neighbourhood café with ceremonial matcha, cold brew and a cozy corner to catch up with friends.',
      address: '24 Xuân Thủy, Thảo Điền, TP. Thủ Đức',
      ...at(0.0012, 0.0011),
      hours: '07:00 – 22:00',
      menu: [
        { name: 'Signature Matcha Latte', price: 58000 },
        { name: 'Iced Oat Latte', price: 55000 },
        { name: 'Jasmine Peach Tea', price: 45000 },
        { name: 'Salted Cream Cold Brew', price: 52000 },
      ],
    });
    await call(thao, 'PATCH', `/admin/shops/${shop.id}`, { decision: 'APPROVE' });
    await call(hung, 'POST', `/shops/${shop.id}/deals`, { title: 'Happy hour matcha', discount: '-50%', end_time: inHours(6) });
  }
  const pending = (await call(vy, 'GET', '/me/shops')).items.find((s: any) => s.name === 'Bánh Mì Corner');
  if (!pending) {
    await call(vy, 'POST', '/shops', {
      name: 'Bánh Mì Corner',
      description: 'Crispy bánh mì and iced coffee to go.',
      address: '12 Thảo Điền, TP. Thủ Đức',
      ...at(-0.0016, -0.0009),
      hours: '06:00 – 14:00',
      menu: [{ name: 'Bánh mì thịt', price: 30000 }],
    }).catch(() => undefined); // stays PENDING: visible in the admin queue
  }

  // Events: a live pin happening now, a scheduled event, and a close-friends hangout.
  const hosted = await call(lan, 'GET', '/me/events');
  if (!hosted.hosted.some((e: any) => e.title === 'Need +2 for basketball')) {
    const basketball = await call(lan, 'POST', '/events', {
      title: 'Need +2 for basketball',
      type: 'SPORTS',
      description: 'Casual pick-up game, friendly vibes. Bring a black/white shirt if possible!',
      ...at(0.0025, 0.0005),
      place_name: 'Riverside Courts · Court 2',
      end_time: inHours(2),
      max_participants: 6,
    });
    const req = await call(alex, 'POST', `/events/${basketball.id}/requests`);
    await call(lan, 'PATCH', `/events/${basketball.id}/requests/${req.request_id}`, { status: 'APPROVED' });
    await call(vy, 'POST', `/events/${basketball.id}/requests`);
    await call(lan, 'POST', '/events', {
      title: 'Weekend study group: Data Structures',
      type: 'STUDY',
      description: 'Bring your laptop. We will go through past exam questions together.',
      ...at(-0.0008, 0.0031),
      place_name: 'Zenzy Coffee & Tea',
      start_time: inHours(26),
      end_time: inHours(29),
      max_participants: 8,
    });
  }
  const chloeEvents = await call(chloe, 'GET', '/me/events');
  if (!chloeEvents.hosted.length) {
    await call(chloe, 'POST', '/events', {
      title: 'Firepit hangout 🔥',
      type: 'EVENT',
      description: 'Marshmallows and music by the river. Close friends only.',
      ...at(-0.0021, 0.0035),
      place_name: 'Sài Gòn Riverside',
      end_time: inHours(4),
      audience: 'CLOSE_FRIENDS',
    });
    await call(chloe, 'POST', '/events', {
      title: 'Weekly Soccer Run',
      type: 'SPORTS',
      description: 'A friendly 5-a-side with the neighbourhood crew. Bring boots, water & good energy.',
      ...at(0.0031, -0.0024),
      place_name: 'Riverside Courts',
      start_time: inHours(48),
      end_time: inHours(49.5),
      max_participants: 12,
    });
  }

  // Posts.
  const feed = await call(minh, 'GET', '/posts');
  if (!feed.items.length) {
    await call(vy, 'POST', '/posts', { text: 'Matcha happy hour at Zenzy Coffee & Tea is unreal 🍵✨ half price until tonight!', place_name: 'Zenzy Coffee & Tea', ...at(0.0012, 0.0011) });
    await call(chloe, 'POST', '/posts', { text: 'Weekly community run was a major success! Over 40 people showed up today 🏃‍♀️☀️', place_name: 'Riverside Park', ...at(0.003, -0.002) });
    await call(lan, 'POST', '/posts', { text: 'Looking for 2 more players for basketball tonight. Join the live pin on the map! 🏀', place_name: 'Riverside Courts', ...at(0.0025, 0.0005) });
  }

  // A direct chat between minh and lan.
  const conv = await call(minh, 'POST', '/conversations', { type: 'DIRECT', member_ids: [lan.id] });
  const history = await call(minh, 'GET', `/conversations/${conv.id}/messages`);
  if (!history.items.length) {
    await call(minh, 'POST', `/conversations/${conv.id}/messages`, { content: 'Hey Lan! Are you at the courts already?' });
    await call(lan, 'POST', `/conversations/${conv.id}/messages`, { content: 'Yes! Court 2, we still need two more 🏀' });
  }

  console.log('demo data ready. Accounts (password "password123"): minh, lan, vy.pham, hung, chloe, alex, thao (admin)');
  if (live) {
    console.log('moving demo friends every 30 s; Ctrl+C to stop');
    for (let tick = 1; ; tick++) {
      await new Promise((r) => setTimeout(r, 30_000));
      for (const [s, p] of sharing) {
        p.latitude += jitter(0.0006);
        p.longitude += jitter(0.0006);
        if (tick % 20 === 0) s.token = (await call(null, 'POST', '/auth/login', { username: s.username, password: PASSWORD })).tokens.access_token;
      }
      await move().catch((e) => console.error(e.message));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
