import { auth, collect, connectSocket, registerUser, startApp, stopApp, TestContext, TestUser, waitFor } from './helpers';

/** Friends, chat (with Socket.IO delivery), feed and notifications: UC-05, UC-06, UC-21, UC-22. */
describe('Friends, chat, feed and notifications', () => {
  let ctx: TestContext;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;

  beforeAll(async () => {
    ctx = await startApp();
    [a, b, c] = await Promise.all([registerUser(ctx), registerUser(ctx), registerUser(ctx)]);
  });
  afterAll(async () => stopApp(ctx));

  it('friend requests: duplicate refused, only the recipient answers, close flag saved', async () => {
    const req = await ctx.http().post('/v1/friends/requests').set(auth(a)).send({ receiver_id: b.id }).expect(201);
    expect((await ctx.http().post('/v1/friends/requests').set(auth(b)).send({ receiver_id: a.id }).expect(409)).body.code).toBe('DUPLICATE_REQUEST');
    await ctx.http().patch(`/v1/friends/requests/${req.body.request_id}`).set(auth(a)).send({ action: 'ACCEPT' }).expect(403);
    const pending = await ctx.http().get('/v1/friends?status=PENDING').set(auth(b)).expect(200);
    expect(pending.body.items[0]).toMatchObject({ direction: 'INCOMING', user: { id: a.id } });
    await ctx.http().patch(`/v1/friends/requests/${req.body.request_id}`).set(auth(b)).send({ action: 'ACCEPT' }).expect(200);
    await ctx.http().put(`/v1/friends/${b.id}/close`).set(auth(a)).send({ close: true }).expect(200);
    const list = await ctx.http().get('/v1/friends').set(auth(a)).expect(200);
    expect(list.body.items[0]).toMatchObject({ user: { id: b.id }, close_friend: true });
    const notif = await ctx.http().get('/v1/notifications').set(auth(b)).expect(200);
    expect(notif.body.items[0].type).toBe('FRIEND_REQUEST');
  });

  it('direct chat needs friendship; messages arrive by socket; idempotent send', async () => {
    expect((await ctx.http().post('/v1/conversations').set(auth(a)).send({ type: 'DIRECT', member_ids: [c.id] }).expect(403)).body.code).toBe('NOT_FRIENDS');
    const conv = (await ctx.http().post('/v1/conversations').set(auth(a)).send({ type: 'DIRECT', member_ids: [b.id] }).expect(201)).body;
    const same = (await ctx.http().post('/v1/conversations').set(auth(b)).send({ type: 'DIRECT', member_ids: [a.id] }).expect(201)).body;
    expect(same.id).toBe(conv.id);

    const sb = await connectSocket(ctx, b);
    const sc = await connectSocket(ctx, c);
    try {
      const got = waitFor(sb, 'chat:message', (p) => p.conversation_id === conv.id);
      const intruder = collect(sc, 'chat:message');
      const sent = await ctx.http().post(`/v1/conversations/${conv.id}/messages`).set(auth(a)).set('Idempotency-Key', 'msg-1').send({ content: 'Where are you?' }).expect(201);
      expect((await got).message).toMatchObject({ id: sent.body.id, content: 'Where are you?' });
      expect(await intruder).toHaveLength(0);
      const retry = await ctx.http().post(`/v1/conversations/${conv.id}/messages`).set(auth(a)).set('Idempotency-Key', 'msg-1').send({ content: 'Where are you?' }).expect(201);
      expect(retry.body.id).toBe(sent.body.id);
    } finally {
      sb.disconnect();
      sc.disconnect();
    }

    const list = await ctx.http().get('/v1/conversations').set(auth(b)).expect(200);
    expect(list.body.items[0]).toMatchObject({ id: conv.id, unread_count: 1, last_message: { content: 'Where are you?' } });
    await ctx.http().post(`/v1/conversations/${conv.id}/read`).set(auth(b)).expect(204);
    expect((await ctx.http().get('/v1/conversations').set(auth(b)).expect(200)).body.items[0].unread_count).toBe(0);
    const hist = await ctx.http().get(`/v1/conversations/${conv.id}/messages`).set(auth(b)).expect(200);
    expect(hist.body.items).toHaveLength(1);
    await ctx.http().get(`/v1/conversations/${conv.id}/messages`).set(auth(c)).expect(403);

    // a block ends the friendship and stops messages
    await ctx.http().post('/v1/blocks').set(auth(b)).send({ user_id: a.id }).expect(201);
    expect((await ctx.http().post(`/v1/conversations/${conv.id}/messages`).set(auth(a)).send({ content: 'hello?' }).expect(403)).body.code).toBe('BLOCKED');
    expect((await ctx.http().post('/v1/friends/requests').set(auth(a)).send({ receiver_id: b.id }).expect(403)).body.code).toBe('BLOCKED');
    expect((await ctx.http().get(`/v1/users?username=${b.username}`).set(auth(a)).expect(200)).body.items).toHaveLength(0);
    await ctx.http().delete(`/v1/blocks/${a.id}`).set(auth(b)).expect(204);
  });

  it('feed: 20 per page newest first with a cursor, banned words refused, blocked authors excluded', async () => {
    const author = await registerUser(ctx);
    const reader = await registerUser(ctx);
    for (let i = 0; i < 23; i++) await ctx.http().post('/v1/posts').set(auth(author)).send({ text: `post ${i}` }).expect(201);
    const p1 = await ctx.http().get('/v1/posts').set(auth(reader)).expect(200);
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].text).toBe('post 22');
    const p2 = await ctx.http().get(`/v1/posts?cursor=${p1.body.next_cursor}`).set(auth(reader)).expect(200);
    expect(p2.body.items.map((p: any) => p.text)).toEqual(expect.arrayContaining(['post 2', 'post 1', 'post 0']));
    expect(new Set([...p1.body.items, ...p2.body.items].map((p: any) => p.id)).size).toBe(p1.body.items.length + p2.body.items.length);

    await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'x'.repeat(501) }).expect(400);
    await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'pics', photo_urls: Array(5).fill('https://cdn.example.com/a.jpg') }).expect(400);
    await ctx.db.bannedKeywords.insertOne({ keyword: 'forbidden' });
    await ctx.http().post('/v1/posts').set(auth(author)).send({ text: 'this is FORBIDDEN' }).expect(422);

    const postId = p1.body.items[0].id;
    await ctx.http().put(`/v1/posts/${postId}/like`).set(auth(reader)).expect(204);
    await ctx.http().put(`/v1/posts/${postId}/like`).set(auth(reader)).expect(204);
    await ctx.http().post(`/v1/posts/${postId}/comments`).set(auth(reader)).send({ text: 'nice' }).expect(201);
    await ctx.http().put(`/v1/posts/${postId}/save`).set(auth(reader)).expect(204);
    const saved = await ctx.http().get('/v1/me/saved-posts').set(auth(reader)).expect(200);
    expect(saved.body.items[0]).toMatchObject({ id: postId, like_count: 1, comment_count: 1, liked_by_me: true, saved_by_me: true });
    await ctx.http().patch(`/v1/posts/${postId}`).set(auth(reader)).send({ text: 'edited' }).expect(403);
    await ctx.http().delete(`/v1/posts/${postId}`).set(auth(reader)).expect(403);

    await ctx.http().post('/v1/blocks').set(auth(author)).send({ user_id: reader.id }).expect(201);
    expect((await ctx.http().get('/v1/posts').set(auth(reader)).expect(200)).body.items).toHaveLength(0);
  });

  it('notification settings and mark-as-read', async () => {
    const s = await ctx.http().put('/v1/me/notification-settings').set(auth(b)).send({ CHAT_MESSAGE: false }).expect(200);
    expect(s.body).toMatchObject({ CHAT_MESSAGE: false, FRIEND_REQUEST: true });
    await ctx.http().put('/v1/me/notification-settings').set(auth(b)).send({ NOT_A_TYPE: true }).expect(400);
    await ctx.http().put('/v1/me/device-tokens').set(auth(b)).send({ token: 'fcm-token-abcdef', platform: 'ANDROID' }).expect(204);
    const list = await ctx.http().get('/v1/notifications').set(auth(b)).expect(200);
    expect(list.body.unread_count).toBeGreaterThan(0);
    await ctx.http().patch(`/v1/notifications/${list.body.items[0].id}`).set(auth(b)).send({ read: true }).expect(200);
    await ctx.http().patch(`/v1/notifications/${list.body.items[0].id}`).set(auth(c)).send({ read: true }).expect(404);
    await ctx.http().post('/v1/notifications/read-all').set(auth(b)).expect(204);
    expect((await ctx.http().get('/v1/notifications').set(auth(b)).expect(200)).body.unread_count).toBe(0);
    await ctx.http().delete('/v1/me/device-tokens').set(auth(b)).send({ token: 'fcm-token-abcdef' }).expect(204);
  });

  it('the socket refuses connections without a valid token', async () => {
    await expect(connectSocket(ctx, { ...a, token: 'bogus' })).rejects.toThrow();
  });

  it('uploads return 503 when media storage is not configured', async () => {
    const r = await ctx.http().post('/v1/uploads/sign').set(auth(a)).send({ purpose: 'AVATAR', content_type: 'image/jpeg' }).expect(503);
    expect(r.body.code).toBe('UPLOADS_NOT_CONFIGURED');
  });

});
