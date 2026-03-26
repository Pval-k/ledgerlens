# Interview Prep Guide (Beginner-Friendly, Detailed)

This document is intentionally detailed. Use it to explain LedgerLens in interviews and to teach yourself backend concepts while reviewing your own code.

---

## 1) Start Here: What this project is

LedgerLens is a multi-tenant financial document intelligence system:

1. User signs up / logs in.
2. User uploads a CSV using a presigned storage URL.
3. API enqueues ingestion work.
4. Worker parses + normalizes rows into database transactions.
5. Worker builds monthly/category summaries.
6. API serves secure analytics to that same user only.

---

## 2) Repo map and what each app does

```text
ledgerlens/
  apps/
    api/      # NestJS backend (HTTP routes + auth + orchestration)
    worker/   # BullMQ consumer (background ingestion + aggregation)
    web/      # React frontend
  docs/
```

- `apps/api` = request/response layer and system orchestration.
- `apps/worker` = heavy async processing.
- `apps/web` = user interface.

---

## 3) Core backend concepts (quick definitions)

### What is pnpm?

`pnpm` is the package manager used in this monorepo.  
You run filtered commands like:

- `pnpm --filter @ledgerlens/api build`
- `pnpm --filter @ledgerlens/worker build`

It is similar to npm/yarn, but optimized for workspace dependency management.

### What is Prisma?

Prisma is the ORM + schema/migration tool:

- `schema.prisma` defines models and relations.
- `migrations/*/migration.sql` are versioned schema-change scripts.
- PostgreSQL is the real database storing actual rows.

Important beginner point: `migration.sql` is not the database itself.

### What is an ORM?

ORM means **Object-Relational Mapping**.  
It is a layer that lets your app read/write SQL tables using typed code objects.

In LedgerLens:
- PostgreSQL is the real relational database.
- Prisma is the ORM that maps TS code to SQL queries.
- Example idea: instead of writing raw `INSERT INTO Transaction ...`, code calls Prisma methods like `createMany`.

### If `migration.sql` is not the database, then what is it?

`migration.sql` is a **versioned change script** (instructions), not stored data.

- Database = the running Postgres server + actual rows on disk.
- `migration.sql` = "how to change structure" (create table, add column, index, FK).
- Prisma migration history tracks which scripts were applied.

So:
- **Schema file** describes desired model.
- **Migration files** are steps to move DB structure.
- **Postgres instance** holds real user/doc/transaction data.

### What are E2E tests?

End-to-end tests hit real HTTP endpoints against the app wiring (and usually real infra like DB).  
In this project, e2e verifies things like auth and cross-user isolation.

---

## 4) NestJS structure: Module / Controller / Service

In Nest:

- **Module** = grouping + dependency wiring.
- **Controller** = HTTP endpoint definitions.
- **Service** = business logic.

In this codebase:

- `documents.module.ts` wires documents feature dependencies.
- `documents.controller.ts` defines `/documents/*` routes.
- `documents.service.ts` holds orchestration logic (storage + queue + DB).

---

## 5) `apps/api/src` folders explained

### `auth/`

Handles identity and sessions:
- signup/login
- JWT guard + strategy
- refresh token rotation/revocation
- change password + logout/logout-all

Key files:
- `auth.controller.ts` (routes)
- `auth.service.ts` (logic)
- `jwt.strategy.ts` (token validation)
- `jwt-auth.guard.ts` (route protection)
- DTO files under `auth/dto/*`

### `documents/`

Handles upload lifecycle and transaction list endpoints:
- create upload session
- complete upload
- status
- transactions
- delete

Key files:
- `documents.controller.ts`
- `documents.service.ts`

### `analytics/`

Read-only analytics endpoints backed by summary tables:
- monthly summaries
- category summaries
- insights stub

Key files:
- `analytics.controller.ts`
- `analytics.service.ts`

### `prisma/`

Database integration:
- Prisma client bootstrap
- helper query methods for common patterns
- Prisma exception filter (friendlier DB errors)

Key files:
- `prisma.service.ts`
- `prisma.module.ts`
- `prisma-client-exception.filter.ts`

### `queue/`

BullMQ producer side:
- enqueue ingestion jobs
- read queue counts for observability

Key files:
- `queue.service.ts`
- `queue.constants.ts`

### `storage/`

S3-compatible storage integration:
- presigned PUT URLs
- object metadata checks (`HeadObject`)
- deletes

Key files:
- `storage.service.ts`

### `health/`

Operational endpoints:
- liveness
- readiness (DB + queue reachability)
- simple metrics snapshot

Key files:
- `health.controller.ts`
- `health.service.ts`

### `idempotency/`

Retry safety for critical writes:
- replay previous response for same idempotency key + same payload
- reject collisions for mismatched payloads

Key files:
- `idempotency.service.ts`

### `generated/` under `apps/api/src`

This is generated Prisma client code output checked into source.  
It is not handwritten business logic; it exists so TypeScript has generated DB types and client helpers.

---

## 6) Prisma and migrations in this project

Main schema file:
- `apps/api/prisma/schema.prisma`

Important models:
- `User`
- `RefreshSession`
- `Document`
- `Transaction`
- `DocumentMonthlySummary`
- `CategoryMonthlySummary`

Migrations folder:
- `apps/api/prisma/migrations/`

Each migration is applied in order and tracked in DB history.

---

## 7) Full request flow (file-to-file)

## A) User opens app and signs up/logs in

Frontend:
- `apps/web/src/main.tsx` boots app
- `apps/web/src/App.tsx` routes to public auth pages
- `apps/web/src/api/client.ts` sends auth requests

Backend:
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.service.ts`

Auth output:
- access token (JWT)
- refresh token + session metadata

## B) User uploads CSV

1. Frontend requests `POST /documents/upload-session`.
2. API creates `Document` row and returns presigned URL.
   - controller: `documents.controller.ts`
   - logic: `documents.service.ts`
   - DB: `prisma.service.ts`
   - storage URL: `storage.service.ts`

3. Browser uploads file directly to storage URL.

4. Frontend calls `POST /documents/:id/complete-upload`.
5. API verifies object exists + size, then enqueues job.
   - queue: `queue.service.ts`

Accepted file type in practice:
- CSV text files (UTF-8 expected).
- Upload endpoint itself stores object metadata and does not hard-reject by MIME, but the worker parser expects CSV rows.
- Non-CSV content will fail during worker parsing and document status becomes `FAILED` with `ingestError`.

## C) Worker ingests and builds summaries

Worker entry:
- `apps/worker/src/index.ts`

What happens:
- pulls `INGEST_DOCUMENT` job from Redis queue
- downloads file from object storage
- parses CSV using `parse-csv.ts`
- writes `Transaction` rows to Postgres
- rebuilds summaries via `aggregate-summaries.ts`

What "parses + normalizes rows into transactions" means:
- **Parse** = convert CSV text cells to typed values (`Date`, decimal amount, strings).
- **Normalize** = map many possible column names into one standard shape.
  - date aliases: `date`, `posted_at`, `transaction_date`, `posting_date`, `post_date`
  - amount aliases: `amount`, `value`, `debit`, `credit`
  - optional aliases also exist for description/category/currency
- If `currency` is missing, it defaults to `USD`.
- If required fields are missing/invalid, worker fails the job and stores a readable error.

Required vs optional columns:
- Required headers (or aliases): date + amount
- Optional: description, category, currency
- Category is **not required**
- Month is **not required** (month is derived from transaction date during summary aggregation)

Summary generation is in:
- `apps/worker/src/aggregate-summaries.ts`

How summaries are computed:
- load all transactions for one document
- group by UTC `YYYY-MM` + currency for monthly table
- group by UTC `YYYY-MM` + currency + category for category table
- store net/income/expense/count aggregates
- replace old summary rows so recalculation is idempotent

This is how the API later serves fast analytics without expensive on-demand recompute.

## D) User reads analytics

API reads from materialized summary tables via:
- `apps/api/src/analytics/analytics.service.ts`
- routes in `analytics.controller.ts`

All reads are user-scoped (must own document).

---

## 8) Security model you should explain

- JWT access token for protected API routes
- Refresh session model with rotation and revocation
- Password hashing with bcrypt
- Per-user data scoping on documents/analytics
- Idempotency for retry-safe writes
- Request throttling (`@nestjs/throttler`)

---

## 9) Reliability and observability model

- Async queue architecture (API remains responsive)
- Worker retries/backoff (BullMQ)
- Structured request logs with request IDs
- Health endpoints:
  - `/health/live`
  - `/health/ready`
  - `/health/metrics`
- Worker queue/job metrics logs (processed, failed, retried, duration stats)

---

## 10) S3/MinIO and AWS interview clarification

LedgerLens uses AWS SDK S3 API in code.

- Local/dev usually points to MinIO (`S3_ENDPOINT=http://localhost:9000`)
- Same code path is AWS S3-ready by environment config

Accurate statement:
- “Implemented S3-compatible storage integration with AWS SDK; local MinIO profile and AWS S3-ready configuration.”

---

## 11) Practical commands

### Build

- `pnpm --filter @ledgerlens/api build`
- `pnpm --filter @ledgerlens/worker build`
- `pnpm --filter @ledgerlens/web build`

### Test

- `pnpm --filter @ledgerlens/api test`
- `pnpm --filter @ledgerlens/api test:e2e`

### Prisma

- `pnpm --filter @ledgerlens/api exec prisma migrate deploy`
- `pnpm --filter @ledgerlens/api exec prisma generate`

---

## 12) Interview questions + sample answers

### Q1: Why split API and worker?
**A:** It isolates long-running ingestion from request latency. API handles orchestration; worker handles CPU/IO-heavy parsing and aggregation. This improves responsiveness and scaling.

### Q2: How do summaries get generated?
**A:** Worker reads transactions for a document, groups by month/currency and month/currency/category, computes aggregate amounts/counts, then writes materialized summary tables. API analytics endpoints query those tables.

### Q3: What do controllers/modules/services mean in Nest?
**A:** Controllers expose routes, services hold business logic, modules wire dependencies and feature boundaries.

### Q4: How is multi-tenant isolation enforced?
**A:** Auth extracts user identity, then document and analytics queries include `userId` constraints. Unauthorized access to another user’s document returns not found.

### Q5: Why use idempotency?
**A:** Real clients retry. Idempotency avoids duplicate side effects on write endpoints and makes failures/retries safe.

### Q6: What is the difference between schema and migration?
**A:** `schema.prisma` is the data model definition; migrations are versioned SQL steps that apply model changes to the real Postgres database.

---

## 13) Complete API endpoint list (current)

Below is the full route catalog from controllers in `apps/api/src`.

### Public endpoints (no JWT required)

#### Health
- `GET /` — basic hello/liveness text
- `GET /health/live` — liveness check
- `GET /health/ready` — readiness check (DB + queue)
- `GET /health/metrics` — lightweight process + queue metrics snapshot

#### Auth
- `POST /auth/signup` — create account + issue access/refresh/session
  - body: `name`, `email`, `password`, `passwordConfirm`
- `POST /auth/login` — verify credentials + issue access/refresh/session
  - body: `email`, `password`
- `POST /auth/refresh` — rotate refresh token and issue new access token
  - body: `refreshToken`
- `POST /auth/logout` — revoke one refresh token/session
  - body: `refreshToken`

### Protected endpoints (JWT required)

#### Auth
- `GET /auth/me` — current user profile
- `POST /auth/change-password` — change password + revoke active refresh sessions
  - body: `currentPassword`, `newPassword`, `newPasswordConfirm`
- `POST /auth/logout-all` — revoke all active refresh sessions for user

#### Documents
- `GET /documents` — list current user documents
- `POST /documents/upload-session` — create doc row + return presigned PUT URL
  - body: `originalFilename?`, `contentType?`, `sizeBytes?`, `sha256?`
  - optional header: `Idempotency-Key`
- `POST /documents/:id/complete-upload` — verify object exists + enqueue ingest job
  - optional header: `Idempotency-Key`
- `GET /documents/:id/status` — document processing status + metadata + transaction count
- `GET /documents/:id/transactions` — paginated transactions (`page`, `limit`)
- `DELETE /documents/:id` — delete document + related rows + storage object (best effort on storage delete)

#### Analytics
- `GET /documents/:id/insights` — currently a planned/placeholder response
- `GET /documents/:id/analytics/monthly` — monthly rollups (`from`, `to`, `page`, `limit`)
- `GET /documents/:id/analytics/by-category` — category rollups (`from`, `to`, `category`, `page`, `limit`)

### Route summary count

- Public routes: **8**
- Protected routes: **12**
- Total routes: **20**

What "protected endpoint" means:
- A route behind JWT auth guard.
- Client must send `Authorization: Bearer <accessToken>`.
- If token is missing/invalid, API returns `401 Unauthorized`.
- For document-scoped routes, API also checks ownership via `userId` so one user cannot read another user's data.

---

## 14) CSV formats this project accepts

See `docs/csv-formats.md` for concrete ready-to-copy CSV examples:
- minimal required schema
- bank-style headers
- credit/debit style
- with/without category
- multi-currency example
