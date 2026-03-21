# LedgerLens — Progress (build diary)

This file is the **progress log** for the project: how the program was built, **in order**, what we chose at each step, and **bugs or confusion we hit** (including “stupid” ones) and how we fixed them.

It is meant for **beginners**: names of tools, files, and concepts are spelled out on purpose. Nothing here replaces the code; it explains **why** the repo looks the way it does.

**We do not delete history.** When something changes (routes, schema, storage vendor), the old story stays in this doc so you can see the path we took.

---

## How this relates to other docs

- **[`architecture.md`](architecture.md)** — current responsibilities, data stores, high-level diagrams (living design note).
- **This file (`progress.md`)** — chronological and narrative: what we did, what broke, what we learned.

---

## Storage: we started with MinIO on purpose

**What we use in development:** [MinIO](https://min.io/) runs locally (often via Docker) and speaks the **same API as Amazon S3**. The app uses the AWS SDK in “S3 mode” with `S3_ENDPOINT` pointed at MinIO.

**Why not AWS from day one?**

- No AWS account or bill required to develop.
- Same code path as production S3: presigned PUT, `HeadObject`, `GetObject`, bucket name, keys, credentials env vars.

**Where we are headed (not a rewrite):** we will **point the same `S3_*` configuration at real AWS S3** (and turn off path-style if needed). MinIO stays part of the story: we **learned the pipeline on MinIO first**; that is intentional and stays documented here.

---

## Quick timeline (names only)

| Order | What happened |
| ----- | ---------------- |
| 1 | NestJS API scaffold in `apps/api` |
| 2 | Env vars + Docker-style local deps (Postgres, Redis, **MinIO**) |
| 3 | Prisma + first **`Document`** model in Postgres |
| 4 | `PrismaService` wired into Nest |
| 5 | First document HTTP API (list / create) — **later superseded** by upload flow (see below) |
| 6 | Redis + BullMQ queue in API; **`INGEST_DOCUMENT`** job |
| 7 | Worker app pulls jobs, updates `Document.status` (first a **fake sleep**, then real **MinIO download**) |
| 8 | **Object storage integration:** `Document` gains `storageKey`, optional `contentType`, `sizeBytes`, `sha256`; presigned upload + worker reads file from storage |
| 9 | **CSV ingestion (Stage 5):** `Transaction` model, worker parses CSV → DB, `ingestError` on failure, `GET /documents/:id/transactions` |

---

## Bugs, gotchas, and how we fixed them

These are **real issues** that showed up while building this repo (or are typical of this stack). Names are specific so you can search the codebase.

### Prisma: the `Document` model grew over time (not a one-shot design)

**What happened:** The first schema was a small `Document` table: `id`, `originalFilename`, `status`, timestamps. That was correct for “prove Postgres + Prisma + Nest.”

**What we added later:** Fields for real uploads and the worker:

- `storageKey` — unique object key in MinIO/S3 (e.g. `documents/<id>/<safe-filename>`).
- `contentType`, `sizeBytes` — metadata (filled from `HeadObject` after upload when available).
- `sha256` — optional; reserved for **idempotency / deduplication** later.

**Migration awkwardness:** You cannot flip `storageKey` to “required” in one step if old rows exist with `NULL`. We used a pattern: add nullable column → **backfill** legacy rows (e.g. `legacy/<id>/<filename>`) → then `NOT NULL`. See migrations under `apps/api/prisma/migrations/`.

**Lesson:** In Prisma/Postgres, **schema evolution** is normal; migrations are how you avoid losing data.

### HTTP API: routes were replaced, not forgotten

**Older shape (superseded, but this is how we started):**

- `POST /documents` with `{ "originalFilename": "..." }` — created a row only.
- `POST /documents/:id/process` — enqueued ingestion **without** a real file in object storage (fine for a stub, wrong for production).

**Current shape (object storage is real):**

- `POST /documents/upload-session` — creates the row **with** `storageKey`, returns a **presigned PUT URL** for MinIO/S3.
- Client **PUTs** the file to that URL.
- `POST /documents/:id/complete-upload` — API **HeadObject**s the key, updates size/type, **then** enqueues the job with `{ documentId, storageKey }`.
- `GET /documents/:id/status` — status plus metadata when set.

**Lesson:** The “stupid” bug class here is **enqueueing work before a file exists**. The completion endpoint exists to close that gap.

### TypeScript + NestJS: `import type` and decorators

**Symptom:** Build error like: a type used in a **decorated** parameter (`@Body() body: SomeType`) must be imported with `import type` when `isolatedModules` and `emitDecoratorMetadata` are on.

**Fix:** In `app.controller.ts`, `UploadSessionBody` is imported as `import type { UploadSessionBody } from './app.service'` so the compiler does not emit runtime imports for a type-only symbol.

### Prisma client on `PrismaService`: sometimes the IDE disagrees with reality

**Symptom:** A linter claimed `this.prisma.document` “does not exist” on `PrismaService` even though `PrismaService` extends `PrismaClient` (which **does** have `document`).

**Fix we used:** A small explicit helper `updateDocumentObjectMetadata` on `PrismaService` so updates go through one place and tooling stays happy.

**Lesson:** If Prisma types look wrong, run **`pnpm exec prisma generate`** from `apps/api` after schema changes; the client is generated code.

### Prisma + new fields (`ingestError` on `Document`): stale client vs. inference

**Symptom:** After adding **`ingestError`** to `Document`, TypeScript or the IDE still treated `getDocumentStatus` as if **`document.ingestError` did not exist** — even though `schema.prisma` was correct and **`pnpm exec tsc`** could pass once the generated client was fresh.

**Why it happens:** `@prisma/client` is **generated** from the schema. Until you regenerate, types lag. Separately, **`findUnique` with `include`** can produce return types that are easy for the language service to infer **too narrowly**, so new scalars sometimes look “missing” in `app.service.ts`.

**Fix we used:**

1. Always run **`pnpm exec prisma generate`** (from `apps/api`, or `pnpm --filter @ledgerlens/api exec prisma generate`) after any **`schema.prisma`** change.
2. For status queries, use an explicit **`select`** that lists **`ingestError`** (and other fields you need), not only `include: { _count: … }`.
3. Export a **`DocumentWithTransactionCount`** type via **`Prisma.DocumentGetPayload<{ select: … }>`** in `prisma.service.ts` and use it in **`getDocumentStatus`** so `ingestError` is part of the **public type contract**.

**Lesson:** Treat “Prisma types are wrong” as “regenerate first,” then tighten queries with **`select` + `DocumentGetPayload`** if inference is still noisy.

### Monorepo + pnpm: store path warnings

**Symptom:** `ERR_PNPM_UNEXPECTED_STORE` when `pnpm add` runs in an environment whose store path differs from the machine that originally installed `node_modules`.

**Fix:** Re-run `pnpm install` (or align `store-dir`) on that machine; use a consistent pnpm version.

### BullMQ jobs: old payloads in Redis

**Symptom:** After adding `storageKey` to the job payload, **old** jobs might only have `documentId`.

**Fix in worker:** Treat `storageKey` as optional on the job; fall back to `document.storageKey` from Postgres, and still **reject** if a job supplies a key that does not match the row.

### CSV format and money precision

**What we chose:** `amount` is stored as `Decimal(19,4)` in Postgres via Prisma — avoids floating-point money bugs.

**Parser:** `csv-parse` in the worker; required header aliases include **`date`** and **`amount`** (see `apps/worker/src/parse-csv.ts` for full alias lists). Optional: `description`, `category`, `currency`.

**Large files:** `createMany` is chunked (2000 rows per batch) inside one DB transaction so we stay under Postgres parameter limits.

**Re-runs:** Before insert, the worker **`deleteMany` transactions for that `documentId`** so a retry does not duplicate rows.

---

## Historical note: `Document` field list by era

**Era A — init migration only**

- `id`, `originalFilename`, `status`, `createdAt`, `updatedAt`

**Era B — object storage fields**

- Everything in Era A, plus `storageKey` (unique), optional `contentType`, `sizeBytes`, `sha256`

**Era C — ingestion outcomes**

- Optional `ingestError` (worker sets on failure, clears on success)
- New table **`Transaction`** linked to `Document` (`onDelete: Cascade`)

---

## Detailed build log (phases)

The sections below are the **step-by-step record** of what was implemented. They are kept so beginners can follow the same path.

### Phase 1 - Backend Foundation

#### 1) Backend scaffolded via NestJS CLI

Created the API server structure in `apps/api` using NestJS.

Includes:

- Entry point (`main.ts`)
- App module
- Controller and service templates
- TypeScript configuration
- Build scripts

This is the base server that handles HTTP requests.

#### 2) Environment variables configured

Created environment configuration in `apps/api/.env` and `apps/api/.env.example`.

Configured `dotenv` in `apps/api/src/main.ts` so environment variables load at startup.

Used for:

- Database URL
- Redis URL
- Storage configuration

#### 3) Local infrastructure running via Docker

Three containers are running to simulate production services locally:

##### Postgres - relational database

Stores application data.

`ledgerlens-postgres`

##### Redis - queue and cache layer

Used for background jobs.

`ledgerlens-redis`

##### MinIO - S3-compatible object storage

Local replacement for AWS S3. **We still document MinIO here on purpose** — it is how local dev works today; production can be AWS S3 with the same client code.

`ledgerlens-minio`

---

### Phase 2 - Database Setup with Prisma

#### 4) Prisma ORM installed and configured

Files created:

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma.config.ts`

Configured:

- Datasource to Postgres via `DATABASE_URL`
- Prisma client generation

Prisma is the database access layer.

#### 5) Initial database model defined

Created the first schema model: `Document`.

Fields (initial):

- `id` - unique identifier
- `originalFilename` - uploaded file name
- `status` - processing state
- `createdAt` - creation timestamp
- `updatedAt` - last update timestamp

*(Later phases add storage fields — see “Historical note” above.)*

#### 6) First database migration created and applied

Command used:

`pnpm prisma migrate dev --name init`

This:

- Created SQL migration files
- Generated Prisma client
- Applied schema to Postgres
- Created the `Document` table

---

### Phase 3 - Prisma Integration with NestJS

#### 7) PrismaService created

File:

- `apps/api/src/prisma.service.ts`

Purpose:

- Connect NestJS to the database

Current behavior:

- Extends `PrismaClient`
- Connects automatically on app startup using `$connect()`

#### 8) PrismaService registered in AppModule

File:

- `apps/api/src/app.module.ts`

Changes:

- Added `PrismaService` to providers

This makes DB access available through Nest dependency injection.

---

### Phase 4 - Document API (Basic CRUD → evolved into upload API)

#### 9) AppService updated (business logic layer)

File:

- `apps/api/src/app.service.ts`

Uses `PrismaService` for DB interactions.

Methods (current):

- `listDocuments()`
- `createUploadSession(body)` — DB row + presigned PUT URL
- `completeUpload(documentId)` — `HeadObject`, persist size/type, enqueue job
- `getDocumentStatus(documentId)`

*(Earlier iterations included `createDocument` and `enqueueDocument` without object storage; those were replaced when MinIO/S3 became real — see “Bugs, gotchas” above.)*

#### 10) AppController updated (HTTP layer)

File:

- `apps/api/src/app.controller.ts`

Endpoints (current):

- `GET /` (existing health/hello route)
- `GET /documents` (list documents)
- `POST /documents/upload-session` (presigned upload)
- `POST /documents/:id/complete-upload` (after client PUT to MinIO/S3)
- `GET /documents/:id/status`

Example request body for upload session:

```json
{
  "originalFilename": "file.csv",
  "contentType": "text/csv",
  "sizeBytes": 1024,
  "sha256": "optional-hex-for-later-idempotency"
}
```

#### 11) Prisma client generation standardized

In `schema.prisma`, generator is set to:

`provider = "prisma-client-js"`

This allows imports from:

`@prisma/client`

---

### Phase 5 - Build and Verification

Verified successfully:

- Prisma client generation
- TypeScript compilation
- Linting
- Database connectivity
- API document create/list flow (evolved into upload + complete flow)

Commands used:

- `pnpm prisma generate`
- `pnpm --filter @ledgerlens/api build`

---

### Phase 6 - Async Processing Pipeline (Redis + BullMQ)

#### 12) Queue system added in API

Installed dependencies in API:

- `bullmq`
- `ioredis`

Created:

- `apps/api/src/queue.constants.ts`
- `apps/api/src/queue.service.ts`

`QueueService` responsibilities:

- Connect to Redis using `REDIS_URL`
- Enqueue document processing jobs with payload `{ documentId, storageKey }`
- Use idempotent job IDs (`doc:<documentId>`)
- Configure retries and backoff

#### 13) Object storage (`StorageService`) and completion

- `apps/api/src/storage.service.ts` — AWS SDK v3 S3 client against **MinIO or S3** (same code)
- Ensures `S3_BUCKET` exists on first use (`HeadBucket` → `CreateBucket`), or create the bucket once in the MinIO console
- Presigned PUT URLs for direct client uploads
- `HeadObject` to validate uploads before enqueueing

#### 14) Status and metadata

API endpoints:

- `POST /documents/:id/complete-upload` — verify object, then enqueue `INGEST_DOCUMENT`
- `GET /documents/:id/status` — includes `storageKey`, `contentType`, `sizeBytes` when set

#### 15) PrismaService enhanced for status flow

Added helper methods:

- `createUploadSession(...)`
- `getDocumentById(id)`
- `updateDocumentStatus(id, status)`
- `updateDocumentObjectMetadata(...)` (after `HeadObject` on complete-upload)

`Document` includes `storageKey`, optional `contentType`, `sizeBytes`, `sha256`.

These support processing orchestration.

---

### Phase 7 - Worker Application

#### 16) Separate worker app scaffolded

Location:

- `apps/worker`

Purpose:

- Process jobs independently of the API server

Dependencies added:

- `bullmq`
- `ioredis`
- `dotenv`
- `@prisma/client`
- `@aws-sdk/client-s3` (to download from MinIO/S3)
- `typescript`
- `tsx`

Added:

- `apps/worker/tsconfig.json`
- worker build and dev scripts in `apps/worker/package.json`
- `apps/worker/.env.example` (mirrors `S3_*` expectations)

#### 17) Worker consumer implemented

File:

- `apps/worker/src/index.ts`

Behavior:

1. Connects to Redis queue
2. Listens for `INGEST_DOCUMENT` jobs (`documentId` + `storageKey`)
3. Loads `document` from Postgres and verifies `storageKey`
4. `GetObject` from MinIO/S3 into memory
5. Sets document status to `PROCESSING`
6. Placeholder sleep (CSV parse → transactions next)
7. On success, sets status to `COMPLETED`
8. On failure, sets status to `FAILED`

---

### Phase 8 - End-to-End Async Flow

System now supports this background pipeline:

`Upload session -> PUT to storage -> Complete upload -> Enqueue job -> Worker downloads & processes -> Status updates`

Status lifecycle:

`PENDING -> PROCESSING -> COMPLETED / FAILED`

---

## How to Run the Pipeline

From repo root, run both services.

### API server

`pnpm --filter @ledgerlens/api start:dev`

### Worker process

`pnpm --filter @ledgerlens/worker start:dev`

---

## End-to-End Test

1) Start MinIO (or S3) and set `S3_*` env vars (see `apps/api/.env.example`).

2) Upload session

- `POST /documents/upload-session` with `{ "originalFilename": "file.csv", "contentType": "text/csv" }`
- `PUT` the file bytes to the returned `uploadUrl` (include `Content-Type` if the session used one)

3) Complete and enqueue

- `POST /documents/<DOC_ID>/complete-upload`

4) Check status

- `GET /documents/<DOC_ID>/status` (includes `transactionCount`, `ingestError` when set)

5) List transactions

- `GET /documents/<DOC_ID>/transactions?page=1&limit=50`

Expected progression:

`PENDING -> PROCESSING -> COMPLETED`

Sample CSV for testing: [`docs/sample-transactions.csv`](sample-transactions.csv)

---

## Phase 9 — CSV ingestion (Stage 5)

### What we added

- **`Transaction` model** in Prisma: `postedAt`, `amount` (decimal), `currency`, optional `description` / `category`, `rowIndex`, FK to `Document`.
- **`ingestError`** on `Document` for human-readable failure messages from the worker.
- **Worker** (`apps/worker/src/parse-csv.ts` + `index.ts`): UTF-8 decode → `parseLedgerCsv` → transactional `deleteMany` + batched `createMany` → `COMPLETED` or `FAILED` + `ingestError`.
- **API** — `GET /documents/:id/transactions` with pagination (`page`, `limit` ≤ 100).

### Migration

- `apps/api/prisma/migrations/20260321120000_add_transactions/`

---

## Current Summary

Implemented so far:

- Running backend service (NestJS)
- Postgres schema and migrations via Prisma (documents + **transactions**)
- Presigned direct-to-**MinIO** upload flow (same pattern will work for **AWS S3**) + completion endpoint
- Redis-backed queue in API
- Worker: download from storage → **parse CSV** → persist normalized transactions
- Read API: **paginated transactions** per document
- Async processing pipeline with status tracking and **structured ingest errors**

---

## Where to add the next chapter

Next natural step: **deterministic analytics** (monthly/category summaries, anomaly flags) and/or **auth** so documents belong to users. Add a **new phase** here when you ship it — progress stays **additive**.
