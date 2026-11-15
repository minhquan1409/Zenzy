import { ObjectId } from 'mongodb';
import { AppConfig } from '../src/core/config';
import { auth, makeFriends, PLACES, registerUser, startApp, stopApp, TestContext, TestUser } from './helpers';

/** Protection against mass data collection: search, rate limits, location rounding and probing, scraping pause. */
describe('Anti-scraping', () => {
  let ctx: TestContext;
  let config: AppConfig;

  beforeAll(async () => {
    ctx = await startApp();
    config = ctx.app.get(AppConfig);
  });
  afterAll(async () => stopApp(ctx));
  afterEach(() => {
    config.rateLimitScale = 1000;
    config.geoJumpsPerHour = 100000;
    config.scrapeProfileLimit = 60;
  });

  it('user search: 3+ characters, at most 10 results, no bio, discoverable off = exact username only', async () => {
    const me = await registerUser(ctx);
    const prefix = `srch${Date.now() % 100000}`;
    const others: TestUser[] = [];
    for (let i = 0; i < 12; i++) others.push(await registerUser(ctx, `${prefix}_${String(i).padStart(2, '0')}`));
    await ctx.http().patch('/v1/me').set(auth(others[0])).send({ bio: 'secret bio' }).expect(200);

    expect((await ctx.http().get('/v1/users?username=sr').set(auth(me)).expect(400)).body.code).toBe('INVALID_INPUT');
    const res = await ctx.http().get(`/v1/users?username=${prefix}`).set(auth(me)).expect(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.items[0]).not.toHaveProperty('bio');

    const hidden = others[0];
    const p = await ctx.http().put('/v1/me/privacy').set(auth(hidden)).send({ discoverable: false }).expect(200);
    expect(p.body.discoverable).toBe(false);
    const again = await ctx.http().get(`/v1/users?username=${prefix}`).set(auth(me)).expect(200);
    expect(again.body.items.map((u: { id: string }) => u.id)).not.toContain(hidden.id);
    const exact = await ctx.http().get(`/v1/users?username=${hidden.username}`).set(auth(me)).expect(200);
    expect(exact.body.items.map((u: { id: string }) => u.id)).toEqual([hidden.id]);
  });

  it('rate limit: the 31st user search in an hour answers 429 RATE_LIMITED with Retry-After', async () => {
    config.rateLimitScale = 1;
    const me = await registerUser(ctx);
    for (let i = 0; i < 30; i++) await ctx.http().get('/v1/users?username=nobodyhere').set(auth(me)).expect(200);
    const res = await ctx.http().get('/v1/users?username=nobodyhere').set(auth(me)).expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // another account is not affected
    const other = await registerUser(ctx);
    await ctx.http().get('/v1/users?username=nobodyhere').set(auth(other)).expect(200);
  });

  it('post positions are exact for friends and rounded to ~100 m for everyone else', async () => {
    const [author, friend, stranger] = [await registerUser(ctx), await registerUser(ctx), await registerUser(ctx)];
    await makeFriends(ctx, author, friend);
    const post = await ctx.http()
      .post('/v1/posts')
      .set(auth(author))
      .send({ text: 'here', latitude: 10.772512, longitude: 106.698049 })
      .expect(201);
    const seen = async (u: TestUser) => (await ctx.http().get(`/v1/posts/${post.body.id}`).set(auth(u)).expect(200)).body;
    expect(await seen(author)).toMatchObject({ latitude: 10.772512, longitude: 106.698049 });
    expect(await seen(friend)).toMatchObject({ latitude: 10.772512, longitude: 106.698049 });
    expect(await seen(stranger)).toMatchObject({ latitude: 10.773, longitude: 106.698 });
  });

  it('map search centre jumping far away too often answers 429 LOCATION_JUMP', async () => {
    config.geoJumpsPerHour = 2;
    const me = await registerUser(ctx);
    const hanoi = { latitude: 21.0285, longitude: 105.8542 };
    const q = (p: { latitude: number; longitude: number }) =>
      ctx.http().get(`/v1/map/nearby?latitude=${p.latitude}&longitude=${p.longitude}`).set(auth(me));
    await q(PLACES.benThanh).expect(200);
    await q(PLACES.thuDuc).expect(200); // 10 km: not a jump
    await q(hanoi).expect(200); // jump 1
    await q(PLACES.benThanh).expect(200); // jump 2
    const res = await q(hanoi).expect(429);
    expect(res.body.code).toBe('LOCATION_JUMP');
    await q(PLACES.turtleLake).expect(200); // nearby moves still work
  });

  it('opening too many strangers profiles pauses browsing and keeps friends unaffected', async () => {
    config.scrapeProfileLimit = 3;
    const [scraper, friend] = [await registerUser(ctx), await registerUser(ctx)];
    await makeFriends(ctx, scraper, friend);
    const targets = [await registerUser(ctx), await registerUser(ctx), await registerUser(ctx), await registerUser(ctx)];
    await ctx.http().get(`/v1/users/${friend.id}`).set(auth(scraper)).expect(200); // friends do not count
    for (const t of targets.slice(0, 3)) await ctx.http().get(`/v1/users/${t.id}`).set(auth(scraper)).expect(200);
    await ctx.http().get(`/v1/users/${targets[0].id}`).set(auth(scraper)).expect(200); // same profile again: not counted
    const res = await ctx.http().get(`/v1/users/${targets[3].id}`).set(auth(scraper)).expect(429);
    expect(res.body.code).toBe('BROWSING_PAUSED');
    expect((await ctx.http().get('/v1/users?username=abc').set(auth(scraper)).expect(429)).body.code).toBe('BROWSING_PAUSED');
    await ctx.http().get('/v1/posts').set(auth(scraper)).expect(429);
    await ctx.http().get('/v1/me').set(auth(scraper)).expect(200); // own data still works
    const u = await ctx.db.users.findOne({ _id: new ObjectId(scraper.id) });
    expect(u?.browse_locked_until?.getTime()).toBeGreaterThan(Date.now());
  });
});
