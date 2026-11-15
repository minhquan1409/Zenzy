import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { GoogleIdentity, GoogleVerifier } from '../src/auth/auth.service';
import { createApp } from '../src/bootstrap';
import { Db } from '../src/core/db';

export interface TestUser {
  id: string;
  username: string;
  token: string;
  refresh: string;
}

export interface TestContext {
  app: INestApplication;
  db: Db;
  baseUrl: string;
  http: () => ReturnType<typeof request>;
  /** Google ID tokens accepted by the fake verifier: token -> identity. */
  googleTokens: Map<string, GoogleIdentity>;
}

/** Starts the real application on a random port against a fresh database. */
export async function startApp(): Promise<TestContext> {
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
  process.env.MONGODB_DB = `zenzy_test_${randomBytes(4).toString('hex')}`;
  process.env.JOBS_ENABLED = 'false';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.BANNED_KEYWORD_CACHE_MS = '0';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
  process.env.SIGNUP_IP_LIMIT = '100000';
  // Every request comes from 127.0.0.1: rate limits are raised; the anti-scraping tests lower them again.
  process.env.RATE_LIMIT_SCALE = '1000';
  process.env.GEO_JUMPS_PER_HOUR = '100000';
  process.env.DOWNLOAD_USER = 'tester';
  process.env.DOWNLOAD_PASSWORD_HASH_B64 = Buffer.from(bcrypt.hashSync('download-pass', 4)).toString('base64');
  // Local-disk uploads are off unless a test turns them on (it then sets MEDIA_LOCAL_DIR itself).
  if (process.env.MEDIA_LOCAL_DIR === undefined) process.env.MEDIA_LOCAL_DIR = '';

  const app = await createApp({ logger: false });
  const googleTokens = new Map<string, GoogleIdentity>();
  app.get(GoogleVerifier).verify = async (t: string) => googleTokens.get(t) ?? null;
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return {
    app,
    db: app.get(Db),
    baseUrl: `http://127.0.0.1:${port}`,
    http: () => request(app.getHttpServer()),
    googleTokens,
  };
}

export async function stopApp(ctx: TestContext): Promise<void> {
  await ctx.db.db.dropDatabase();
  await ctx.app.close();
}

let counter = 0;

/**
 * Sign-up with e-mail verification: step 1 returns the code as dev_code (no SMTP in the tests),
 * step 2 confirms it and returns the tokens.
 */
export async function signUp(
  ctx: TestContext,
  body: { username: string; password: string; date_of_birth: string; email?: string },
): Promise<request.Response> {
  const email = body.email ?? `${body.username.replace(/[^a-z0-9]/gi, '')}.${randomBytes(3).toString('hex')}@example.com`;
  const step1 = await ctx.http().post('/v1/auth/register').send({ ...body, email }).expect(202);
  return ctx.http().post('/v1/auth/register/verify').send({ email, code: step1.body.dev_code }).expect(201);
}

export async function registerUser(ctx: TestContext, name?: string, dob = '2000-05-01'): Promise<TestUser> {
  const username = (name ?? `user${++counter}_${randomBytes(2).toString('hex')}`).toLowerCase();
  const res = await signUp(ctx, { username, password: 'password123', date_of_birth: dob });
  return { id: res.body.user.id, username, token: res.body.tokens.access_token, refresh: res.body.tokens.refresh_token };
}

export const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

export async function makeFriends(ctx: TestContext, a: TestUser, b: TestUser): Promise<void> {
  const req = await ctx.http().post('/v1/friends/requests').set(auth(a)).send({ receiver_id: b.id }).expect(201);
  await ctx.http().patch(`/v1/friends/requests/${req.body.request_id}`).set(auth(b)).send({ action: 'ACCEPT' }).expect(200);
}

export async function makeAdmin(ctx: TestContext, u: TestUser): Promise<void> {
  const { ObjectId } = await import('mongodb');
  await ctx.db.users.updateOne({ _id: new ObjectId(u.id) }, { $set: { role: 'ADMIN' } });
}

/** Connects a Socket.IO client and resolves once the server has put it in its rooms. */
export async function connectSocket(ctx: TestContext, u: TestUser): Promise<Socket> {
  const socket = io(ctx.baseUrl, { auth: { token: u.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise<void>((resolve, reject) => {
    socket.once('connection:ready', () => resolve());
    socket.once('connection:error', (e) => reject(new Error(e.message)));
    socket.once('connect_error', reject);
  });
  return socket;
}

/** Resolves with the first `event` payload matching `predicate`, or rejects after `ms`. */
export function waitFor<T = any>(socket: Socket, event: string, predicate: (p: T) => boolean = () => true, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, ms);
    const handler = (p: T) => {
      if (!predicate(p)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(p);
    };
    socket.on(event, handler);
  });
}

/** Collects every `event` payload for `ms` milliseconds (to assert that nothing arrived). */
export function collect<T = any>(socket: Socket, event: string, ms = 400): Promise<T[]> {
  const got: T[] = [];
  const handler = (p: T) => got.push(p);
  socket.on(event, handler);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, handler);
      resolve(got);
    }, ms),
  );
}

export const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/** Known points in Ho Chi Minh City used for radius tests. */
export const PLACES = {
  benThanh: { latitude: 10.7725, longitude: 106.698 },
  // ~1.1 km north-west of Ben Thanh
  turtleLake: { latitude: 10.7827, longitude: 106.6959 },
  // ~10 km away (Thu Duc)
  thuDuc: { latitude: 10.85, longitude: 106.7717 },
};
