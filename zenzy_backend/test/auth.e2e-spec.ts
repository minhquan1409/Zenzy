import { ObjectId } from 'mongodb';
import * as bcrypt from 'bcryptjs';
import { auth, registerUser, signUp, startApp, stopApp, TestContext } from './helpers';

describe('Authentication and account (UC-01, UC-02, NFR-07, NFR-08)', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await startApp()));
  afterAll(async () => stopApp(ctx));

  it('signs up in two steps: an e-mailed 6-digit code creates the account', async () => {
    const body = { username: 'Minh_20', password: 'password123', date_of_birth: '2005-03-02', email: 'Minh@Example.com' };
    const step1 = await ctx.http().post('/v1/auth/register').send(body).expect(202);
    expect(step1.body).toMatchObject({ verification_required: true, email: 'minh@example.com', expires_in: 900 });
    expect(step1.body.dev_code).toMatch(/^\d{6}$/);
    expect(step1.body.tokens).toBeUndefined();
    // nothing exists before the code: the username cannot be used to sign in
    expect(await ctx.db.users.countDocuments({ username: 'minh_20' })).toBe(0);
    await ctx.http().post('/v1/auth/login').send({ username: 'minh_20', password: 'password123' }).expect(401);

    const wrong = String((Number(step1.body.dev_code) + 1) % 1_000_000).padStart(6, '0');
    const bad = await ctx.http().post('/v1/auth/register/verify').send({ email: 'minh@example.com', code: wrong }).expect(400);
    expect(bad.body.code).toBe('INVALID_VERIFICATION_CODE');

    // a new code replaces the old one
    const again = await ctx.http().post('/v1/auth/register/resend').send({ email: 'minh@example.com' }).expect(202);
    expect(again.body.dev_code).toMatch(/^\d{6}$/);
    if (again.body.dev_code !== step1.body.dev_code) {
      await ctx.http().post('/v1/auth/register/verify').send({ email: 'minh@example.com', code: step1.body.dev_code }).expect(400);
    }
    const res = await ctx.http().post('/v1/auth/register/verify').send({ email: 'minh@example.com', code: again.body.dev_code }).expect(201);
    expect(res.body.user).toMatchObject({ username: 'minh_20', email: 'minh@example.com' });
    expect(res.body.tokens.access_token).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);
    expect(await ctx.db.pendingSignups.countDocuments({})).toBe(0);
    // the code works once
    await ctx.http().post('/v1/auth/register/verify').send({ email: 'minh@example.com', code: again.body.dev_code }).expect(400);

    const dup = await ctx.http().post('/v1/auth/register').send({ ...body, email: 'other@example.com' }).expect(409);
    expect(dup.body).toMatchObject({ code: 'USERNAME_TAKEN' });
    expect(dup.body.timestamp).toBeTruthy();
    // an e-mail is required, and passwords must be long enough
    await ctx.http().post('/v1/auth/register').send({ username: 'no_mail', password: 'password123', date_of_birth: '2005-03-02' }).expect(400);
    const short = await ctx.http().post('/v1/auth/register').send({ username: 'abc', password: 'short', date_of_birth: '2005-03-02', email: 'a@b.co' }).expect(400);
    expect(short.body.code).toBe('INVALID_INPUT');
    // the answer to "resend" does not reveal whether a sign-up is pending
    const none = await ctx.http().post('/v1/auth/register/resend').send({ email: 'nobody@example.com' }).expect(202);
    expect(none.body).toEqual({ verification_required: true, email: 'nobody@example.com', expires_in: 900 });
  });

  it('five wrong sign-up codes discard the sign-up', async () => {
    const s = await ctx.http().post('/v1/auth/register').send({ username: 'typo_user', password: 'password123', date_of_birth: '2001-01-01', email: 'typo@example.com' }).expect(202);
    const wrong = (i: number) => String((Number(s.body.dev_code) + 1 + i) % 1_000_000).padStart(6, '0');
    for (let i = 0; i < 4; i++) await ctx.http().post('/v1/auth/register/verify').send({ email: 'typo@example.com', code: wrong(i) }).expect(400);
    const last = await ctx.http().post('/v1/auth/register/verify').send({ email: 'typo@example.com', code: wrong(4) }).expect(400);
    expect(last.body.code).toBe('SIGNUP_EXPIRED');
    await ctx.http().post('/v1/auth/register/verify').send({ email: 'typo@example.com', code: s.body.dev_code }).expect(400);
  });

  it('locks an account after 5, 10 and 15 wrong passwords, and requires a reset after 20', async () => {
    const u = await registerUser(ctx, 'lock_user');
    const login = (password: string) => ctx.http().post('/v1/auth/login').send({ username: u.username, password });
    const unlock = () => ctx.db.users.updateOne({ _id: new ObjectId(u.id) }, { $set: { 'login_failures.locked_until': new Date(Date.now() - 1000) } });
    await login('password123').expect(200);

    for (let i = 0; i < 4; i++) expect((await login('wrong-password').expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    const fifth = await login('wrong-password').expect(429);
    expect(fifth.body).toMatchObject({ code: 'ACCOUNT_LOCKED', retry_after: 60 });
    expect(fifth.headers['retry-after']).toBe('60');
    // while locked even the right password is refused, and the attempt does not count
    await login('password123').expect(429);

    await unlock();
    for (let i = 0; i < 4; i++) await login('wrong-password').expect(401);
    expect((await login('wrong-password').expect(429)).body.retry_after).toBe(300);

    await unlock();
    for (let i = 0; i < 4; i++) await login('wrong-password').expect(401);
    expect((await login('wrong-password').expect(429)).body.retry_after).toBe(600);

    await unlock();
    for (let i = 0; i < 4; i++) await login('wrong-password').expect(401);
    const twentieth = await login('wrong-password').expect(403);
    expect(twentieth.body.code).toBe('PASSWORD_RESET_REQUIRED');
    // the right password no longer works: only "forgot password" unlocks the account
    expect((await login('password123').expect(403)).body.code).toBe('PASSWORD_RESET_REQUIRED');

    const sent = await ctx.http().post('/v1/auth/password/forgot').send({ login: u.username }).expect(200);
    await ctx.http().post('/v1/auth/password/reset').send({ login: u.username, code: sent.body.dev_code, new_password: 'brandnew123' }).expect(204);
    await login('brandnew123').expect(200);
    expect((await ctx.db.users.findOne({ _id: new ObjectId(u.id) }))!.login_failures).toBeUndefined();
    await ctx.db.loginAttempts.deleteMany({});
  });

  it('a correct password resets the wrong-password count', async () => {
    const u = await registerUser(ctx);
    const login = (password: string) => ctx.http().post('/v1/auth/login').send({ username: u.username, password });
    for (let i = 0; i < 4; i++) await login('wrong-password').expect(401);
    await login('password123').expect(200);
    for (let i = 0; i < 4; i++) await login('wrong-password').expect(401);
    await login('password123').expect(200);
    await ctx.db.loginAttempts.deleteMany({});
  });

  it('rotates refresh tokens, and a stolen used token revokes the whole session', async () => {
    const u = await registerUser(ctx);
    const r1 = await ctx.http().post('/v1/auth/refresh').send({ refresh_token: u.refresh }).expect(200);
    expect(r1.body.refresh_token).not.toBe(u.refresh);
    // a repeat right away is a race of the same app: refused, but the session survives
    await ctx.http().post('/v1/auth/refresh').send({ refresh_token: u.refresh }).expect(401);
    const r2 = await ctx.http().post('/v1/auth/refresh').send({ refresh_token: r1.body.refresh_token }).expect(200);

    // later, someone presents the old token again: the whole family is revoked
    await ctx.db.refreshTokens.updateMany({ user_id: new ObjectId(u.id), used_at: { $ne: null } }, { $set: { used_at: new Date(Date.now() - 60_000) } });
    const reused = await ctx.http().post('/v1/auth/refresh').send({ refresh_token: u.refresh }).expect(401);
    expect(reused.body.code).toBe('REFRESH_TOKEN_REUSED');
    await ctx.http().post('/v1/auth/refresh').send({ refresh_token: r2.body.refresh_token }).expect(401);

    // other sessions (another phone) are not affected
    const other = await ctx.http().post('/v1/auth/login').send({ username: u.username, password: 'password123' }).expect(200);
    const o2 = await ctx.http().post('/v1/auth/refresh').send({ refresh_token: other.body.tokens.refresh_token }).expect(200);
    // logout ends the session, including its used tokens
    await ctx.http().post('/v1/auth/logout').set({ Authorization: `Bearer ${o2.body.access_token}` }).send({ refresh_token: o2.body.refresh_token }).expect(204);
    await ctx.http().post('/v1/auth/refresh').send({ refresh_token: o2.body.refresh_token }).expect(401);
    expect(await ctx.db.refreshTokens.countDocuments({ user_id: new ObjectId(u.id) })).toBe(0);
  });

  it('admins sign in only on the admin page; 3 wrong tries block the IP', async () => {
    const admin = await registerUser(ctx, 'site_admin');
    await ctx.db.users.updateOne({ _id: new ObjectId(admin.id) }, { $set: { role: 'ADMIN' } });
    // the app sign-in refuses admin accounts (same answer as a wrong password)
    expect((await ctx.http().post('/v1/auth/login').send({ username: 'site_admin', password: 'password123' }).expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    // a normal user cannot use the admin sign-in
    const user = await registerUser(ctx);
    await ctx.http().post('/v1/admin/login').send({ username: user.username, password: 'password123' }).expect(401);
    await ctx.db.securityFailures.deleteMany({});

    const ok = await ctx.http().post('/v1/admin/login').send({ username: 'Site_Admin', password: 'password123' }).expect(200);
    expect(ok.body.user.role).toBe('ADMIN');
    const headers = { Authorization: `Bearer ${ok.body.tokens.access_token}` };
    await ctx.http().get('/v1/admin/users').set(headers).expect(200);

    const w1 = await ctx.http().post('/v1/admin/login').send({ username: 'site_admin', password: 'nope' }).expect(401);
    expect(w1.body.message).toContain('2 attempt(s) left');
    await ctx.http().post('/v1/admin/login').send({ username: 'guess', password: 'nope' }).expect(401);
    const third = await ctx.http().post('/v1/admin/login').send({ username: 'site_admin', password: 'nope' }).expect(403);
    expect(third.body.code).toBe('IP_BLOCKED');
    // blocked: even the right password and an existing token stop working from this IP
    await ctx.http().post('/v1/admin/login').send({ username: 'site_admin', password: 'password123' }).expect(403);
    expect((await ctx.http().get('/v1/admin/users').set(headers).expect(403)).body.code).toBe('IP_BLOCKED');
    // the app itself is not affected
    await ctx.http().get('/v1/me').set(auth(user)).expect(200);
    await ctx.db.ipBlocks.deleteMany({});
    await ctx.db.securityFailures.deleteMany({});
    await ctx.db.loginAttempts.deleteMany({});
  });

  it('download page password: 10 wrong tries per IP, then blocked', async () => {
    const basic = (u: string, p: string) => ({ Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') });
    const none = await ctx.http().get('/v1/internal/download-auth').expect(401);
    expect(none.headers['www-authenticate']).toContain('Basic');
    await ctx.http().get('/v1/internal/download-auth').set(basic('tester', 'download-pass')).expect(204);
    for (let i = 0; i < 9; i++) await ctx.http().get('/v1/internal/download-auth').set(basic('tester', `wrong${i}`)).expect(401);
    const tenth = await ctx.http().get('/v1/internal/download-auth').set(basic('tester', 'wrong-last')).expect(403);
    expect(tenth.headers['www-authenticate']).toBeUndefined();
    await ctx.http().get('/v1/internal/download-auth').set(basic('tester', 'download-pass')).expect(403);
    expect(await bcrypt.compare('download-pass', Buffer.from(process.env.DOWNLOAD_PASSWORD_HASH_B64!, 'base64').toString())).toBe(true);
    await ctx.db.ipBlocks.deleteMany({});
    await ctx.db.securityFailures.deleteMany({});
  });

  it('requires a valid token on every non-public route', async () => {
    await ctx.http().get('/v1/me').expect(401);
    const bad = await ctx.http().get('/v1/me').set({ Authorization: 'Bearer nope' }).expect(401);
    expect(bad.body.code).toBe('UNAUTHENTICATED');
    await ctx.http().get('/health').expect(200);
  });

  it('Google sign-in asks for a profile first, then logs in without a password', async () => {
    ctx.googleTokens.set('google-token-1', { sub: 'google-sub-1', name: 'Vy Tran' });
    const first = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-1' }).expect(400);
    expect(first.body.code).toBe('PROFILE_REQUIRED');

    const created = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-1', username: 'vy_tran', date_of_birth: '1999-01-01' }).expect(200);
    expect(created.body.user).toMatchObject({ username: 'vy_tran', display_name: 'Vy Tran', has_password: false });

    const again = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-1' }).expect(200);
    expect(again.body.user.id).toBe(created.body.user.id);

    const headers = { Authorization: `Bearer ${again.body.tokens.access_token}` };
    const pw = await ctx.http().put('/v1/me/password').set(headers).send({ current_password: 'x', new_password: 'password123' }).expect(409);
    expect(pw.body.code).toBe('NO_PASSWORD');
    await ctx.http().post('/v1/auth/google').send({ id_token: 'forged' }).expect(401);
  });

  it('Google sign-in with only a date of birth takes the username from the e-mail', async () => {
    ctx.googleTokens.set('google-token-2', { sub: 'google-sub-2', name: 'Nguyễn Đức', email: 'Duc.Nguyen+test@gmail.com' });
    // The app sends null for fields it does not have; that must not be a validation error.
    const first = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-2', username: null, date_of_birth: null }).expect(400);
    expect(first.body.code).toBe('PROFILE_REQUIRED');
    const created = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-2', date_of_birth: '2000-05-05' }).expect(200);
    expect(created.body.user).toMatchObject({ username: 'duc.nguyentest', display_name: 'Nguyễn Đức' });

    // Same e-mail name on another Google account: a number is appended.
    ctx.googleTokens.set('google-token-3', { sub: 'google-sub-3', name: 'Other', email: 'duc.nguyentest@example.com' });
    const second = await ctx.http().post('/v1/auth/google').send({ id_token: 'google-token-3', date_of_birth: '2000-05-05' }).expect(200);
    expect(second.body.user.username).toMatch(/^duc\.nguyentest\d+$/);
  });

  it('changes password only with the current one, and edits the profile', async () => {
    const u = await registerUser(ctx);
    const wrong = await ctx.http().put('/v1/me/password').set(auth(u)).send({ current_password: 'nope-nope', new_password: 'newpassword1' }).expect(400);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');
    // a second session (another phone) that must be signed out by the change
    const other = await ctx.http().post('/v1/auth/login').send({ username: u.username, password: 'password123' }).expect(200);
    await ctx.http().put('/v1/me/password').set(auth(u)).send({ current_password: 'password123', new_password: 'newpassword1', refresh_token: u.refresh }).expect(204);
    await ctx.http().post('/v1/auth/login').send({ username: u.username, password: 'newpassword1' }).expect(200);
    await ctx.http().post('/v1/auth/refresh').send({ refresh_token: other.body.tokens.refresh_token }).expect(401);
    const kept = await ctx.http().post('/v1/auth/refresh').send({ refresh_token: u.refresh }).expect(200);
    u.refresh = kept.body.refresh_token;

    const p = await ctx.http().patch('/v1/me').set(auth(u)).send({ display_name: 'Lan', bio: 'Event organiser' }).expect(200);
    expect(p.body).toMatchObject({ display_name: 'Lan', bio: 'Event organiser' });
    const me = await ctx.http().get('/v1/me').set(auth(u)).expect(200);
    expect(me.body.privacy).toMatchObject({ ghost_mode: false, sharing_enabled: false, audience: 'FRIENDS' });
    expect(Object.keys(me.body.notification_settings)).toContain('EVENT_JOIN_REQUEST');
  });

  it('suspended accounts cannot log in or use their token, and see the reason', async () => {
    const u = await registerUser(ctx);
    await ctx.db.users.updateOne({ _id: new ObjectId(u.id) }, { $set: { status: 'SUSPENDED', suspend_reason: 'spam' } });
    const login = await ctx.http().post('/v1/auth/login').send({ username: u.username, password: 'password123' }).expect(403);
    expect(login.body).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(login.body.message).toContain('spam');
    await ctx.http().get('/v1/me').set(auth(u)).expect(403);
  });

  it('deletes the account and its data after re-authentication (NFR-10)', async () => {
    const u = await registerUser(ctx);
    await ctx.http().post('/v1/posts').set(auth(u)).send({ text: 'bye' }).expect(201);
    await ctx.http().delete('/v1/me').set(auth(u)).send({ password: 'wrong-password' }).expect(403);
    await ctx.http().delete('/v1/me').set(auth(u)).send({ password: 'password123' }).expect(202);
    const id = new ObjectId(u.id);
    expect(await ctx.db.users.countDocuments({ _id: id })).toBe(0);
    expect(await ctx.db.credentials.countDocuments({ user_id: id })).toBe(0);
    expect(await ctx.db.posts.countDocuments({ author_id: id })).toBe(0);
    await ctx.http().get('/v1/me').set(auth(u)).expect(401);
  });

  it('forgot password: e-mails a 6-digit code, then sets a new password without the old one', async () => {
    // register with an e-mail; without SMTP the test server returns the code as dev_code
    await signUp(ctx, { username: 'forgetful', password: 'password123', date_of_birth: '2001-01-01', email: 'Forgetful@Example.com' });
    // the answer does not reveal whether an account exists or has an e-mail (older accounts may have none)
    const noEmail = await registerUser(ctx);
    await ctx.db.users.updateOne({ _id: new ObjectId(noEmail.id) }, { $set: { email: null } });
    const r0 = await ctx.http().post('/v1/auth/password/forgot').send({ login: noEmail.username }).expect(200);
    const rNobody = await ctx.http().post('/v1/auth/password/forgot').send({ login: 'nobody_here' }).expect(200);
    expect(r0.body).toEqual({ sent: true, expires_in: 600 });
    expect(rNobody.body).toEqual(r0.body);

    const r1 = await ctx.http().post('/v1/auth/password/forgot').send({ login: 'forgetful@example.com' }).expect(200);
    expect(r1.body).toMatchObject({ sent: true, expires_in: 600 });
    expect(r1.body.dev_code).toMatch(/^\d{6}$/);
    expect(await ctx.db.passwordResets.countDocuments({})).toBe(1);

    const wrong = String((Number(r1.body.dev_code) + 1) % 1_000_000).padStart(6, '0');
    const bad = await ctx.http().post('/v1/auth/password/reset').send({ login: 'forgetful', code: wrong, new_password: 'newpassword1' }).expect(400);
    expect(bad.body.code).toBe('INVALID_RESET_CODE');
    await ctx.http().post('/v1/auth/password/reset').send({ login: 'forgetful', code: r1.body.dev_code, new_password: 'newpassword1' }).expect(204);

    await ctx.http().post('/v1/auth/login').send({ username: 'forgetful', password: 'password123' }).expect(401);
    const ok = await ctx.http().post('/v1/auth/login').send({ username: 'forgetful', password: 'newpassword1' }).expect(200);
    expect(ok.body.user.email).toBe('forgetful@example.com');
    // the code works once
    await ctx.http().post('/v1/auth/password/reset').send({ login: 'forgetful', code: r1.body.dev_code, new_password: 'another123' }).expect(400);
    await ctx.db.loginAttempts.deleteMany({});
  });

  it('e-mail can be added later in the profile and must be unique', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    // changing the e-mail needs the password: a stolen access token alone cannot redirect reset codes
    const noPw = await ctx.http().patch('/v1/me').set(auth(a)).send({ email: 'Shared@Example.com' }).expect(403);
    expect(noPw.body.code).toBe('REAUTH_REQUIRED');
    await ctx.http().patch('/v1/me').set(auth(a)).send({ email: 'shared@example.com', current_password: 'wrong-one' }).expect(403);
    const r = await ctx.http().patch('/v1/me').set(auth(a)).send({ email: 'Shared@Example.com', current_password: 'password123' }).expect(200);
    expect(r.body.email).toBe('shared@example.com');
    // sending the same e-mail again (the edit-profile screen always does) needs no password
    await ctx.http().patch('/v1/me').set(auth(a)).send({ email: 'shared@example.com', bio: 'hi' }).expect(200);
    const dup = await ctx.http().patch('/v1/me').set(auth(b)).send({ email: 'shared@example.com', current_password: 'password123' }).expect(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
    const taken = await ctx.http().post('/v1/auth/register').send({ username: 'dup_mail', password: 'password123', date_of_birth: '2001-01-01', email: 'shared@example.com' }).expect(409);
    expect(taken.body.code).toBe('EMAIL_TAKEN');
  });

  it('caps wrong password-reset codes per account per day', async () => {
    await signUp(ctx, { username: 'guessed', password: 'password123', date_of_birth: '2001-01-01', email: 'guessed@example.com' });
    const sent = await ctx.http().post('/v1/auth/password/forgot').send({ login: 'guessed' }).expect(200);
    const right = sent.body.dev_code as string;
    const wrongCode = (i: number) => String((Number(right) + 1 + i) % 1_000_000).padStart(6, '0');
    // 10 wrong codes in a day lock reset for the account, even with fresh codes and from new IPs
    for (let i = 0; i < 10; i++) {
      if (i % 5 === 0 && i > 0) {
        await ctx.db.loginAttempts.deleteMany({});
        await ctx.http().post('/v1/auth/password/forgot').send({ login: 'guessed' }).expect(200);
      }
      await ctx.http().post('/v1/auth/password/reset').send({ login: 'guessed', code: wrongCode(i), new_password: 'newpassword1' }).expect(400);
    }
    await ctx.db.loginAttempts.deleteMany({});
    const fresh = await ctx.http().post('/v1/auth/password/forgot').send({ login: 'guessed' }).expect(200);
    expect(fresh.body.dev_code).toBeUndefined(); // no new code is issued while locked
    const locked = await ctx.http().post('/v1/auth/password/reset').send({ login: 'guessed', code: right, new_password: 'newpassword1' }).expect(429);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');
    await ctx.http().post('/v1/auth/login').send({ username: 'guessed', password: 'password123' }).expect(200);
    await ctx.db.loginAttempts.deleteMany({});
  });

  it('rejects image links that are not this server uploads when media storage is configured', async () => {
    const { MediaService } = await import('../src/core/media.service');
    const { AppConfig } = await import('../src/core/config');
    const media = new MediaService(Object.assign(new AppConfig(), { mediaPublicBaseUrl: 'https://cdn.example.com', publicBaseUrl: '' }));
    expect(() => media.assertOwnMediaUrls(['https://cdn.example.com/media/u/avatar-1.jpg', null])).not.toThrow();
    expect(() => media.assertOwnMediaUrls(['https://lh3.googleusercontent.com/a/photo'])).not.toThrow();
    expect(() => media.assertOwnMediaUrls(['https://tracker.example.net/pixel.gif'])).toThrow('Images must be uploaded');
    expect(() => media.assertOwnMediaUrls(['https://cdn.example.com.evil.net/media/x.jpg'])).toThrow();
  });
});
