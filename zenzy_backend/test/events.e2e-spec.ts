import { ObjectId } from 'mongodb';
import { auth, connectSocket, inHours, makeFriends, PLACES, registerUser, startApp, stopApp, TestContext, TestUser, waitFor } from './helpers';

/** SEQ-03 (create event) and SEQ-04 (join request and host approval); BR-01, BR-02, BR-06. */
describe('Events and live pins', () => {
  let ctx: TestContext;
  let host: TestUser;
  let u1: TestUser;
  let u2: TestUser;
  let u3: TestUser;

  beforeAll(async () => {
    ctx = await startApp();
    [host, u1, u2, u3] = await Promise.all([registerUser(ctx), registerUser(ctx), registerUser(ctx), registerUser(ctx)]);
    await ctx.db.bannedKeywords.insertOne({ keyword: 'scamword' });
  });
  afterAll(async () => stopApp(ctx));

  const body = (extra: object = {}) => ({ title: 'Need +2 for basketball', type: 'SPORTS', ...PLACES.benThanh, place_name: 'Riverside Courts', end_time: inHours(2), ...extra });
  const create = (u: TestUser, extra: object = {}, key?: string) => {
    const r = ctx.http().post('/v1/events').set(auth(u));
    if (key) r.set('Idempotency-Key', key);
    return r.send(body(extra));
  };

  it('validates the title length (3 to 80) and the time range', async () => {
    expect((await create(host, { title: 'ab' }).expect(400)).body.code).toBe('INVALID_INPUT');
    await create(host, { title: 'x'.repeat(81) }).expect(400);
    await create(host, { start_time: inHours(3), end_time: inHours(2) }).expect(400);
  });

  it('rejects banned keywords with 422 and saves nothing (BR-01)', async () => {
    const before = await ctx.db.events.countDocuments();
    const r = await create(host, { description: 'totally not a ScamWord' }).expect(422);
    expect(r.body.code).toBe('BANNED_KEYWORD');
    expect(await ctx.db.events.countDocuments()).toBe(before);
  });

  it('an idempotency key never creates a duplicate (NFR-06)', async () => {
    const first = await create(host, {}, 'key-123').expect(201);
    const retry = await create(host, {}, 'key-123').expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(await ctx.db.events.countDocuments({ host_id: new ObjectId(host.id) })).toBe(1);
    expect(first.body).toMatchObject({ status: 'OPEN', is_live: true, host_id: host.id });
  });

  it('refuses a sixth active event with 409 EVENT_LIMIT (BR-02)', async () => {
    const owner = await registerUser(ctx);
    for (let i = 0; i < 5; i++) await create(owner, { title: `Event number ${i}` }).expect(201);
    const sixth = await create(owner, { title: 'Event number 6' }).expect(409);
    expect(sixth.body.code).toBe('EVENT_LIMIT');
    // concurrent creates cannot slip past the limit
    const other = await registerUser(ctx);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => create(other, { title: `Parallel ${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    // an ended event no longer counts
    const anyEvent = await ctx.db.events.findOne({ host_id: new ObjectId(owner.id) });
    await ctx.db.events.updateOne({ _id: anyEvent!._id }, { $set: { status: 'ENDED' } });
    await create(owner, { title: 'Event number 6' }).expect(201);
  });

  it('join request -> host notified; duplicate refused; only the host can decide (BR-06); FULL at max', async () => {
    const ev = (await create(host, { title: 'Two seats only', max_participants: 2 }).expect(201)).body;
    const hostSocket = await connectSocket(ctx, host);
    try {
      const notified = waitFor(hostSocket, 'notification:new', (n) => n.type === 'EVENT_JOIN_REQUEST');
      const r1 = await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(u1)).expect(201);
      expect(r1.body.status).toBe('PENDING');
      expect((await notified).payload.event_id).toBe(ev.id);
    } finally {
      hostSocket.disconnect();
    }
    const dup = await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(u1)).expect(409);
    expect(dup.body.code).toBe('DUPLICATE_REQUEST');

    const r2 = await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(u2)).expect(201);
    const r3 = await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(u3)).expect(201);

    const notHost = await ctx.http().patch(`/v1/events/${ev.id}/requests/${r2.body.request_id}`).set(auth(u1)).send({ status: 'APPROVED' }).expect(403);
    expect(notHost.body.code).toBe('NOT_HOST');
    await ctx.http().patch(`/v1/events/${ev.id}`).set(auth(u1)).send({ title: 'Hijacked' }).expect(403);
    await ctx.http().delete(`/v1/events/${ev.id}/members/${u2.id}`).set(auth(u1)).expect(403);

    const reqs = await ctx.http().get(`/v1/events/${ev.id}/participants`).set(auth(host)).expect(200);
    const u1Req = reqs.body.items.find((i: any) => i.user.id === u1.id);
    const a1 = await ctx.http().patch(`/v1/events/${ev.id}/requests/${u1Req.request_id}`).set(auth(host)).send({ status: 'APPROVED' }).expect(200);
    expect(a1.body.event.status).toBe('OPEN');
    const a2 = await ctx.http().patch(`/v1/events/${ev.id}/requests/${r2.body.request_id}`).set(auth(host)).send({ status: 'APPROVED' }).expect(200);
    expect(a2.body.event).toMatchObject({ status: 'FULL', participants_count: 2, spots_left: 0 });

    // the approved member is in the event chat
    const conv = await ctx.db.conversations.findOne({ event_id: new ObjectId(ev.id) });
    expect(conv!.member_ids.map(String)).toEqual(expect.arrayContaining([host.id, u1.id, u2.id]));

    // no seat left: approving the third request fails and nothing changes
    const a3 = await ctx.http().patch(`/v1/events/${ev.id}/requests/${r3.body.request_id}`).set(auth(host)).send({ status: 'APPROVED' }).expect(409);
    expect(a3.body.code).toBe('EVENT_FULL');
    expect((await ctx.db.participants.findOne({ _id: new ObjectId(r3.body.request_id) }))!.status).toBe('PENDING');

    const late = await registerUser(ctx);
    expect((await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(late)).expect(409)).body.code).toBe('EVENT_FULL');

    // non-hosts see only approved members
    const pub = await ctx.http().get(`/v1/events/${ev.id}/participants`).set(auth(u3)).expect(200);
    expect(pub.body.items.every((i: any) => i.status === 'APPROVED')).toBe(true);

    // leaving releases the seat: FULL becomes OPEN, and the member leaves the chat (UC-10)
    await ctx.http().delete(`/v1/events/${ev.id}/requests/me`).set(auth(u1)).expect(204);
    let detail = await ctx.http().get(`/v1/events/${ev.id}`).set(auth(u1)).expect(200);
    expect(detail.body).toMatchObject({ status: 'OPEN', participants_count: 1, my_status: 'LEFT', conversation_id: null });

    // host kicks a member (KICKED), seat released
    await ctx.http().delete(`/v1/events/${ev.id}/members/${u2.id}`).set(auth(host)).expect(204);
    detail = await ctx.http().get(`/v1/events/${ev.id}`).set(auth(u2)).expect(200);
    expect(detail.body).toMatchObject({ my_status: 'KICKED', participants_count: 0 });
    expect((await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(u2)).expect(409)).body.code).toBe('DUPLICATE_REQUEST');

    // cancelling: members are notified; joining is refused
    await ctx.http().post(`/v1/events/${ev.id}/cancel`).set(auth(host)).send({ reason: 'Rain' }).expect(200);
    expect((await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(late)).expect(409)).body.code).toBe('EVENT_ENDED');
    const notes = await ctx.db.notifications.find({ user_id: new ObjectId(u3.id), type: 'EVENT_UPDATE' }).toArray();
    expect(notes.some((n) => String(n.payload.message).includes('cancelled'))).toBe(true);
  });

  it('a user blocked by the host cannot join (403)', async () => {
    const ev = (await create(host, { title: 'Block test event' }).expect(201)).body;
    const blocked = await registerUser(ctx);
    await ctx.http().post('/v1/blocks').set(auth(host)).send({ user_id: blocked.id }).expect(201);
    const r = await ctx.http().post(`/v1/events/${ev.id}/requests`).set(auth(blocked)).expect(403);
    expect(r.body.code).toBe('BLOCKED_BY_HOST');
  });

  it('close-friends events are invisible to everyone else (US-08)', async () => {
    const h = await registerUser(ctx);
    const close = await registerUser(ctx);
    const friend = await registerUser(ctx);
    await makeFriends(ctx, h, close);
    await makeFriends(ctx, h, friend);
    await ctx.http().put(`/v1/friends/${close.id}/close`).set(auth(h)).send({ close: true }).expect(200);
    const ev = (await create(h, { title: 'Firepit hangout', audience: 'CLOSE_FRIENDS', ...PLACES.thuDuc }).expect(201)).body;

    await ctx.http().get(`/v1/events/${ev.id}`).set(auth(close)).expect(200);
    await ctx.http().get(`/v1/events/${ev.id}`).set(auth(friend)).expect(404);
    const q = `/v1/events?latitude=${PLACES.thuDuc.latitude}&longitude=${PLACES.thuDuc.longitude}`;
    expect((await ctx.http().get(q).set(auth(close)).expect(200)).body.items.map((e: any) => e.id)).toContain(ev.id);
    expect((await ctx.http().get(q).set(auth(friend)).expect(200)).body.items.map((e: any) => e.id)).not.toContain(ev.id);
  });

  it('ended events are not listed, and the scheduler marks them ENDED', async () => {
    const h = await registerUser(ctx);
    const ev = (await create(h, { title: 'Short event', ...PLACES.turtleLake }).expect(201)).body;
    await ctx.db.events.updateOne({ _id: new ObjectId(ev.id) }, { $set: { ends_at: new Date(Date.now() - 1000) } });
    const list = await ctx.http().get(`/v1/events?latitude=${PLACES.turtleLake.latitude}&longitude=${PLACES.turtleLake.longitude}`).set(auth(u1)).expect(200);
    expect(list.body.items.map((e: any) => e.id)).not.toContain(ev.id);
    const { EventsService } = await import('../src/events/events.service');
    await ctx.app.get(EventsService).endPastEvents();
    expect((await ctx.db.events.findOne({ _id: new ObjectId(ev.id) }))!.status).toBe('ENDED');
  });
});
