import { auth, inHours, makeAdmin, makeFriends, PLACES, registerUser, startApp, stopApp, TestContext, TestUser } from './helpers';

/** Routes that the feature suites do not call directly, so that every route of the API has a test. */
describe('Remaining routes', () => {
  let ctx: TestContext;
  let a: TestUser;
  let b: TestUser;

  beforeAll(async () => {
    ctx = await startApp();
    [a, b] = [await registerUser(ctx), await registerUser(ctx)];
    await makeFriends(ctx, a, b);
  });
  afterAll(async () => stopApp(ctx));

  it('PATCH /conversations/{id} mutes, DELETE hides until a new message; strangers are refused', async () => {
    const outsider = await registerUser(ctx);
    const conv = (await ctx.http().post('/v1/conversations').set(auth(a)).send({ type: 'DIRECT', member_ids: [b.id] }).expect(201)).body;
    await ctx.http().post(`/v1/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'hi' }).expect(201);

    expect((await ctx.http().patch(`/v1/conversations/${conv.id}`).set(auth(b)).send({ muted: true }).expect(200)).body).toEqual({ id: conv.id, muted: true });
    const listed = (await ctx.http().get('/v1/conversations').set(auth(b)).expect(200)).body.items;
    expect(listed.find((c: { id: string }) => c.id === conv.id).muted).toBe(true);
    expect((await ctx.http().patch(`/v1/conversations/${conv.id}`).set(auth(b)).send({ muted: false }).expect(200)).body.muted).toBe(false);
    await ctx.http().patch(`/v1/conversations/${conv.id}`).set(auth(b)).send({}).expect(400);
    await ctx.http().patch(`/v1/conversations/${conv.id}`).set(auth(outsider)).send({ muted: true }).expect(403);

    await ctx.http().delete(`/v1/conversations/${conv.id}`).set(auth(b)).expect(204);
    const ids = async (u: TestUser) => (await ctx.http().get('/v1/conversations').set(auth(u)).expect(200)).body.items.map((c: { id: string }) => c.id);
    expect(await ids(b)).not.toContain(conv.id);
    expect(await ids(a)).toContain(conv.id); // only hidden for the one who removed it
    await ctx.http().post(`/v1/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'still there?' }).expect(201);
    expect(await ids(b)).toContain(conv.id);
    await ctx.http().delete(`/v1/conversations/${conv.id}`).set(auth(outsider)).expect(403);
  });

  it('DELETE /friends/{user_id} unfriends, and withdraws a pending request', async () => {
    const [x, y] = [await registerUser(ctx), await registerUser(ctx)];
    await makeFriends(ctx, x, y);
    await ctx.http().delete(`/v1/friends/${y.id}`).set(auth(x)).expect(204);
    expect((await ctx.http().get('/v1/friends').set(auth(y)).expect(200)).body.items).toHaveLength(0);
    expect((await ctx.http().get(`/v1/users/${y.id}`).set(auth(x)).expect(200)).body.friendship_status).toBe('NONE');

    await ctx.http().post('/v1/friends/requests').set(auth(x)).send({ receiver_id: y.id }).expect(201);
    await ctx.http().delete(`/v1/friends/${y.id}`).set(auth(x)).expect(204);
    expect((await ctx.http().get('/v1/friends?status=PENDING').set(auth(y)).expect(200)).body.items).toHaveLength(0);
  });

  it('GET /blocks lists the users I blocked', async () => {
    const [x, y] = [await registerUser(ctx), await registerUser(ctx)];
    expect((await ctx.http().get('/v1/blocks').set(auth(x)).expect(200)).body.items).toEqual([]);
    await ctx.http().post('/v1/blocks').set(auth(x)).send({ user_id: y.id }).expect(201);
    const list = (await ctx.http().get('/v1/blocks').set(auth(x)).expect(200)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0].user).toMatchObject({ id: y.id, username: y.username });
    expect(typeof list[0].blocked_at).toBe('string');
    expect((await ctx.http().get('/v1/blocks').set(auth(y)).expect(200)).body.items).toEqual([]); // not shown to the blocked user
    await ctx.http().delete(`/v1/blocks/${y.id}`).set(auth(x)).expect(204);
    expect((await ctx.http().get('/v1/blocks').set(auth(x)).expect(200)).body.items).toEqual([]);
  });

  it('GET /me/notification-settings returns every type and reflects PUT', async () => {
    const u = await registerUser(ctx);
    const before = (await ctx.http().get('/v1/me/notification-settings').set(auth(u)).expect(200)).body;
    expect(Object.keys(before).sort()).toEqual(
      ['ACCOUNT', 'CHAT_MESSAGE', 'EVENT_JOIN_REQUEST', 'EVENT_REQUEST_RESULT', 'EVENT_UPDATE', 'FRIEND_ACCEPTED', 'FRIEND_REQUEST', 'MODERATION', 'SHOP_REVIEW'],
    );
    expect(before.CHAT_MESSAGE).toBe(true);
    await ctx.http().put('/v1/me/notification-settings').set(auth(u)).send({ CHAT_MESSAGE: false }).expect(200);
    const after = (await ctx.http().get('/v1/me/notification-settings').set(auth(u)).expect(200)).body;
    expect(after).toEqual({ ...before, CHAT_MESSAGE: false });
    await ctx.http().put('/v1/me/notification-settings').set(auth(u)).send({ NOT_A_TYPE: false }).expect(400);
    await ctx.http().get('/v1/me/notification-settings').expect(401);
  });

  it('likes and saves can be removed; comments are listed newest first without blocked authors', async () => {
    const post = (await ctx.http().post('/v1/posts').set(auth(a)).send({ text: 'coverage post' }).expect(201)).body;
    const view = async (u: TestUser) => (await ctx.http().get(`/v1/posts/${post.id}`).set(auth(u)).expect(200)).body;

    await ctx.http().put(`/v1/posts/${post.id}/like`).set(auth(b)).expect(204);
    await ctx.http().put(`/v1/posts/${post.id}/like`).set(auth(b)).expect(204); // twice: still one like
    expect(await view(b)).toMatchObject({ like_count: 1, liked_by_me: true });
    await ctx.http().delete(`/v1/posts/${post.id}/like`).set(auth(b)).expect(204);
    await ctx.http().delete(`/v1/posts/${post.id}/like`).set(auth(b)).expect(204); // twice: never below zero
    expect(await view(b)).toMatchObject({ like_count: 0, liked_by_me: false });
    await ctx.http().delete('/v1/posts/aaaaaaaaaaaaaaaaaaaaaaaa/like').set(auth(b)).expect(404);

    await ctx.http().put(`/v1/posts/${post.id}/save`).set(auth(b)).expect(204);
    expect((await ctx.http().get('/v1/me/saved-posts').set(auth(b)).expect(200)).body.items.map((p: { id: string }) => p.id)).toContain(post.id);
    await ctx.http().delete(`/v1/posts/${post.id}/save`).set(auth(b)).expect(204);
    expect((await ctx.http().get('/v1/me/saved-posts').set(auth(b)).expect(200)).body.items).toHaveLength(0);
    expect((await view(b)).saved_by_me).toBe(false);

    const c = await registerUser(ctx);
    await ctx.http().post(`/v1/posts/${post.id}/comments`).set(auth(b)).send({ text: 'first' }).expect(201);
    await ctx.http().post(`/v1/posts/${post.id}/comments`).set(auth(c)).send({ text: 'second' }).expect(201);
    const comments = (await ctx.http().get(`/v1/posts/${post.id}/comments`).set(auth(a)).expect(200)).body;
    expect(comments.items.map((x: { text: string }) => x.text)).toEqual(['second', 'first']);
    expect(comments.items[0].author).toMatchObject({ id: c.id });
    expect(comments.next_cursor).toBeNull();
    expect((await view(a)).comment_count).toBe(2);
    // a reader who blocked a commenter does not see that comment
    await ctx.http().post('/v1/blocks').set(auth(b)).send({ user_id: c.id }).expect(201);
    const forB = (await ctx.http().get(`/v1/posts/${post.id}/comments`).set(auth(b)).expect(200)).body;
    expect(forB.items.map((x: { text: string }) => x.text)).toEqual(['first']);
    await ctx.http().get('/v1/posts/aaaaaaaaaaaaaaaaaaaaaaaa/comments').set(auth(a)).expect(404);
  });

  it('GET /shops/{shop_id}/deals lists deals by status; hidden for a shop that is not visible', async () => {
    const [owner, admin, visitor] = [await registerUser(ctx), await registerUser(ctx), await registerUser(ctx)];
    await makeAdmin(ctx, admin);
    const shop = (await ctx.http().post('/v1/shops').set(auth(owner)).send({ name: 'Deal Corner', address: '5 Le Loi', ...PLACES.benThanh }).expect(201)).body;
    await ctx.http().get(`/v1/shops/${shop.id}/deals`).set(auth(visitor)).expect(404); // PENDING shop
    await ctx.http().patch(`/v1/admin/shops/${shop.id}`).set(auth(admin)).send({ decision: 'APPROVE' }).expect(200);

    const d1 = (await ctx.http().post(`/v1/shops/${shop.id}/deals`).set(auth(owner)).send({ title: 'Lunch', discount: '-15%', end_time: inHours(2) }).expect(201)).body;
    const d2 = (await ctx.http().post(`/v1/shops/${shop.id}/deals`).set(auth(owner)).send({ title: 'Dinner', discount: 'Buy 1 get 1', end_time: inHours(5) }).expect(201)).body;
    const active = (await ctx.http().get(`/v1/shops/${shop.id}/deals`).set(auth(visitor)).expect(200)).body.items;
    expect(active.map((d: { id: string }) => d.id)).toEqual([d1.id, d2.id]); // soonest to end first
    expect(active[0]).toMatchObject({ shop_id: shop.id, title: 'Lunch', discount: '-15%', status: 'ACTIVE' });
    expect(active[0].remaining_seconds).toBeGreaterThan(0);

    await ctx.http().patch(`/v1/shops/${shop.id}/deals/${d1.id}`).set(auth(owner)).send({ status: 'CANCELLED' }).expect(200);
    const ids = async (status: string) =>
      (await ctx.http().get(`/v1/shops/${shop.id}/deals?status=${status}`).set(auth(visitor)).expect(200)).body.items.map((d: { id: string }) => d.id);
    expect(await ids('ACTIVE')).toEqual([d2.id]);
    expect(await ids('CANCELLED')).toEqual([d1.id]);
    expect(await ids('ENDED')).toEqual([]);
    await ctx.http().get(`/v1/shops/${shop.id}/deals?status=WHATEVER`).set(auth(visitor)).expect(400);
  });
});
