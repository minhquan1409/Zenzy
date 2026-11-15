import { ObjectId } from 'mongodb';
import { auth, inHours, makeAdmin, PLACES, registerUser, startApp, stopApp, TestContext, TestUser } from './helpers';

/** SEQ-05 (report and moderate), BR-03, BR-04, BR-07, UC-18, UC-20. */
describe('Reports, auto-hide and admin moderation', () => {
  let ctx: TestContext;
  let admin: TestUser;
  let author: TestUser;
  let r1: TestUser;
  let r2: TestUser;
  let r3: TestUser;

  beforeAll(async () => {
    ctx = await startApp();
    [admin, author, r1, r2, r3] = await Promise.all([registerUser(ctx), registerUser(ctx), registerUser(ctx), registerUser(ctx), registerUser(ctx)]);
    await makeAdmin(ctx, admin);
  });
  afterAll(async () => stopApp(ctx));

  const report = (u: TestUser, target_type: string, target_id: string, reason = 'SPAM') =>
    ctx.http().post('/v1/reports').set(auth(u)).send({ target_type, target_id, reason });
  const feedIds = async (u: TestUser) => (await ctx.http().get('/v1/posts').set(auth(u)).expect(200)).body.items.map((p: any) => p.id);

  it('one report per user and item; own content cannot be reported; 3 distinct reporters hide it', async () => {
    const post = (await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'Buy followers cheap' }).expect(201)).body;
    expect((await report(author, 'POST', post.id).expect(400)).body.code).toBe('OWN_CONTENT');

    const first = await report(r1, 'POST', post.id).expect(201);
    expect(first.body.created).toBe(true);
    const again = await report(r1, 'POST', post.id).expect(200);
    expect(again.body.created).toBe(false);
    expect(await ctx.db.reports.countDocuments({ target_id: new ObjectId(post.id) })).toBe(1);

    await report(r2, 'POST', post.id).expect(201);
    expect(await feedIds(r3)).toContain(post.id);
    const third = await report(r3, 'POST', post.id, 'SCAM').expect(201);
    expect(third.body.hidden).toBe(true);
    expect(await feedIds(r3)).not.toContain(post.id);
    expect(await feedIds(author)).not.toContain(post.id);
  });

  it('admin routes return 403 to normal users', async () => {
    for (const [method, path] of [
      ['get', '/v1/admin/reports'],
      ['get', '/v1/admin/shops'],
      ['get', '/v1/admin/users'],
      ['patch', `/v1/admin/users/${r1.id}/status`],
    ] as const) {
      const r = await ctx.http()[method](path).set(auth(r1)).send({ status: 'SUSPENDED', reason: 'x' }).expect(403);
      expect(r.body.code).toBe('FORBIDDEN');
    }
  });

  it('queue is sorted by report count; REMOVE runs in one transaction with an audit entry; first admin wins', async () => {
    const other = (await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'mildly annoying' }).expect(201)).body;
    await report(r1, 'POST', other.id).expect(201);

    const q = await ctx.http().get('/v1/admin/reports').set(auth(admin)).expect(200);
    expect(q.body.items[0]).toMatchObject({ target_type: 'POST', report_count: 3 });
    expect(q.body.items[0].target.status).toBe('HIDDEN');
    expect(q.body.items[1].report_count).toBe(1);

    const reportId = q.body.items[0].report_id;
    const res = await ctx.http().patch(`/v1/admin/reports/${reportId}`).set(auth(admin)).send({ action: 'REMOVE_WARN', reason: 'Scam advertising' }).expect(200);
    expect(res.body).toMatchObject({ status: 'RESOLVED', action: 'REMOVE_WARN' });

    const targetId = new ObjectId(q.body.items[0].target_id);
    expect((await ctx.db.posts.findOne({ _id: targetId }))!.status).toBe('REMOVED');
    expect(await ctx.db.reports.countDocuments({ target_id: targetId, status: 'OPEN' })).toBe(0);
    const audit = await ctx.db.auditLog.find({ target_id: targetId }).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'REPORT_REMOVE_WARN', reason: 'Scam advertising' });
    const note = await ctx.db.notifications.findOne({ user_id: new ObjectId(author.id), type: 'MODERATION' });
    expect(String(note!.payload.message)).toContain('Scam advertising');
    expect((await ctx.db.users.findOne({ _id: new ObjectId(author.id) }))!.warnings).toBe(1);

    const twice = await ctx.http().patch(`/v1/admin/reports/${reportId}`).set(auth(admin)).send({ action: 'DISMISS', reason: 'late' }).expect(409);
    expect(twice.body.code).toBe('ALREADY_RESOLVED');
  });

  it('DISMISS restores hidden content', async () => {
    const post = (await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'Unpopular opinion' }).expect(201)).body;
    for (const u of [r1, r2, r3]) await report(u, 'POST', post.id, 'HARASSMENT').expect(201);
    expect(await feedIds(r1)).not.toContain(post.id);
    const rep = await ctx.db.reports.findOne({ target_id: new ObjectId(post.id) });
    await ctx.http().patch(`/v1/admin/reports/${rep!._id}`).set(auth(admin)).send({ action: 'DISMISS', reason: 'Not a violation' }).expect(200);
    expect(await feedIds(r1)).toContain(post.id);
  });

  it('auto-hides events too, and REMOVE_SUSPEND suspends the owner', async () => {
    const host = await registerUser(ctx);
    const ev = (await ctx.http().post('/v1/events').set(auth(host)).send({ title: 'Shady meetup', type: 'OTHER', ...PLACES.benThanh, end_time: inHours(3) }).expect(201)).body;
    for (const u of [r1, r2, r3]) await report(u, 'EVENT', ev.id, 'ILLEGAL').expect(201);
    await ctx.http().get(`/v1/events/${ev.id}`).set(auth(r1)).expect(404);

    const rep = await ctx.db.reports.findOne({ target_id: new ObjectId(ev.id) });
    await ctx.http().patch(`/v1/admin/reports/${rep!._id}`).set(auth(admin)).send({ action: 'REMOVE_SUSPEND', reason: 'Illegal activity' }).expect(200);
    expect((await ctx.db.events.findOne({ _id: new ObjectId(ev.id) }))!.status).toBe('REMOVED');
    const login = await ctx.http().post('/v1/auth/login').send({ username: host.username, password: 'password123' }).expect(403);
    expect(login.body.message).toContain('Illegal activity');

    await ctx.http().patch(`/v1/admin/users/${host.id}/status`).set(auth(admin)).send({ status: 'ACTIVE', reason: 'Appeal accepted' }).expect(200);
    await ctx.http().post('/v1/auth/login').send({ username: host.username, password: 'password123' }).expect(200);
    expect(await ctx.db.auditLog.countDocuments({ target_id: new ObjectId(host.id) })).toBe(1);
  });

  it('shops are pre-moderated: invisible while PENDING, deals need APPROVED, owner notified on reject', async () => {
    const owner = await registerUser(ctx);
    const shop = (await ctx.http().post('/v1/shops').set(auth(owner)).send({ name: 'Zen Tea House', address: '12 Nguyen Hue', ...PLACES.benThanh, menu: [{ name: 'Iced Oat Latte', price: 45000 }] }).expect(201)).body;
    expect(shop.status).toBe('PENDING');
    await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(404);
    await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(owner)).expect(200);
    const deal = await ctx.http().post(`/v1/shops/${shop.id}/deals`).set(auth(owner)).send({ title: 'Opening', discount: '-10%', end_time: inHours(2) }).expect(403);
    expect(deal.body.code).toBe('SHOP_NOT_APPROVED');

    const pending = await ctx.http().get('/v1/admin/shops').set(auth(admin)).expect(200);
    expect(pending.body.items.map((s: any) => s.id)).toContain(shop.id);
    await ctx.http().patch(`/v1/admin/shops/${shop.id}`).set(auth(admin)).send({ decision: 'REJECT' }).expect(400);
    await ctx.http().patch(`/v1/admin/shops/${shop.id}`).set(auth(admin)).send({ decision: 'REJECT', reason: 'Address missing number' }).expect(200);
    const mine = await ctx.http().get('/v1/me/shops').set(auth(owner)).expect(200);
    expect(mine.body.items[0]).toMatchObject({ status: 'REJECTED', reject_reason: 'Address missing number' });

    // editing a rejected shop resubmits it
    await ctx.http().patch(`/v1/shops/${shop.id}`).set(auth(owner)).send({ address: '12A Nguyen Hue' }).expect(200);
    await ctx.http().patch(`/v1/shops/${shop.id}`).set(auth(r1)).send({ name: 'Mine now' }).expect(404);
    await ctx.http().patch(`/v1/admin/shops/${shop.id}`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
    await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(200);
    await ctx.http().patch(`/v1/shops/${shop.id}`).set(auth(r1)).send({ name: 'Mine now' }).expect(403);

    await ctx.http().post(`/v1/shops/${shop.id}/deals`).set(auth(owner)).send({ title: 'Bad range', discount: '-10%', start_time: inHours(2), end_time: inHours(1) }).expect(400);
    const d = (await ctx.http().post(`/v1/shops/${shop.id}/deals`).set(auth(owner)).send({ title: 'Opening', discount: '-10%', end_time: inHours(2) }).expect(201)).body;
    expect(d.status).toBe('ACTIVE');
    const detail = await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(200);
    expect(detail.body.active_deal).toMatchObject({ title: 'Opening', discount: '-10%' });
    expect(detail.body.active_deal.remaining_seconds).toBeGreaterThan(7000);

    await ctx.http().patch(`/v1/shops/${shop.id}/deals/${d.id}`).set(auth(owner)).send({ status: 'CANCELLED' }).expect(200);
    expect((await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(200)).body.active_deal).toBeNull();

    const notes = await ctx.db.notifications.find({ user_id: new ObjectId(owner.id), type: 'SHOP_REVIEW' }).sort({ created_at: 1 }).toArray();
    expect(notes.map((n) => n.payload.status)).toEqual(['REJECTED', 'APPROVED']);
    expect(await ctx.db.auditLog.countDocuments({ target_id: new ObjectId(shop.id) })).toBe(2);
  });

  it('reports never hide a shop on their own: only an admin hides it', async () => {
    const owner = await registerUser(ctx);
    const shop = (await ctx.http().post('/v1/shops').set(auth(owner)).send({ name: 'Corner Cafe', address: '1 Le Loi', ...PLACES.benThanh }).expect(201)).body;
    await ctx.http().patch(`/v1/admin/shops/${shop.id}`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);
    for (const u of [r1, r2, r3]) expect((await report(u, 'SHOP', shop.id).expect(201)).body.hidden).toBe(false);
    expect((await ctx.db.shops.findOne({ _id: new ObjectId(shop.id) }))!.hidden).toBe(false);
    await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(200);

    // the reports wait in the admin queue; the admin decides
    const queue = await ctx.http().get('/v1/admin/reports').set(auth(admin)).expect(200);
    const item = queue.body.items.find((i: any) => i.target_id === shop.id);
    expect(item.report_count).toBe(3);
    await ctx.http().patch(`/v1/admin/reports/${item.report_id}`).set(auth(admin)).send({ action: 'REMOVE', reason: 'Fake shop' }).expect(200);
    await ctx.http().get(`/v1/shops/${shop.id}`).set(auth(r1)).expect(404);
  });

  it('the API offers no way to change or delete audit entries (BR-07)', async () => {
    const before = await ctx.db.auditLog.countDocuments();
    for (const path of ['/v1/admin/audit-log', '/v1/admin/audit']) {
      await ctx.http().delete(path).set(auth(admin)).expect(404);
    }
    expect(await ctx.db.auditLog.countDocuments()).toBe(before);
  });
});
