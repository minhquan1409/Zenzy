import { ObjectId } from 'mongodb';

export interface GeoPoint {
  type: 'Point';
  /** GeoJSON order: [longitude, latitude]. */
  coordinates: [number, number];
}

export type Role = 'USER' | 'ADMIN';
export type Audience = 'FRIENDS' | 'CLOSE_FRIENDS';

export interface LocationSharing {
  enabled: boolean;
  audience: Audience;
  until: Date | null;
  precise: boolean;
  hidden_from: ObjectId[];
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  suspend_reason: string | null;
  warnings: number;
  ghost_mode: boolean;
  location_sharing: LocationSharing;
  notification_settings: Record<string, boolean>;
  date_of_birth: Date;
  guardian_consent: boolean;
  google_id?: string;
  /** Lower-case e-mail used for password reset; optional (the Kotlin client never sends one). */
  email?: string | null;
  /** Wrong password-reset codes in the current 24-hour window (see AuthService.resetPassword). */
  reset_failures?: { count: number; since: Date };
  /**
   * Wrong passwords in a row (see AuthService.login): 5 lock the account for 1 minute, 10 for
   * 5 minutes, 15 for 10 minutes, and 20 block password sign-in until the password is reset.
   * The count starts again after a correct password, a password reset, or 24 hours without a failure.
   */
  login_failures?: LoginFailures;
  /** false = left out of username prefix search (an exact username still finds the user). Default true. */
  discoverable?: boolean;
  /** Set when the account browsed too many strangers' profiles (scraping); reading APIs answer 429 until then. */
  browse_locked_until?: Date | null;
  /** Bumped inside the create-event transaction so concurrent creates conflict (BR-02). */
  event_writes: number;
  created_at: Date;
  updated_at: Date;
}

export interface LoginFailures {
  count: number;
  last_at: Date;
  locked_until: Date | null;
  reset_required: boolean;
}

/** A sign-up waiting for its e-mail code (POST /auth/register). The account is created only after it. */
export interface PendingSignupDoc {
  _id?: ObjectId;
  /** Lower-case; one pending sign-up per address (registering again replaces it). */
  email: string;
  username: string;
  password_hash: string;
  date_of_birth: Date;
  /** sha256 of the 6-digit code; the code itself is only in the e-mail. */
  code_hash: string;
  code_expires_at: Date;
  /** Wrong codes for the current code; the sign-up is discarded after 5. */
  attempts: number;
  /** The row is removed by TTL at this time even if never confirmed. */
  expires_at: Date;
  created_at: Date;
}

export interface RefreshTokenDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  token_hash: string;
  /** Every token issued by rotating the same sign-in shares a family (reuse detection). */
  family_id?: string;
  /** Set when the token was exchanged; a second use of a used token revokes the whole family. */
  used_at?: Date | null;
  expires_at: Date;
  created_at: Date;
}

/** IP blocked from one area of the server (admin sign-in, the APK download page). */
export interface IpBlockDoc {
  _id?: ObjectId;
  ip: string;
  scope: 'ADMIN' | 'DOWNLOAD';
  until: Date;
  reason: string;
  created_at: Date;
}

/** A failed admin sign-in or download-page password, kept 24 hours to count tries per IP. */
/** Fixed-window request counter: `_id` is "<bucket>:<user|ip>:<subject>:<window start>". */
export interface RateCounterDoc {
  _id: string;
  count: number;
  expires_at: Date;
}

/** A stranger's profile opened by a user, kept one hour (scraping detection). */
export interface ProfileViewDoc {
  _id?: ObjectId;
  viewer_id: ObjectId;
  target_id: ObjectId;
  created_at: Date;
}

/** Last map / NEARBY search centre of a user, and its recent far jumps (location probing). */
export interface SearchCenterDoc {
  _id: ObjectId;
  latitude: number;
  longitude: number;
  at: Date;
  jumps: Date[];
}

export interface SecurityFailureDoc {
  _id?: ObjectId;
  scope: 'ADMIN' | 'DOWNLOAD';
  ip: string;
  username?: string;
  user_agent?: string;
  created_at: Date;
}

export interface PasswordResetDoc {
  _id?: ObjectId;
  user_id: ObjectId;
  /** sha256 of the 6-digit code; the code itself is only in the e-mail. */
  code_hash: string;
  expires_at: Date;
  /** Wrong codes entered so far; the code is discarded after 5. */
  attempts: number;
  created_at: Date;
}

export interface FriendshipDoc {
  _id: ObjectId;
  /** user_a < user_b (by hex string) so each pair has exactly one document. */
  user_a: ObjectId;
  user_b: ObjectId;
  status: 'PENDING' | 'ACCEPTED';
  requested_by: ObjectId;
  /** IDs of the users (a and/or b) who marked the other one as a close friend. */
  close_for: ObjectId[];
  created_at: Date;
  updated_at: Date;
}

export type EventStatus = 'OPEN' | 'FULL' | 'CANCELLED' | 'ENDED' | 'HIDDEN' | 'REMOVED';
export type EventType = 'EVENT' | 'SPORTS' | 'STUDY' | 'OTHER';

export interface EventDoc {
  _id: ObjectId;
  host_id: ObjectId;
  title: string;
  type: EventType;
  description: string;
  loc: GeoPoint;
  place_name: string;
  starts_at: Date;
  ends_at: Date;
  max_participants: number | null;
  approved_count: number;
  audience: 'EVERYONE' | 'CLOSE_FRIENDS';
  status: EventStatus;
  /** Status to restore when an admin dismisses the reports that hid the event. */
  status_before_hidden?: EventStatus | null;
  cancel_reason?: string | null;
  conversation_id: ObjectId;
  created_at: Date;
  updated_at: Date;
}

export type ParticipantStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'LEFT' | 'KICKED';

export interface ParticipantDoc {
  _id: ObjectId;
  event_id: ObjectId;
  user_id: ObjectId;
  status: ParticipantStatus;
  created_at: Date;
  updated_at: Date;
}

export interface MenuItem {
  name: string;
  price: number;
  photo_url: string | null;
}

export interface ShopDoc {
  _id: ObjectId;
  owner_id: ObjectId;
  name: string;
  description: string;
  address: string;
  loc: GeoPoint;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  /** Set by BR-03 (3 distinct reports); the shop enum has no HIDDEN value, so this is a flag. */
  hidden: boolean;
  reviewed_by: ObjectId | null;
  reject_reason: string | null;
  menu: MenuItem[];
  /** Free-text opening hours, e.g. "07:00 – 22:00" (shown on the shop screen). */
  hours: string;
  cover_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DealDoc {
  _id: ObjectId;
  shop_id: ObjectId;
  title: string;
  discount: string;
  starts_at: Date;
  ends_at: Date;
  status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
  created_at: Date;
  updated_at: Date;
}

export interface PostDoc {
  _id: ObjectId;
  author_id: ObjectId;
  text: string;
  photos: string[];
  place_name: string | null;
  loc?: GeoPoint;
  status: 'ACTIVE' | 'HIDDEN' | 'REMOVED';
  like_count: number;
  comment_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  type: 'DIRECT' | 'GROUP' | 'EVENT';
  member_ids: ObjectId[];
  name: string | null;
  event_id?: ObjectId;
  /** "idA:idB" (sorted) for DIRECT conversations; unique. */
  direct_key?: string;
  created_by: ObjectId;
  muted_by: ObjectId[];
  hidden_for: ObjectId[];
  /** userId (hex) -> time the user last read the conversation. */
  read_at: Record<string, Date>;
  last_message: { id: ObjectId; sender_id: ObjectId; content: string; created_at: Date } | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageDoc {
  _id: ObjectId;
  conversation_id: ObjectId;
  sender_id: ObjectId;
  text: string;
  created_at: Date;
}

export interface NotificationDoc {
  _id: ObjectId;
  user_id: ObjectId;
  type: string;
  payload: Record<string, unknown>;
  read_at: Date | null;
  created_at: Date;
}

export type ReportTargetType = 'POST' | 'EVENT' | 'SHOP' | 'USER';

export interface ReportDoc {
  _id: ObjectId;
  reporter_id: ObjectId;
  target_type: ReportTargetType;
  target_id: ObjectId;
  reason: string;
  note: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: { action: string; reason: string; admin_id: ObjectId; at: Date };
  created_at: Date;
}

export const NOTIFICATION_TYPES = [
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'EVENT_JOIN_REQUEST',
  'EVENT_REQUEST_RESULT',
  'EVENT_UPDATE',
  'CHAT_MESSAGE',
  'SHOP_REVIEW',
  'MODERATION',
  'ACCOUNT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** BR-05 / NFR-14: a stored location is ignored (and removed by TTL) after 15 minutes. */
export const LOCATION_TTL_SECONDS = 900;
/** BR-02 */
export const MAX_ACTIVE_EVENTS = 5;
/** BR-03 */
export const REPORTS_TO_HIDE = 3;
export const PAGE_SIZE = 20;
