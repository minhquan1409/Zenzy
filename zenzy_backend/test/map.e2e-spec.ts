import { ObjectId } from 'mongodb';
import { Socket } from 'socket.io-client';
import { auth, collect, connectSocket, inHours, makeFriends, PLACES, registerUser, startApp, stopApp, TestContext, TestUser, waitFor } from './helpers';

/** SEQ-01 (nearby map) and SEQ-02 (Ghost Mode), NFR-09, NFR-14, BR-05, UC-23. */
describe('Map, location sharing and Ghost Mode', () => {
  let ctx: TestContext;
  let a: TestUser; // viewer
  let b: TestUser; // friend who shares
  let c: TestUser; // stranger
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await startApp();
    [a, b, c] = await Promise.all([registerUser(ctx), registerUser(ctx), registerUser(ctx)]);
    await makeFriends(ctx, a, b);
  });
  afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));
  afterAll(async () => stopApp(ctx));

  const nearby = (u: TestUser, at = PLACES.benThanh, extra = '') =>
    ctx.http().get(`/v1/map/nearby?latitude=${at.latitude}&longitude=${at.longitude}${extra}`).set(auth(u));
  const share = (u: TestUser, body: object = {}) =>
    ctx.http().put('/v1/me/privacy').set(auth(u)).send({ sharing_enabled: true, ghost_mode: false, ...body }).expect(200);
  const sendLocation = (u: TestUser, at = PLACES.turtleLake) => ctx.http().put('/v1/me/location').set(auth(u)).send({ ...at, accuracy: 10 });

  it('sharing is off until the user agrees: sending a location is refused', async () => {
    const r = await sendLocation(b).expect(409);
    expect(r.body.code).toBe('SHARING_OFF');
  });

  it('shows a sharing friend to friends only, with updated_at, and pushes live updates', async () => {
    await share(b);
    await sendLocation(b).expect(204);

    const forA = await nearby(a).expect(200);
    expect(forA.body.friends).toHaveLength(1);
    expect(forA.body.friends[0]).toMatchObject({ user: { id: b.id }, latitude: PLACES.turtleLake.latitude, longitude: PLACES.turtleLake.longitude });
    expect(forA.body.friends[0].updated_at).toBeTruthy();

    const forC = await nearby(c).expect(200);
    expect(forC.body.friends).toHaveLength(0);

    const sa = await connectSocket(ctx, a);
    const sc = await connectSocket(ctx, c);
    sockets.push(sa, sc);
    const gotA = waitFor(sa, 'location:update', (p) => p.user_id === b.id);
    const gotC = collect(sc, 'location:update');
    await sendLocation(b, PLACES.benThanh).expect(204);
    expect((await gotA).latitude).toBe(PLACES.benThanh.latitude);
    expect(await gotC).toHaveLength(0);
  });

  it('only one latest location document is kept per user (no history)', async () => {
    await sendLocation(b, PLACES.turtleLake).expect(204);
    await sendLocation(b, PLACES.benThanh).expect(204);
    expect(await ctx.db.userLocations.countDocuments({ _id: new ObjectId(b.id) })).toBe(1);
    const idx = await ctx.db.userLocations.indexes();
    expect(idx.find((i) => i.key.updated_at)?.expireAfterSeconds).toBe(900);
  });

  it('ignores locations older than 15 minutes even before the TTL cleanup runs', async () => {
    await ctx.db.userLocations.updateOne({ _id: new ObjectId(b.id) }, { $set: { updated_at: new Date(Date.now() - 16 * 60_000) } });
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(0);
    await sendLocation(b).expect(204);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(1);
  });

  it('Ghost Mode deletes the stored location, emits location:hide and blocks further sends', async () => {
    const sa = await connectSocket(ctx, a);
    sockets.push(sa);
    const hidden = waitFor(sa, 'location:hide', (p) => p.user_id === b.id);
    const r = await ctx.http().put('/v1/me/privacy').set(auth(b)).send({ ghost_mode: true }).expect(200);
    expect(r.body.ghost_mode).toBe(true);
    await hidden;
    expect(await ctx.db.userLocations.countDocuments({ _id: new ObjectId(b.id) })).toBe(0);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(0);
    expect((await sendLocation(b).expect(409)).body.code).toBe('SHARING_OFF');

    await ctx.http().put('/v1/me/privacy').set(auth(b)).send({ ghost_mode: false }).expect(200);
    await sendLocation(b).expect(204);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(1);
  });

  it('close-friends audience hides the user from ordinary friends', async () => {
    const d = await registerUser(ctx);
    await makeFriends(ctx, b, d);
    await ctx.http().put(`/v1/friends/${a.id}/close`).set(auth(b)).send({ close: true }).expect(200);
    await share(b, { audience: 'CLOSE_FRIENDS' });
    await sendLocation(b).expect(204);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(1);
    expect((await nearby(d).expect(200)).body.friends).toHaveLength(0);
    await share(b, { audience: 'FRIENDS' });
    expect((await nearby(d).expect(200)).body.friends).toHaveLength(1);
  });

  it('time-limited sharing stops automatically when the limit passes', async () => {
    await share(b, { share_until: inHours(1) });
    await sendLocation(b).expect(204);
    await ctx.db.users.updateOne({ _id: new ObjectId(b.id) }, { $set: { 'location_sharing.until': new Date(Date.now() - 1000) } });
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(0);
    expect((await sendLocation(b).expect(409)).body.code).toBe('SHARING_OFF');
    const me = await ctx.http().get('/v1/me/privacy').set(auth(b)).expect(200);
    expect(me.body.sharing_enabled).toBe(false);
    await share(b);
    await sendLocation(b).expect(204);
  });

  it('a block in either direction removes the friend from the map', async () => {
    await sendLocation(b).expect(204);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(1);
    await ctx.http().post('/v1/blocks').set(auth(b)).send({ user_id: a.id }).expect(201);
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(0);
    await ctx.http().get(`/v1/users/${b.id}`).set(auth(a)).expect(404);
    await ctx.http().delete(`/v1/blocks/${a.id}`).set(auth(b)).expect(204);
    // unblocking does not restore the friendship
    expect((await nearby(a).expect(200)).body.friends).toHaveLength(0);
    await makeFriends(ctx, a, b);
  });

  it('users under 16 need guardian consent before sharing (NFR-20)', async () => {
    const teen = await registerUser(ctx, undefined, `${new Date().getUTCFullYear() - 14}-01-01`);
    const r = await ctx.http().put('/v1/me/privacy').set(auth(teen)).send({ sharing_enabled: true }).expect(403);
    expect(r.body.code).toBe('GUARDIAN_CONSENT_REQUIRED');
    await ctx.http().put('/v1/me/guardian-consent').set(auth(teen)).send({ confirmed: true }).expect(200);
    await ctx.http().put('/v1/me/privacy').set(auth(teen)).send({ sharing_enabled: true }).expect(200);
  });

  it('returns events and approved shops inside the radius only (GeoJSON lon/lat order)', async () => {
    await ctx.http().post('/v1/events').set(auth(c)).send({ title: 'Near event', type: 'SPORTS', ...PLACES.turtleLake, end_time: inHours(2) }).expect(201);
    await ctx.http().post('/v1/events').set(auth(c)).send({ title: 'Far event', type: 'SPORTS', ...PLACES.thuDuc, end_time: inHours(2) }).expect(201);
    const shop = await ctx.http().post('/v1/shops').set(auth(c)).send({ name: 'Matcha Corner', address: '1 Le Loi', ...PLACES.turtleLake }).expect(201);

    let r = await nearby(a).expect(200);
    expect(r.body.events.map((e: any) => e.title)).toEqual(['Near event']);
    expect(r.body.shops).toHaveLength(0); // PENDING shops are invisible (BR-04)

    await ctx.db.shops.updateOne({ _id: new ObjectId(shop.body.id) }, { $set: { status: 'APPROVED' } });
    await ctx.http().post(`/v1/shops/${shop.body.id}/deals`).set(auth(c)).send({ title: 'Happy hour', discount: '-20%', end_time: inHours(1) }).expect(201);
    r = await nearby(a, PLACES.benThanh, '&types=shops').expect(200);
    expect(r.body.events).toHaveLength(0);
    expect(r.body.shops).toHaveLength(1);
    expect(r.body.shops[0]).toMatchObject({ name: 'Matcha Corner', has_active_deal: true });

    const s = await ctx.http().get(`/v1/search?q=matcha&latitude=${PLACES.benThanh.latitude}&longitude=${PLACES.benThanh.longitude}`).set(auth(a)).expect(200);
    expect(s.body.items[0]).toMatchObject({ type: 'SHOP', name: 'Matcha Corner' });
    expect(s.body.items[0].distance_m).toBeGreaterThan(900);
    expect(s.body.items[0].distance_m).toBeLessThan(1500);
  });

  it('closes a socket when its access token expires', async () => {
    const jwt = await import('jsonwebtoken');
    const u = await registerUser(ctx);
    const shortLived = jwt.sign({ role: 'USER', typ: 'access' }, process.env.JWT_SECRET!, { algorithm: 'HS256', subject: u.id, expiresIn: 2 });
    const socket = await connectSocket(ctx, { ...u, token: shortLived });
    const expired = waitFor<{ code: string }>(socket, 'connection:error', () => true, 5000);
    const gone = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    expect((await expired).code).toBe('TOKEN_EXPIRED');
    await gone;
    socket.close();
  });
});
