# Zenzy API reference (v1)

Implements spec section 5.3. Base URL: `https://<your-domain>/v1/` (locally `http://localhost:3100/v1/` after `adb reverse tcp:3100 tcp:3100`
from the Android emulator).

## Conventions

- JSON in and out, `snake_case` fields, times in **UTC ISO-8601** (`2026-11-07T10:30:00.000Z`, NFR-19);
  `date_of_birth` is `YYYY-MM-DD`. IDs are 24-character hex strings.
- `Authorization: Bearer <access_token>` on every route except register, login, Google, refresh and `GET /health`.
  Access tokens live 15 minutes; on `401` call `POST /auth/refresh` once, store the new pair, retry.
  A refresh token works exactly once (rotation).
- `Idempotency-Key: <uuid>` header (optional, recommended) on `POST /events`, `POST /events/{id}/requests`,
  `POST /posts`, `POST /conversations/{id}/messages`, `POST /reports`. A retry with the same key returns the
  first response and never creates a duplicate (NFR-06). Generate one key per user action and keep it
  across retries of that action.
- Errors always look like `{ "code": "EVENT_LIMIT", "message": "…", "timestamp": "…" }`.
  Status codes: `400` invalid input (`INVALID_INPUT` + field messages), `401` not authenticated, `403` not
  allowed, `404` not found (also for hidden or blocked items), `409` conflict, `422` `BANNED_KEYWORD`,
  `429` `TOO_MANY_ATTEMPTS`, `503` feature not configured.
- Anti-scraping (all `429`, with `retry_after` in seconds and the `Retry-After` header):
  - `RATE_LIMITED`: too many calls in a window. Every signed-in user: 600 requests / minute. Per route
    (account / IP): `GET /users` 30 / 100 an hour, `GET /users/{id}` 300 / 600 an hour, `GET /posts`
    120 / 300 a minute, `GET /map/nearby` and `GET /events` 60 / 150 a minute, `GET /search` 30 / 100 a minute.
  - `BROWSING_PAUSED`: the account opened more than 60 profiles of non-friends within an hour; those
    reading routes are refused for 60 minutes and the admin gets an e-mail. The account's own data still works.
  - `LOCATION_JUMP`: the centre of `GET /map/nearby`, `GET /events` or the `NEARBY` feed moved more than
    50 km within 10 minutes more than 5 times in an hour.
- Lists are `{ "items": [...], "next_cursor": "…" | null }`. Pass `?cursor=<next_cursor>` for the next page (20 items).
- Coordinates are `latitude` / `longitude` in degrees. Radii are in metres.

### Shared objects

```jsonc
// PublicUser
{ "id": "…", "username": "minh_20", "display_name": "Minh", "avatar_url": "https://…" | null }

// Tokens
{ "access_token": "…", "refresh_token": "…", "token_type": "Bearer", "expires_in": 900 }

// Me (profile)
{ "id", "username", "display_name", "avatar_url", "bio", "role": "USER" | "ADMIN", "status": "ACTIVE",
  "date_of_birth": "2005-03-02", "guardian_consent": false, "has_password": true, "created_at" }

// Privacy
{ "ghost_mode": false, "sharing_enabled": true, "audience": "FRIENDS" | "CLOSE_FRIENDS",
  "share_until": "…" | null, "precise": true, "hidden_from": ["userId"], "guardian_consent_required": false,
  "discoverable": true }

// EventSummary
{ "id", "host_id", "title", "type": "EVENT" | "SPORTS" | "STUDY" | "OTHER", "description",
  "latitude", "longitude", "place_name", "start_time", "end_time", "is_live": true,
  "max_participants": 10 | null, "participants_count": 3, "spots_left": 7 | null,
  "audience": "EVERYONE" | "CLOSE_FRIENDS", "status": "OPEN" | "FULL" | "CANCELLED" | "ENDED" | "HIDDEN" | "REMOVED" }

// ShopSummary
{ "id", "name", "address", "latitude", "longitude", "has_active_deal": true, "active_deal": Deal | null }

// Deal
{ "id", "shop_id", "title", "discount": "-20%", "start_time", "end_time",
  "status": "ACTIVE" | "ENDED" | "CANCELLED", "remaining_seconds": 5400 }

// Post
{ "id", "author": PublicUser, "text", "photo_urls": [], "place_name", "latitude", "longitude",
  "like_count", "comment_count", "liked_by_me", "saved_by_me", "is_mine", "created_at", "updated_at" }

// Notification
{ "id", "type": "FRIEND_REQUEST" | …, "payload": { "message": "…", …ids }, "read_at": null, "created_at" }
```

## Auth and account (UC-01, UC-02, UC-17)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `POST /auth/register` | `username` (3–30: a–z 0–9 `_` `.`, stored lower-case), `password` (8–128), `date_of_birth`, `email` (required) | `202 { verification_required: true, email, expires_in }`: a 6-digit code is e-mailed (development without SMTP also returns `dev_code`). **No account exists yet**; registering again with the same e-mail replaces the pending sign-up | 400, 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`, 429 after 5 sign-ups / 15 min per IP, 503 `MAIL_NOT_CONFIGURED` |
| `POST /auth/register/verify` | `email`, `code` (6 digits, valid 15 min) | `201 { user: Me, tokens }`: the account is created and signed in | 400 `INVALID_VERIFICATION_CODE`, 400 `SIGNUP_EXPIRED` (5th wrong code: sign up again), 409 if the username was taken meanwhile, 429 after 20 tries / 15 min per IP |
| `POST /auth/register/resend` | `email` | `202`, same body as register (same answer when nothing is pending) | 429 after 3 / 15 min per address or 10 per IP |
| `POST /auth/login` | `username`, `password` | `200 { user: Me, tokens }`. Admin accounts are refused here (`401 INVALID_CREDENTIALS`); they use `POST /admin/login` | 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_SUSPENDED` (message has the reason), 429 `ACCOUNT_LOCKED` `{ retry_after }` (seconds, also the `Retry-After` header) after 5 wrong passwords in a row (1 min), 10 (5 min), 15 (10 min); 403 `PASSWORD_RESET_REQUIRED` after 20 (only `/auth/password/reset` unlocks it); the count restarts after a correct password or 24 h without failures. 429 `TOO_MANY_ATTEMPTS` after 30 failures / 15 min per IP |
| `POST /auth/google` | `id_token`; first time also `username`, `date_of_birth` | `200 { user, tokens }` | 400 `PROFILE_REQUIRED` (ask for username + DOB, resend), 401 `INVALID_GOOGLE_TOKEN`, 409 `USERNAME_TAKEN` |
| `POST /auth/password/forgot` | `login` (username or e-mail) | `200 { sent: true, expires_in }`, the same answer whether or not the account exists or has an e-mail; a 6-digit code is e-mailed when it does (development without SMTP also returns `dev_code`) | 429 after 10 requests / 15 min per IP, 503 `MAIL_NOT_CONFIGURED` (production without SMTP) |
| `POST /auth/password/reset` | `login`, `code` (6 digits), `new_password` | `204`; every session is signed out | 400 `INVALID_RESET_CODE` (5 tries per code), 429 after 10 wrong codes / 24 h per account or 20 tries / 15 min per IP |
| `POST /auth/refresh` | `refresh_token` | `200 Tokens`. Each refresh token works once. A token used again more than 10 s later means it was copied: every token of that sign-in is revoked | 401 `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REUSED` (send the user to login) |
| `POST /auth/logout` | `refresh_token` | `204`; ends that sign-in (all of its tokens) | |
| `GET /me` | | `200 { profile: Me + { friends_count, events_joined, posts_count }, privacy: Privacy, notification_settings: {TYPE: bool} }` | |
| `PATCH /me` | any of `display_name` (1–50), `avatar_url` (from `/uploads/sign`) or `null`, `bio` (≤200), `email` or `null`; changing the e-mail also needs `current_password` (or `id_token` for Google-only accounts) | `200 Me` | 400 (`INVALID_MEDIA_URL` for an image that is not an upload), 403 `REAUTH_REQUIRED`, 409 `EMAIL_TAKEN` |
| `PUT /me/password` | `current_password`, `new_password`, `refresh_token` (optional: this session, which is kept) | `204`; every other session is signed out | 400 `WRONG_PASSWORD`, 409 `NO_PASSWORD` (Google-only: hide the option when `has_password` is false) |
| `DELETE /me` | `password`, or `id_token` for Google accounts | `202 { status: "DELETION_ACCEPTED" }` (data and media deleted immediately) | 403 `REAUTH_FAILED` |
| `PUT /me/guardian-consent` | `confirmed` (bool) | `200 { guardian_consent }` | |
| `GET /users/{id}` | | `200 PublicUser + { bio, friends_count, events_joined, posts_count, friendship_status: NONE / FRIENDS / PENDING_OUTGOING / PENDING_INCOMING / BLOCKED / SELF, friend_request_id, close_friend }` | 404 (also when that user blocked you) |
| `GET /me/events` | | `200 { hosted: [EventSummary + pending_requests], joined: [EventSummary + my_status] }` (UC-10, UC-11) | |
| `GET /users?username=` | prefix search, at least 3 characters | `200 { items: [PublicUser] }` (max 10, no bio; blocked users excluded; users with `discoverable: false` only on an exact username) | 400 (fewer than 3 characters), 429 |

## Privacy, location and map (UC-03, UC-04, UC-07, UC-23)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /me/privacy` | | `200 Privacy` | |
| `PUT /me/privacy` | any of `ghost_mode`, `sharing_enabled`, `audience`, `share_until` (future time or `null` = until turned off; presets 1 h/8 h/24 h are computed by the app), `precise`, `hidden_from` (user IDs), `discoverable` (false = only an exact username finds you in search) | `200 Privacy`. Ghost Mode on / sharing off deletes the stored location and emits `location:hide` to friends | 403 `GUARDIAN_CONSENT_REQUIRED` (under 16), 400 |
| `PUT /me/location` | `latitude`, `longitude`, `accuracy` (m, optional) | `204` (overwrites the single stored position; expires after 15 min) | 409 `SHARING_OFF` (stop sending) |
| `GET /map/nearby` | `latitude`, `longitude`, `radius` (default 5000, max 50000), `types=friends,events,shops` (default all) | `200 { friends: [{ user: PublicUser, latitude, longitude, accuracy, updated_at }], events: [EventSummary], shops: [ShopSummary], server_time }` | |
| `GET /search` | `q`, `type` (`SHOP`/`EVENT`, optional), `latitude`, `longitude` (optional; sorts by distance), `cursor` | `200 { items: [{ type, distance_m, …ShopSummary or EventSummary }], next_cursor }`. `type` is `SHOP` for a shop; for an event it is the event's own type (`EVENT`, `SPORTS`, `STUDY`, `OTHER`) | |

Send the location every 15 s while moving and every 2 min when still, only while `sharing_enabled` is true
and `ghost_mode` is false (spec 3.2). Friends you may see are filtered on the server.

## Friends and blocking (UC-05)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /friends` | `status` = `ACCEPTED` (default) or `PENDING`, `q` | `200 { items: [{ request_id, user, status, direction: INCOMING / OUTGOING / null, close_friend, created_at }] }` | |
| `POST /friends/requests` | `receiver_id` | `201 { request_id, status: "PENDING", user }` | 409 `DUPLICATE_REQUEST`, 403 `BLOCKED`, 404 |
| `PATCH /friends/requests/{request_id}` | `action` = `ACCEPT` / `REJECT` | `200 { request_id, status }` | 403 `NOT_RECIPIENT`, 409 `ALREADY_ANSWERED` |
| `DELETE /friends/{user_id}` | | `204` (unfriend, or withdraw a pending request) | |
| `PUT /friends/{user_id}/close` | `close` (bool) | `200 { user_id, close_friend }` | 404 not a friend |
| `GET /blocks` | | `200 { items: [{ user, blocked_at }] }` | |
| `POST /blocks` | `user_id` | `201 { user_id, blocked: true }` (friendship ends) | |
| `DELETE /blocks/{user_id}` | | `204` (friendship is not restored) | |

## Events and live pins (UC-08 to UC-11)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /events` | `latitude`, `longitude`, `radius` (default 5000), `type`, `when` = `NOW` / `SCHEDULED` | `200 { items: [EventSummary] }` (OPEN/FULL, not ended, visible to you) | |
| `GET /events/{id}` | | `200 EventSummary + { host: PublicUser, my_status: HOST / PENDING / APPROVED / REJECTED / CANCELLED / LEFT / KICKED / null, my_request_id, conversation_id (host and approved members), cancel_reason }` | 404 if not visible |
| `POST /events` | `title` (3–80), `type`, `latitude`, `longitude`, `end_time`, optional `start_time` (omit = live pin starting now), `description` (≤1000), `place_name` (≤120), `max_participants` (1–1000 or null), `audience` (default `EVERYONE`) | `201 EventSummary + { conversation_id }` | 400, 409 `EVENT_LIMIT` (5 active), 422 `BANNED_KEYWORD` |
| `PATCH /events/{id}` | any create field (host only) | `200 EventSummary` | 403 `NOT_HOST`, 409 `EVENT_NOT_ACTIVE` / `MAX_BELOW_APPROVED`, 422 |
| `POST /events/{id}/cancel` | `reason` (optional) | `200 EventSummary` (CANCELLED; members notified) | 403 `NOT_HOST`, 409 |
| `GET /events/{id}/participants` | `status` (host only) | `200 { items: [{ request_id, user, status, requested_at }] }` (non-hosts get APPROVED only) | 404 |
| `POST /events/{id}/requests` | — | `201 { request_id, event_id, status: "PENDING" }` (host notified) | 409 `EVENT_FULL` / `DUPLICATE_REQUEST` / `EVENT_ENDED`, 403 `BLOCKED_BY_HOST`, 400 `OWN_EVENT` |
| `PATCH /events/{id}/requests/{request_id}` | `status` = `APPROVED` / `REJECTED` | `200 { request_id, status, event: EventSummary }` (approve = member + event chat; FULL at max) | 403 `NOT_HOST`, 409 `EVENT_FULL` / `REQUEST_NOT_PENDING` |
| `DELETE /events/{id}/requests/me` | | `204` (cancel pending request, or leave; FULL becomes OPEN) | 404 |
| `DELETE /events/{id}/members/{user_id}` | | `204` (KICKED, seat released) | 403 `NOT_HOST`, 404 |

A user may send a new request after cancelling or leaving, but not after being rejected or removed.

## Shops and flash deals (UC-12 to UC-15)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /shops/{id}` | | `200 ShopSummary + { owner_id, description, menu: [{ name, price, photo_url }], status, is_owner, created_at }` (owner also gets `reject_reason`, `hidden`) | 404 unless APPROVED or yours |
| `POST /shops` | `name` (2–80), `address`, `latitude`, `longitude`, `description`, `menu`, `hours` (text ≤ 60, e.g. "07:00 – 22:00"), `cover_url` | `201` same shape, `status: "PENDING"` | 400, 422 |
| `PATCH /shops/{id}` | any create field (owner); a REJECTED shop goes back to PENDING | `200` | 403 `NOT_OWNER`, 422 |
| `GET /me/shops` | | `200 { items: [...] }` with status and reject reason | |
| `GET /shops/{id}/deals` | `status` (default `ACTIVE`) | `200 { items: [Deal] }` | 404 |
| `POST /shops/{id}/deals` | `title`, `discount` (text such as `-20%` or `Buy 1 get 1`), `end_time`, optional `start_time` | `201 Deal` | 400 end not after start, 403 `SHOP_NOT_APPROVED` / `NOT_OWNER` |
| `PATCH /shops/{id}/deals/{deal_id}` | fields, or `status: "CANCELLED"` to end early | `200 Deal` | 403, 409 `DEAL_NOT_ACTIVE` |

Prices are numbers in VND. Deals become ENDED automatically after `end_time`.

## Feed and uploads (UC-21)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /posts` | `feed` = `FOR_YOU` (default) / `FOLLOWING` (friends) / `NEARBY` (+ `latitude`, `longitude`, 5 km), `author_id` (one user's posts), `cursor` | `200 { items: [Post], next_cursor }`. A post's `latitude` / `longitude` are exact only for the author and the author's friends; others get them rounded to 3 decimals (~100 m) | 429 |
| `GET /posts/{id}` | | `200 Post` | 404 if hidden, removed or the author blocked you |
| `POST /posts` | `text` (≤500), `photo_urls` (≤4), `place_name`, optional `latitude`/`longitude` | `201 Post` | 400, 422 |
| `PATCH /posts/{id}` | `text` | `200 Post` | 403 `NOT_AUTHOR`, 422 |
| `DELETE /posts/{id}` | | `204` | 403 |
| `PUT` / `DELETE /posts/{id}/like` | | `204` | 404 |
| `GET /posts/{id}/comments` | `cursor` | `200 { items: [{ id, author, text, created_at }], next_cursor }` | |
| `POST /posts/{id}/comments` | `text` | `201` comment | 422 |
| `PUT` / `DELETE /posts/{id}/save` | | `204` | |
| `GET /me/saved-posts` | `cursor` | `200 { items: [Post], next_cursor }` | |
| `POST /uploads/sign` | `purpose` = `AVATAR` / `POST_PHOTO` / `SHOP_IMAGE`, `content_type` = `image/jpeg` / `image/png` / `image/webp` | `200 { upload_url, method: "POST", fields: {…}, public_url, max_bytes: 512000, expires_in: 300 }` | 503 `UPLOADS_NOT_CONFIGURED` |

Without S3 (local development) the ticket points at `POST /v1/uploads/local` on the API itself and the file is
served from `/media/...`; the client code is identical.

Upload flow: compress the image to ≤ 500 KB, call `/uploads/sign`, send a `multipart/form-data` POST
to `upload_url` with every entry of `fields` first and the file last (form field name `file`), then
use `public_url` in `PATCH /me`, `POST /posts` or the shop menu. When media storage is configured, other image
links are refused with 400 `INVALID_MEDIA_URL` (Google profile photos are accepted).

Sockets: the server sends `connection:error` `{ code: "TOKEN_EXPIRED" }` and disconnects when the access
token a socket connected with expires; refresh the token and connect again.

## Chat (UC-06)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `GET /conversations` | `type` = `DIRECT` / `GROUP` / `EVENT` | `200 { items: [{ id, type, name, other_user, event_id, member_count, last_message: { id, sender_id, content, created_at } \| null, unread_count, muted, updated_at }] }` | |
| `POST /conversations` | `type` = `DIRECT` / `GROUP`, `member_ids` (friends), `name` (group) | `201` conversation (an existing direct chat is returned again) | 403 `NOT_FRIENDS` |
| `GET /conversations/{id}/messages` | `limit` (1–100, default 30), `before` (time) | `200 { items: [{ id, conversation_id, sender_id, content, created_at }], next_before }` newest first | 403 `NOT_A_MEMBER` |
| `POST /conversations/{id}/messages` | `content` (1–2000) | `201` message | 403 `NOT_A_MEMBER` / `BLOCKED` |
| `POST /conversations/{id}/read` | | `204` | |
| `PATCH /conversations/{id}` | `muted` (bool) | `200 { id, muted }` | |
| `DELETE /conversations/{id}` | | `204` (removed from your list until a new message arrives) | |

Event chats are created with the event; approved members are added automatically.

## Notifications (UC-22)

| Method and path | Body / query | Success |
|---|---|---|
| `GET /notifications` | `cursor` | `200 { items: [Notification], next_cursor, unread_count }` |
| `POST /notifications/read-all` | | `204` |
| `PATCH /notifications/{id}` | `read` (bool) | `200 Notification` |
| `GET /me/notification-settings` | | `200 { FRIEND_REQUEST: true, FRIEND_ACCEPTED, EVENT_JOIN_REQUEST, EVENT_REQUEST_RESULT, EVENT_UPDATE, CHAT_MESSAGE, SHOP_REVIEW, MODERATION, ACCOUNT }` |
| `PUT /me/notification-settings` | partial map of type → bool (off = no push; the list still updates) | `200` full map |
| `PUT /me/device-tokens` | `token` (FCM), `platform` = `ANDROID` / `IOS` | `204` |
| `DELETE /me/device-tokens` | `token` (call at logout) | `204` |

Push `data` contains `type`, `notification_id` and the payload IDs (`event_id`, `request_id`, `conversation_id`, …) to open the right screen.

## Reports and administration (UC-16 to UC-20)

| Method and path | Body / query | Success | Errors |
|---|---|---|---|
| `POST /reports` | `target_type` = `POST` / `EVENT` / `SHOP` / `USER`, `target_id`, `reason` = `SPAM` / `SCAM` / `HARASSMENT` / `ILLEGAL` / `SENSITIVE` / `OTHER`, `note` (≤500) | `201 { created: true, report, hidden }`; `200 { created: false, … }` if you already reported it. Posts and events are hidden after 3 reporters (BR-03); shops and users never are: only an admin hides, blocks or bans them | 400 `OWN_CONTENT`, 404 |
| `POST /admin/login` | `username`, `password` | `200 { user: Me, tokens }`, only for `ADMIN` accounts (public route) | 401 `INVALID_CREDENTIALS` (message says how many tries are left), 403 `IP_BLOCKED` `{ retry_after }`: 3 wrong tries from one IP in 24 h block it from the admin sign-in and every `/admin/*` route for 24 h and e-mail `ADMIN_ALERT_EMAIL` |
| `GET /admin/reports` | `status` = `OPEN` (default) / `RESOLVED`, `cursor` | `200 { items: [{ report_id, target_type, target_id, report_count, reasons, notes, first_reported_at, last_reported_at, target: {…} \| null }], next_cursor }` sorted by count, then oldest | 403 |
| `PATCH /admin/reports/{report_id}` | `action` = `DISMISS` / `REMOVE` / `REMOVE_WARN` / `REMOVE_SUSPEND`, `reason` | `200 { report_id, status: "RESOLVED", action, applied, target_type, target_id }` (resolves every open report on that item; audit-logged; owner notified) | 403, 409 `ALREADY_RESOLVED` |
| `GET /admin/shops` | `status` (default `PENDING`) | `200 { items: [...] }` oldest first | 403 |
| `PATCH /admin/shops/{shop_id}` | `decision` = `APPROVE` / `REJECT`, `reason` (required for reject) | `200 { id, status, reviewed_by, reject_reason }` | 403, 409 `SHOP_NOT_PENDING` |
| `GET /admin/users` | `q` (username prefix) | `200 { items: [PublicUser + { role, status, suspend_reason, warnings, created_at, report_counts: { profile, content, open } }] }` | 403 |
| `PATCH /admin/users/{user_id}/status` | `status` = `SUSPENDED` / `ACTIVE`, `reason` | `200 { id, status, reason }` (suspending logs the user out everywhere) | 403 |

## Real-time channel (Socket.IO, spec 5.3.11)

Connect to the **host root** (not `/v1`), path `/socket.io/`, with `auth: { token: <access_token> }`.
Android: `io.socket:socket.io-client` 2.x, `IO.Options.builder().setAuth(mapOf("token" to accessToken))`.
On a new access token, reconnect with it. If the socket drops, keep using REST at the same intervals.

| Event (server → client) | Payload |
|---|---|
| `connection:ready` | `{ user_id }` (rooms joined) |
| `connection:error` | `{ code, message }`, then the server disconnects (bad or expired token: refresh and reconnect) |
| `location:update` | `{ user_id, latitude, longitude, accuracy, updated_at }` (only to friends allowed to see it) |
| `location:hide` | `{ user_id }` (Ghost Mode, sharing ended, unfriended or blocked: remove the marker) |
| `event:created`, `event:updated` | `EventSummary` (only to users allowed to see it); after moderation `{ id, status: "HIDDEN" \| "REMOVED" }` |
| `chat:message` | `{ conversation_id, message: { id, conversation_id, sender_id, content, created_at } }` |
| `notification:new` | `Notification` |

The client sends nothing over the socket; all writes go through REST.

## Admin dashboard

`GET /admin/` (no `/v1`) serves the web dashboard for UC-17 to UC-20. It signs in through `POST /v1/admin/login`
(admin accounts only; see the table above for the IP block). Create the admin account with
`deploy/aws/setup-admin.ps1` (production) or `ADMIN_USERNAME=… ADMIN_PASSWORD=… npm run db:init` (local).

## APK download page

`GET /v1/internal/download-auth` (public) is the `forward_auth` target Caddy calls for every `/download/` request
with the browser's Basic credentials (`DOWNLOAD_USER`, `DOWNLOAD_PASSWORD_HASH_B64`). `204` lets it through,
`401` (with `WWW-Authenticate`) asks again, and after 10 wrong passwords from one IP in 24 h it answers `403` for 24 h.

## Health

`GET /health` (no `/v1` prefix, no auth) → `200 { status: "ok", time }`.
