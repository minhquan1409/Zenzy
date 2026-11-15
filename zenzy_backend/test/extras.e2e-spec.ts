import { ObjectId } from 'mongodb';
import { tmpdir } from 'os';
import { join } from 'path';
import { auth, inHours, makeAdmin, PLACES, registerUser, startApp, stopApp, TestContext, TestUser } from './helpers';

/** Endpoints added for the Android app: profile stats, my events, single post, shop hours, local uploads. */
describe('App support endpoints', () => {
  let ctx: TestContext;
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    process.env.MEDIA_LOCAL_DIR = join(tmpdir(), `zenzy-media-${Date.now()}`);
    ctx = await startApp();
    [a, b] = await Promise.all([registerUser(ctx), registerUser(ctx)]);
  });
  afterAll(async () => {
    await stopApp(ctx);
    delete process.env.MEDIA_LOCAL_DIR;
  });

  it('GET /me and GET /users/{id} include friends, events joined and posts counts', async () => {
    await ctx.http().post('/v1/posts').set(auth(a)).send({ text: 'hello' }).expect(201);
    const me = await ctx.http().get('/v1/me').set(auth(a)).expect(200);
    expect(me.body.profile).toMatchObject({ friends_count: 0, events_joined: 0, posts_count: 1 });
    const other = await ctx.http().get(`/v1/users/${a.id}`).set(auth(b)).expect(200);
    expect(other.body).toMatchObject({ posts_count: 1, friendship_status: 'NONE' });
  });

  it('GET /me/events lists hosted events with pending counts and joined events with my status', async () => {
    const ev = (await ctx.http().post('/v1/events').set(auth(a)).send({ title: 'Board games', type: 'OTHER', ...PLACES.benThanh, end_time: inHours(2) }).expect(201)).body;
    await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(b)).expect(201);
    const host = await ctx.http().get('/v1/me/events').set(auth(a)).expect(200);
    expect(host.body.hosted[0]).toMatchObject({ id: ev.id, pending_requests: 1 });
    const guest = await ctx.http().get('/v1/me/events').set(auth(b)).expect(200);
    expect(guest.body.joined[0]).toMatchObject({ id: ev.id, my_status: 'PENDING' });
  });

  it('GET /posts/{id} and GET /posts?author_id follow the feed visibility rules', async () => {
    const p = (await ctx.http().post('/v1/posts').set(auth(b)).send({ text: 'visible' }).expect(201)).body;
    await ctx.http().get(`/v1/posts/${p.id}`).set(auth(a)).expect(200);
    const mine = await ctx.http().get(`/v1/posts?author_id=${b.id}`).set(auth(a)).expect(200);
    expect(mine.body.items.map((x: any) => x.id)).toEqual([p.id]);
    await ctx.http().post('/v1/blocks').set(auth(b)).send({ user_id: a.id }).expect(201);
    await ctx.http().get(`/v1/posts/${p.id}`).set(auth(a)).expect(404);
    await ctx.http().delete(`/v1/blocks/${a.id}`).set(auth(b)).expect(204);
  });

  it('shops keep opening hours and a cover photo', async () => {
    const admin = await registerUser(ctx);
    await makeAdmin(ctx, admin);
    const s = (await ctx.http().post('/v1/shops').set(auth(a)).send({
      name: 'Hours Cafe', address: '1 Test St', ...PLACES.benThanh, hours: '07:00 – 22:00', cover_url: 'https://cdn.example.com/c.jpg',
    }).expect(201)).body;
    expect(s).toMatchObject({ hours: '07:00 – 22:00', cover_url: 'https://cdn.example.com/c.jpg', status: 'PENDING' });
    await ctx.http().patch(`/v1/admin/shops/${s.id}`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
    const near = await ctx.http().get(`/v1/map/nearby?latitude=${PLACES.benThanh.latitude}&longitude=${PLACES.benThanh.longitude}&types=shops`).set(auth(b)).expect(200);
    expect(near.body.shops[0]).toMatchObject({ name: 'Hours Cafe', hours: '07:00 – 22:00' });
  });

  it('development uploads: signed form to /uploads/local, file served from /media, bad signature refused', async () => {
    const t = (await ctx.http().post('/v1/uploads/sign').set(auth(a)).send({ purpose: 'AVATAR', content_type: 'image/png' }).expect(200)).body;
    expect(t.upload_url).toMatch(/\/v1\/uploads\/local$/);
    const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
    const send = (fields: Record<string, string>) => {
      let r = ctx.http().post('/v1/uploads/local');
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return r.attach('file', png, { filename: 'a.png', contentType: 'image/png' });
    };
    await send({ ...t.fields, signature: '0'.repeat(64) }).expect(403);
    await send(t.fields).expect(204);
    const path = new URL(t.public_url).pathname;
    const got = await ctx.http().get(path).expect(200);
    expect(Buffer.compare(got.body, png)).toBe(0);
    await ctx.http().patch('/v1/me').set(auth(a)).send({ avatar_url: t.public_url }).expect(200);
    expect((await ctx.db.users.findOne({ _id: new ObjectId(a.id) }))!.avatar_url).toBe(t.public_url);
  });

  it('serves the admin dashboard page', async () => {
    const r = await ctx.http().get('/admin/').expect(200);
    expect(r.text).toContain('Zenzy Admin');
  });
});
