import { Injectable, Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { ObjectId } from 'mongodb';
import { Err, iso } from '../common/http';
import { AppConfig } from './config';
import { Db, isDuplicateKey } from './db';
import { RealtimeGateway } from './realtime.gateway';
import { NotificationDoc, NotificationType } from './types';

// ---------------------------------------------------------------------------
// BR-01: banned keywords
// ---------------------------------------------------------------------------

@Injectable()
export class TextModeration {
  private cache: { at: number; words: string[] } | null = null;

  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  private async words(): Promise<string[]> {
    const now = Date.now();
    if (!this.cache || now - this.cache.at >= this.config.bannedKeywordCacheMs) {
      const rows = await this.db.bannedKeywords.find().toArray();
      this.cache = { at: now, words: rows.map((r) => r.keyword.normalize('NFC').toLowerCase()).filter(Boolean) };
    }
    return this.cache.words;
  }

  /** Throws 422 BANNED_KEYWORD if any text contains a banned keyword; nothing is saved by the caller. */
  async assertClean(...texts: Array<string | null | undefined>): Promise<void> {
    const words = await this.words();
    if (!words.length) return;
    const haystack = texts
      .filter((t): t is string => !!t)
      .join('\n')
      .normalize('NFC')
      .toLowerCase();
    if (words.some((w) => haystack.includes(w))) throw Err.bannedKeyword();
  }
}

// ---------------------------------------------------------------------------
// NFR-06: idempotency keys
// ---------------------------------------------------------------------------

@Injectable()
export class IdempotencyService {
  constructor(private readonly db: Db) {}

  /**
   * Runs `fn` once per (user, scope, key). A retry with the same Idempotency-Key header
   * returns the stored response instead of creating a duplicate. `fn` must return plain JSON.
   */
  async run<T>(userId: ObjectId, scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();
    if (key.length > 200) throw Err.badRequest('INVALID_INPUT', 'Idempotency-Key is too long');
    const id = { user_id: userId, scope, key };
    try {
      await this.db.idempotencyKeys.insertOne({ ...id, state: 'PENDING', created_at: new Date() });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      const existing = await this.db.idempotencyKeys.findOne(id);
      if (existing?.state === 'DONE') return existing.response as T;
      throw Err.conflict('REQUEST_IN_PROGRESS', 'The same request is still being processed');
    }
    try {
      const response = await fn();
      await this.db.idempotencyKeys.updateOne(id, { $set: { state: 'DONE', response } });
      return response;
    } catch (e) {
      await this.db.idempotencyKeys.deleteOne(id); // failed writes may be retried with the same key
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Push (FCM HTTP v1) and notifications (UC-22)
// ---------------------------------------------------------------------------

@Injectable()
export class PushService {
  private readonly log = new Logger('Push');
  private client: JWT | null = null;
  private projectId = '';

  constructor(
    private readonly db: Db,
    config: AppConfig,
  ) {
    if (!config.fcmServiceAccountB64) return;
    try {
      const sa = JSON.parse(Buffer.from(config.fcmServiceAccountB64, 'base64').toString('utf8'));
      this.projectId = sa.project_id;
      this.client = new JWT({
        email: sa.client_email,
        key: sa.private_key,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
    } catch (e) {
      this.log.error(`FCM_SERVICE_ACCOUNT_BASE64 is not valid: ${(e as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** Best effort: push failures never fail the request that triggered them. */
  async send(userId: ObjectId, title: string, body: string, data: Record<string, string>): Promise<void> {
    if (!this.client) return;
    const tokens = await this.db.deviceTokens.find({ user_id: userId }).toArray();
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    await Promise.all(
      tokens.map(async (t) => {
        try {
          await this.client!.request({
            url,
            method: 'POST',
            data: { message: { token: t.token, notification: { title, body }, data } },
          });
        } catch (e) {
          const status = (e as { response?: { status?: number } }).response?.status;
          if (status === 404 || status === 400) await this.db.deviceTokens.deleteOne({ token: t.token });
          else this.log.warn(`push failed (${status ?? 'network'})`);
        }
      }),
    );
  }
}

export function serializeNotification(n: NotificationDoc) {
  return { id: n._id.toHexString(), type: n.type, payload: n.payload, read_at: iso(n.read_at), created_at: iso(n.created_at) };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: Db,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  /**
   * Stores a notification, emits `notification:new` to the user's sockets, and sends a push
   * unless the user turned that type off (the in-app list always updates, UC-22).
   */
  async notify(userId: ObjectId, type: NotificationType, message: string, payload: Record<string, unknown> = {}): Promise<void> {
    const doc: NotificationDoc = {
      _id: new ObjectId(),
      user_id: userId,
      type,
      payload: { message, ...payload },
      read_at: null,
      created_at: new Date(),
    };
    await this.db.notifications.insertOne(doc);
    this.realtime.emitToUser(userId, 'notification:new', serializeNotification(doc));
    await this.pushIfEnabled(userId, type, message, { notification_id: doc._id.toHexString(), ...stringMap(payload) });
  }

  /** Push only (no list entry); used for chat messages to recipients who are not connected. */
  async pushIfEnabled(userId: ObjectId, type: NotificationType, message: string, data: Record<string, string>): Promise<void> {
    if (!this.push.enabled) return;
    const user = await this.db.users.findOne({ _id: userId }, { projection: { notification_settings: 1 } });
    if (!user || user.notification_settings?.[type] === false) return;
    void this.push.send(userId, 'Zenzy', message, { type, ...data });
  }
}

function stringMap(o: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = String(v);
  return out;
}
