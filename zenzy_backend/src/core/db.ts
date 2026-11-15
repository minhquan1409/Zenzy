import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClientSession, Collection, Db as MongoDb, Document, MongoClient, ObjectId } from 'mongodb';
import { AppConfig } from './config';
import { ensureSchema } from './schema';
import {
  ConversationDoc,
  DealDoc,
  EventDoc,
  FriendshipDoc,
  GeoPoint,
  MessageDoc,
  NotificationDoc,
  ParticipantDoc,
  PostDoc,
  ReportDoc,
  ShopDoc,
  UserDoc,
  PasswordResetDoc,
  PendingSignupDoc,
  RefreshTokenDoc,
  IpBlockDoc,
  SecurityFailureDoc,
  RateCounterDoc,
  ProfileViewDoc,
  SearchCenterDoc,
} from './types';

/** The only place that holds the MongoDB connection (NFR-15: no client ever connects to the database). */
@Injectable()
export class Db implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Db');
  client: MongoClient;
  db: MongoDb;

  users: Collection<UserDoc>;
  credentials: Collection<{ _id?: ObjectId; user_id: ObjectId; password_hash: string }>;
  refreshTokens: Collection<RefreshTokenDoc>;
  friendships: Collection<FriendshipDoc>;
  blocks: Collection<{ _id?: ObjectId; blocker_id: ObjectId; blocked_id: ObjectId; created_at: Date }>;
  userLocations: Collection<{ _id: ObjectId; loc: GeoPoint; accuracy: number | null; updated_at: Date }>;
  events: Collection<EventDoc>;
  participants: Collection<ParticipantDoc>;
  shops: Collection<ShopDoc>;
  deals: Collection<DealDoc>;
  posts: Collection<PostDoc>;
  postLikes: Collection<{ _id?: ObjectId; post_id: ObjectId; user_id: ObjectId; created_at: Date }>;
  postComments: Collection<{ _id: ObjectId; post_id: ObjectId; author_id: ObjectId; text: string; created_at: Date }>;
  savedPosts: Collection<{ _id: ObjectId; post_id: ObjectId; user_id: ObjectId; created_at: Date }>;
  conversations: Collection<ConversationDoc>;
  messages: Collection<MessageDoc>;
  notifications: Collection<NotificationDoc>;
  deviceTokens: Collection<{ _id?: ObjectId; user_id: ObjectId; token: string; platform: string; updated_at: Date }>;
  reports: Collection<ReportDoc>;
  bannedKeywords: Collection<{ _id?: ObjectId; keyword: string }>;
  auditLog: Collection<Document>;
  idempotencyKeys: Collection<Document>;
  loginAttempts: Collection<Document>;
  passwordResets: Collection<PasswordResetDoc>;
  pendingSignups: Collection<PendingSignupDoc>;
  ipBlocks: Collection<IpBlockDoc>;
  securityFailures: Collection<SecurityFailureDoc>;
  rateCounters: Collection<RateCounterDoc>;
  profileViews: Collection<ProfileViewDoc>;
  searchCenters: Collection<SearchCenterDoc>;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    this.client = new MongoClient(this.config.mongoUri, { serverSelectionTimeoutMS: 15000 });
    await this.client.connect();
    this.db = this.client.db(this.config.mongoDbName);
    const c = <T extends Document>(name: string) => this.db.collection<T>(name);
    this.users = c('users');
    this.credentials = c('credentials');
    this.refreshTokens = c('refresh_tokens');
    this.friendships = c('friendships');
    this.blocks = c('blocks');
    this.userLocations = c('user_locations');
    this.events = c('events');
    this.participants = c('event_participants');
    this.shops = c('shops');
    this.deals = c('flash_deals');
    this.posts = c('posts');
    this.postLikes = c('post_likes');
    this.postComments = c('post_comments');
    this.savedPosts = c('saved_posts');
    this.conversations = c('conversations');
    this.messages = c('messages');
    this.notifications = c('notifications');
    this.deviceTokens = c('device_tokens');
    this.reports = c('reports');
    this.bannedKeywords = c('banned_keywords');
    this.auditLog = c('admin_audit_log');
    this.idempotencyKeys = c('idempotency_keys');
    this.loginAttempts = c('login_attempts');
    this.passwordResets = c('password_resets');
    this.pendingSignups = c('pending_signups');
    this.ipBlocks = c('ip_blocks');
    this.securityFailures = c('security_failures');
    this.rateCounters = c('rate_counters');
    this.profileViews = c('profile_views');
    this.searchCenters = c('search_centers');
    await ensureSchema(this.db, (m) => this.log.warn(m));
    this.log.log(`connected to database "${this.config.mongoDbName}"`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  /** Runs `fn` in a multi-document transaction (needs a replica set, which Atlas provides). */
  async tx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => fn(session));
    } finally {
      await session.endSession();
    }
  }
}

export function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}
