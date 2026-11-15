# Zenzy server

Backend API for the Zenzy app, built from `Zenzy_Specification.pdf` (sections 2.3, 2.5, 3, 4 and 5).

| | Choice (spec 4.4) |
|---|---|
| Language / framework | TypeScript, **Node.js + NestJS 11**, REST under `/v1` |
| Database | **MongoDB** only (Atlas in production): 2dsphere, TTL and unique indexes, JSON Schema validators, multi-document transactions |
| Real time | **Socket.IO** in the same process |
| Auth | Username + password (**bcrypt**, separate `credentials` collection) and **Google ID-token** verification; **JWT** access tokens (15 min) + hashed, rotated refresh tokens (30 days) |
| Media | **S3** signed uploads + CloudFront (spec allows "S3-compatible storage or Cloudinary"; S3 chosen because the target is AWS) |
| Push | **FCM HTTP v1** (optional) |
| Validation | zod (spec leaves it open; small and explicit) |
| Hosting | AWS EC2 + Docker + Caddy, see [docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md) |

Endpoint list with request and response shapes for the Android app: **[docs/API.md](docs/API.md)**.

## Layout

```
src/
  app.module.ts   root module: imports one feature module per spec component + guards + error filter
  core/           CoreModule (global): config, address.ts, Mongo connection + schema/indexes, central
                  authorisation layer (access.service.ts), Socket.IO gateway, notifications/push,
                  banned words, idempotency, media, mail, abuse limits; JobsModule (scheduled jobs)
  common/http.ts  error format, auth guard, validation helpers, pagination
  auth/ users/ location/ friends/ events/ shops/ posts/ chat/ notifications/ moderation/
                  one NestJS feature module each: <x>.module.ts, <x>.controller.ts, <x>.service.ts
scripts/db-init.ts  apply schema, create the first admin, seed banned keywords
test/               end-to-end tests (real HTTP + Socket.IO against an in-memory replica set)
deploy/aws/         CloudFormation stack + deploy script
docs/               API reference, AWS deployment guide
ci/                 GitHub Actions workflow (copy to .github/workflows/ to enable)
```

Layers run one way: **controller** (route, input validation with zod, HTTP status) → **service**
(business rules and every database access) → **core** (Db, AccessService, gateway). Controllers never touch
the database.

All visibility decisions (who sees a location, event, shop or post) live in
`src/core/access.service.ts` and are used by both REST reads and socket emits (NFR-09, spec 4.8).

## Run locally

Requirements: Node.js 22.9+ (24 LTS recommended) and Docker Desktop.

```bash
cd zenzy_backend
npm install
cp .env.example .env            # then set JWT_SECRET
docker compose -f docker-compose.dev.yml up -d --wait   # MongoDB 7 single-node replica set
npm run db:init                 # optional: schema is also applied at start-up
npm run start:dev               # prints the address (default http://127.0.0.1:3100/v1, Socket.IO on the same origin)
curl http://127.0.0.1:3100/health
npm run seed:demo               # optional demo data; add `-- --live` to keep demo friends moving
```

Create a local admin and banned words:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='local-admin-password' BANNED_KEYWORDS='word1,word2' npm run db:init
```

(PowerShell: `$env:ADMIN_USERNAME='admin'; $env:ADMIN_PASSWORD='...'; npm run db:init`.)

**Server address: one file.** Host, port, docs port, local MongoDB URI and the deployed base URL live only in
[`src/core/address.ts`](src/core/address.ts); `main.ts`, `config.ts` and the scripts (`seed:demo`, `docs`,
`docs:postman`) read them from there. The local server listens on `127.0.0.1` only, so other machines on the
network cannot reach it. To deploy or change the port, edit that file (Docker/AWS override `HOST`/`PORT`).

The debug app calls `http://127.0.0.1:3100/v1/`; run `adb reverse tcp:3100 tcp:3100` once per device/emulator
so that address reaches this PC. Admin dashboard: <http://127.0.0.1:3100/admin/> (demo admin `thao` / `password123`
after `npm run seed:demo`).

Production build: `npm run build && npm start`, or `docker build -t zenzy-api .`.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | local replica set | MongoDB connection string (Atlas `mongodb+srv://…` in production). Must be a replica set. |
| `MONGODB_DB` | | `zenzy` (`.env.example`: `zenzylocaldemo`) | Database name; the localhost build uses its own DB on the same cluster |
| `JWT_SECRET` | yes in production | dev fallback | ≥ 32 random characters; the server refuses to start in production without it |
| `ACCESS_TOKEN_TTL_SECONDS` | | `900` | NFR-08 |
| `REFRESH_TOKEN_TTL_DAYS` | | `30` | NFR-08 |
| `BCRYPT_ROUNDS` | | `10` | Password hashing cost |
| `GOOGLE_CLIENT_IDS` | for Google sign-in | empty | Comma-separated OAuth client IDs accepted as ID-token audience |
| `CORS_ORIGINS` | | empty | Browser origins (admin dashboard); mobile apps need none |
| `TRUST_PROXY` | | `0` | `1` behind Caddy so rate limiting sees the client IP |
| `AWS_REGION`, `S3_BUCKET`, `MEDIA_PUBLIC_BASE_URL` | for uploads | empty | Signed uploads; on EC2 the instance role supplies AWS credentials |
| `FCM_SERVICE_ACCOUNT_BASE64` | for push | empty | Base64 of the Firebase service-account JSON |
| `JOBS_ENABLED` | | `true` | Ends past events/deals and expired time-limited sharing every 30 s |
| `HOST`, `PORT` | | `127.0.0.1`, `3100` from `src/core/address.ts` | Override only for containers/hosting (the Dockerfile sets `0.0.0.0`, `3000`) |
| `MEDIA_LOCAL_DIR` | | `media-local` outside production | Development uploads stored on disk and served at `/media/` when S3 is not configured |
| `PUBLIC_BASE_URL` | | from the request | Public origin used in local upload URLs |

`.env.example` lists them with comments. Real secrets never go in the repository: locally they live in
`.env` (git-ignored), in production in SSM Parameter Store.

## Tests

```bash
npm test          # 73 end-to-end tests in 10 files, ~1.5 minutes; first run downloads a MongoDB binary (~100 MB)
npm run typecheck
npm run lint
```

The tests start the real app on a random port against an in-memory MongoDB replica set and cover the
spec's sequence diagrams (4.6) plus the business rules:

| File | Covers |
|---|---|
| `map.e2e-spec.ts` | SEQ-01 nearby map, SEQ-02 Ghost Mode (location deleted + `location:hide` over the socket), friends-only and close-friends audience, time-limited sharing, stale-location filter, blocks, 15-min TTL index, one location per user, under-16 consent, radius queries with known points, search by distance |
| `events.e2e-spec.ts` | SEQ-03 create (validation, 422 banned word saves nothing, idempotency key, 6th active event 409 incl. concurrent creates), SEQ-04 join → host notified by socket, duplicate 409, non-host 403, approve → chat member, FULL at max, leave/kick release seats, cancel, blocked-by-host 403, close-friends visibility, ENDED job |
| `moderation.e2e-spec.ts` | SEQ-05 one report per user, own content 400, 3rd distinct report hides the post, admin 403 for users, queue order, REMOVE_WARN in one transaction with an audit entry and owner notification, second admin gets 409, DISMISS restores, event auto-hide + REMOVE_SUSPEND blocks login, shop pre-moderation and flash deals |
| `auth.e2e-spec.ts` | register/login, 5-per-15-min rate limit per account and IP, refresh rotation, Google first sign-in, change password, suspended accounts, account deletion |
| `abuse.e2e-spec.ts`, `extras.e2e-spec.ts`, `coverage.e2e-spec.ts` | rate limits and IP blocks, sign-up e-mail verification, password reset, admin login, remaining routes |
| `openapi.e2e-spec.ts`, `postman.e2e-spec.ts` | every route matches `docs/openapi.yaml` and the Postman collection |
| `social.e2e-spec.ts` | friend requests, direct chat over the socket, idempotent send, blocked messaging, feed paging (20 + cursor), 500-char and 4-photo limits, likes/comments/saves, notification settings, device tokens |

## Deploy

Step-by-step guide: **[docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md)** (EC2 t3.micro + Elastic IP + free
Let's Encrypt HTTPS via Caddy + ECR + SSM Parameter Store + S3/CloudFront + MongoDB Atlas M0;
≈ $0/month inside the free tier, ≈ $15/month after). After that, every release is:

```powershell
powershell -ExecutionPolicy Bypass -File zenzy_backend\deploy\aws\deploy.ps1
```

The Android app's base URL is then `https://<your-domain>/v1/` and the Socket.IO URL `https://<your-domain>`.

## Decisions where the spec left room

- **Live pin** = an event created without `start_time` (it starts now and needs an `end_time`).
- **Active event (BR-02)** = status OPEN or FULL and `end_time` in the future.
- **FOLLOWING feed** = posts of accepted friends (the data model has no follow relation).
- **`precise: false`** stores the position rounded to about 1 km instead of the exact point.
- **Report thresholds (BR-03)** count distinct users with *open* reports; after an admin dismisses,
  counting starts again. Shops have no HIDDEN status in the ERD, so a `hidden` flag is used; an admin
  REMOVE on a shop sets it REJECTED with the reason. Reported **user profiles** are never auto-hidden;
  REMOVE on a profile clears its display name, bio and avatar.
- **Group chats** (listed in 5.3.8) may only include the creator's friends.
- **Account deletion** runs immediately inside one transaction, then deletes the S3 objects
  (well within NFR-10's 72 hours); the endpoint still answers `202` as specified.
- **Re-joining**: after cancelling or leaving, a user may request again (same document, back to
  PENDING); after REJECTED or KICKED, no.

## Beyond the spec

- **Password reset and sign-up e-mail verification** (`/auth/password/forgot`, `/auth/register/verify`): the spec
  lists password reset as out of scope. Codes go out by SMTP (logged and returned as `dev_code` when SMTP is
  not configured).
- **Admin dashboard** (spec 4.1): a static page served at `/admin/` that calls this same API with an admin token.
- **Abuse protection** beyond the login limit: per-route rate limits, temporary IP blocks, admin alert e-mails.
- **OpenAPI + Postman** generated and checked by tests; Docker + AWS deploy scripts.

## Not implemented, and why

- **Address/place search** in UC-04: done by the map provider on the client (spec 4.1); `/search` covers shops and events.
- **DB-level insert-only user for `admin_audit_log`** (marked [verify] in 5.1): the API never updates or
  deletes it (no route exists); a restricted Atlas database role is a manual Atlas step and Atlas M0 may not
  support custom roles.
- **Socket.IO shared adapter** for several instances (4.8 [verify]): not needed for one instance / 50 users.
- **Load and latency tests** for NFR-01 to NFR-04 and NFR-12, uptime (NFR-11): need the deployed system.
- **Not exercised against the real services** (no credentials here): Google token verification, FCM push and
  S3 signed uploads are implemented with the official libraries, but the tests replace Google with a fake and
  run with push and uploads switched off.

## Open questions

1. **NFR-20 guardian consent**: implemented as a self-declared flag (`PUT /me/guardian-consent`) that unlocks
   location sharing for users under 16. The spec marks the legal rule as to be verified; a real check of the
   guardian may be required.
2. **NFR-10 vs BR-07**: deleting an account removes all personal data, but insert-only audit entries keep the
   deleted user's ID and the admin's reason. Is that acceptable, or must they be anonymised?
3. **NFR-16 retention**: the audit log has no expiry (kept ≥ 12 months as required). Should it be deleted after 12 months?
4. **NFR-08 per-IP limit**: 5 failed logins per IP per 15 minutes can lock out many students sharing one
   campus or mobile-carrier IP. Implemented as written; consider raising the per-IP limit.
5. **Event pushes** (`event:created/updated`) go to every connected user allowed to see the event, not only
   those within 5 km; the app filters by its viewport. A distance filter needs each viewer's position, which
   users who do not share location never send.
6. Spec 1.1/3.2 describe a **Flutter** app with **Google Maps** (`zenzy_frontend/` in this repository). The
   API does not depend on the client framework or the map provider.
