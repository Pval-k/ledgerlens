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
| 10 | **API layout:** split Nest `apps/api/src` into **`health/`**, **`documents/`**, **`prisma/`**, **`queue/`**, **`storage/`** feature + infra modules (same HTTP routes) |
| 11 | **Worker TS gotchas documented + fixes:** `prisma.transaction` delegate vs `$transaction`, adapter typings, **`LedgerTransactionDelegate`**, **`pnpm run generate`** in worker |
| 12 | **Stage 6 — materialized analytics:** `DocumentMonthlySummary` + `CategoryMonthlySummary` tables; worker **`rebuildDocumentSummaries`** after successful ingest; **`GET /documents/:id/analytics/monthly`** and **`GET /documents/:id/analytics/by-category`** (filters + pagination) |
| 13 | **Web app (Vite + React):** upload flow, document list/detail, **Recharts** monthly + category charts, paginated transactions; API **CORS**; root **`pnpm` overrides** so **`@types/react@18`** matches React 18 (avoids JSX typing clashes with React 19 types pulled in by other workspace packages) |
| 14 | **Web dev ergonomics:** Vite **`/api` proxy** to **`127.0.0.1:3000`** (same-origin JSON calls in dev, no CORS); default **`apiBase`** is **`/api`** when **`VITE_API_URL`** unset in dev; **`fetch`** network errors append a hint to start **`pnpm dev:api`** |
| 15 | **Nest + IDE in a pnpm monorepo:** root **`.npmrc`** **`public-hoist-pattern[]=@nestjs/*`** so **`@nestjs/*`** appears under the **workspace** `node_modules` (helps TypeScript when the editor opens the repo root); **`apps/api/tsconfig.json`** explicit **`include`** / **`exclude`**; **`.vscode/settings.json`** sets **`typescript.tsdk`** to **`apps/api/node_modules/typescript/lib`** |

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

**Fix:** In `documents.controller.ts`, `UploadSessionBody` is imported as `import type { UploadSessionBody } from './documents.service'` so the compiler does not emit runtime imports for a type-only symbol.

### Prisma client on `PrismaService`: sometimes the IDE disagrees with reality

**Symptom:** A linter claimed `this.prisma.document` “does not exist” on `PrismaService` even though `PrismaService` extends `PrismaClient` (which **does** have `document`).

**Fix we used:** A small explicit helper `updateDocumentObjectMetadata` on `PrismaService` so updates go through one place and tooling stays happy.

**Lesson:** If Prisma types look wrong, run **`pnpm exec prisma generate`** from `apps/api` after schema changes; the client is generated code.

### Prisma + new fields (`ingestError` on `Document`): stale client vs. inference

**Symptom:** After adding **`ingestError`** to `Document`, TypeScript or the IDE still treated `getDocumentStatus` as if **`document.ingestError` did not exist** — even though `schema.prisma` was correct and **`pnpm exec tsc`** could pass once the generated client was fresh.

**Why it happens:** `@prisma/client` is **generated** from the schema. Until you regenerate, types lag. Separately, **`findUnique` with `include`** can produce return types that are easy for the language service to infer **too narrowly**, so new scalars sometimes look “missing” in `documents.service.ts`.

**Fix we used:**

1. Always run **`pnpm exec prisma generate`** (from `apps/api`, or `pnpm --filter @ledgerlens/api exec prisma generate`) after any **`schema.prisma`** change.
2. For status queries, use an explicit **`select`** that lists **`ingestError`** (and other fields you need), not only `include: { _count: … }`.
3. Export a **`DocumentWithTransactionCount`** type via **`Prisma.DocumentGetPayload<{ select: … }>`** in `prisma/prisma.service.ts` and use it in **`getDocumentStatus`** so `ingestError` is part of the **public type contract**.

**Lesson:** Treat “Prisma types are wrong” as “regenerate first,” then tighten queries with **`select` + `DocumentGetPayload`** if inference is still noisy.

### Monorepo + pnpm: store path warnings

**Symptom:** `ERR_PNPM_UNEXPECTED_STORE` when `pnpm add` runs in an environment whose store path differs from the machine that originally installed `node_modules`.

**Fix:** Re-run `pnpm install` (or align `store-dir`) on that machine; use a consistent pnpm version.

### Web (Vite): document list showed a network / “load failed” error

**Symptom:** The home page could not **`fetch`** **`GET /documents`** — red error state instead of the list.

**Why:** The SPA on **`localhost:5173`** was calling the API on **`localhost:3000`**. That is **cross-origin**; **`Failed to fetch`** happens if the API is not listening, or if CORS / environment quirks block the response. Beginners often had the API stopped or assumed same “localhost” meant same security context (it does not — different ports = different origins).

**Fix we used:** A **Vite dev proxy** — browser calls **`/api/...`** on the dev server; Vite forwards to **`http://127.0.0.1:3000/...`**. The client defaults to **`apiBase = /api`** in dev when **`VITE_API_URL`** is unset. **`pnpm dev:api`** must still be running. **`fetch`** failures now append a short hint in the error text.

**Lesson:** For local SPAs, a proxy or consistent **`VITE_API_URL`** + working CORS beats “it works in curl” confusion.

### Monorepo + pnpm: IDE says “Cannot find module '@nestjs/core'” (even though `nest build` works)

**Symptom:** Cursor / VS Code shows a red squiggle on **`import { NestFactory } from '@nestjs/core'`** in **`apps/api/src/main.ts`**, or similar for other **`@nestjs/*`** imports.

**Why:** **pnpm** installs packages in a content-addressed store and symlinks them per package. **`@nestjs/core`** might exist only under **`apps/api/node_modules`**, while the TypeScript language service often treats the **repository root** as the project context. With no **`@nestjs/core`** symlink at the **root** `node_modules`, module resolution fails in the IDE even though **`pnpm --filter @ledgerlens/api build`** succeeds.

**Fix we used:**

1. **Root `.npmrc`** — **`public-hoist-pattern[]=@nestjs/*`** so **`@nestjs/*`** is also linked at the workspace **`node_modules/@nestjs/`** (run **`pnpm install`** after changing `.npmrc`).
2. **`apps/api/tsconfig.json`** — **`include`**: **`src/**/*.ts`**, **`test/**/*.ts`**; **`exclude`**: **`node_modules`**, **`dist`**.
3. **`.vscode/settings.json`** — **`"typescript.tsdk": "apps/api/node_modules/typescript/lib"`** so the editor uses the same **TypeScript** as the API package (path is workspace-relative).

**After pulling these changes or reinstalling:** open the Command Palette (**`Cmd+Shift+P`** on macOS, **`Ctrl+Shift+P`** on Windows/Linux) → run **`TypeScript: Restart TS Server`**, or **`Developer: Reload Window`**, so the language service reloads **`node_modules`** and **`typescript.tsdk`**.

### BullMQ jobs: old payloads in Redis

**Symptom:** After adding `storageKey` to the job payload, **old** jobs might only have `documentId`.

**Fix in worker:** Treat `storageKey` as optional on the job; fall back to `document.storageKey` from Postgres, and still **reject** if a job supplies a key that does not match the row.

### CSV format and money precision

**What we chose:** `amount` is stored as `Decimal(19,4)` in Postgres via Prisma — avoids floating-point money bugs.

**Parser:** `csv-parse` in the worker; required header aliases include **`date`** and **`amount`** (see `apps/worker/src/parse-csv.ts` for full alias lists). Optional: `description`, `category`, `currency`.

**Large files:** `createMany` is chunked (2000 rows per batch) inside one DB transaction so we stay under Postgres parameter limits.

**Re-runs:** Before insert, the worker **`deleteMany` transactions for that `documentId`** so a retry does not duplicate rows.

### Worker + `@prisma/adapter-pg`: `prisma.transaction` vs `$transaction`, and `ingestError` in updates

**Symptom:** TypeScript / the IDE says **`prisma.transaction` does not exist** (it suggests **`$transaction`**), or **`ingestError`** is not a valid field on **`DocumentUpdateInput`** — even though **`schema.prisma`** is correct and the code runs after **`prisma generate`**.

**Why it happens:**

1. **Name collision:** The Prisma **model** is called **`Transaction`**, so the client exposes a delegate **`prisma.transaction`** (CRUD for that model). That is **not** the same as **`$transaction`** (the transactional batch API). Tools often confuse the two.
2. **Interactive transactions:** Inside **`$transaction(async (tx) => { … })`**, typings for **`tx.transaction`** are easy to get wrong for the same reason.
3. **Driver adapter:** With **`@prisma/adapter-pg`**, generated types for **`PrismaClient` sometimes omit the `.transaction` delegate** even though it exists at runtime.
4. **Stale client / IDE:** If **`@prisma/client`** was not regenerated after adding **`ingestError`**, **`DocumentUpdateInput`** may not list it until you run generate and refresh the TS server.

**Fix we used:**

1. Prefer **array** **`prisma.$transaction([ … ])`** for the CSV ingest batch (delete many → chunked create many → update document), instead of an interactive callback, so you are not fighting **`tx`** typing.
2. Add a small explicit type (**`LedgerTransactionDelegate`**) and cast **`prisma` → `{ transaction: LedgerTransactionDelegate }`** when calling **`deleteMany` / `createMany`** on the **`Transaction`** table.
3. For **`ingestError`** on **`document.update`**, use **`as Prisma.DocumentUpdateInput`** on the **`data`** object where the IDE still lags.
4. In **`apps/worker/package.json`**, add **`"generate": "prisma generate --schema=../api/prisma/schema.prisma"`** and a **`prisma`** dev dependency so you can run **`pnpm --filter @ledgerlens/worker run generate`** after any **`apps/api/prisma/schema.prisma`** change (same generated client the API uses).

**Lesson:** **`prisma.transaction`** = model delegate; **`$transaction`** = transactional wrapper — different symbols. After schema edits, **generate** from **API or worker** script and, if needed, **cast** adapter + **`ingestError`** until types and IDE match.

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

- `apps/api/src/prisma/prisma.service.ts` *(was `src/prisma.service.ts` before Phase 10)*

Purpose:

- Connect NestJS to the database

Current behavior:

- Extends `PrismaClient`
- Connects automatically on app startup using `$connect()`

#### 8) PrismaModule registered in AppModule

File:

- `apps/api/src/app.module.ts` imports **`PrismaModule`** (`apps/api/src/prisma/prisma.module.ts`), which provides **`PrismaService`** globally (`@Global()`).

This makes DB access available through Nest dependency injection.

---

### Phase 4 - Document API (Basic CRUD → evolved into upload API)

#### 9) Documents service (business logic layer)

File:

- `apps/api/src/documents/documents.service.ts` *(older docs referred to `app.service.ts` before Phase 10)*

Uses `PrismaService` for DB interactions.

Methods (current):

- `listDocuments()`
- `createUploadSession(body)` — DB row + presigned PUT URL
- `completeUpload(documentId)` — `HeadObject`, persist size/type, enqueue job
- `getDocumentStatus(documentId)`

*(Earlier iterations included `createDocument` and `enqueueDocument` without object storage; those were replaced when MinIO/S3 became real — see “Bugs, gotchas” above.)*

#### 10) HTTP layer (documents + health)

Files:

- `apps/api/src/documents/documents.controller.ts` — document routes below
- `apps/api/src/health/health.controller.ts` — `GET /` hello *(split out in Phase 10)*

Endpoints (current):

- `GET /` — health/hello (`HealthController`)
- `GET /documents` (list documents)
- `POST /documents/upload-session` (presigned upload)
- `POST /documents/:id/complete-upload` (after client PUT to MinIO/S3)
- `GET /documents/:id/status`
- `GET /documents/:id/transactions` (paginated; added in Stage 5)
- `GET /documents/:id/analytics/monthly` — materialized monthly rollups (`from` / `to` `YYYY-MM`, `page`, `limit`; Stage 6)
- `GET /documents/:id/analytics/by-category` — per-category monthly slices (optional `category`; Stage 6)

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

## Phase 10 — Nest API feature modules (before Stage 6)

### What we did

- Replaced a single flat `src/app.controller.ts` + `src/app.service.ts` with:
  - **`src/health/`** — `HealthModule` + `HealthController` → `GET /`
  - **`src/documents/`** — `DocumentsModule` + `DocumentsController` + `DocumentsService` + `filename.util.ts` → all `/documents/*` routes
  - **`src/prisma/`** — `PrismaModule` (`@Global`) + `PrismaService` (exports `DocumentWithTransactionCount` type)
  - **`src/queue/`** — `QueueModule` + `QueueService` + `queue.constants.ts`
  - **`src/storage/`** — `StorageModule` + `StorageService`
- **`src/app.module.ts`** only **imports** these modules (no business logic in the root module).
- Unit test moved to **`health.controller.spec.ts`**; e2e sets **`DATABASE_URL`** / **`REDIS_URL`** defaults and **`afterEach`** closes the app.

### Why

- **Beginner-friendly navigation** and a clear place for feature modules (Stage 6 added **`analytics/`** — see Phase 11).

### Docs

- See [`docs/repo-layout.md`](repo-layout.md) for the full map.

---

## Phase 11 — Materialized summaries + analytics API (Stage 6)

### What we added

- **Prisma models** — **`DocumentMonthlySummary`** (per document, UTC `YYYY-MM`, currency): net, income total, expense total (positive magnitude of outflows), transaction count. **`CategoryMonthlySummary`** adds **`categoryKey`** (empty string = uncategorized). Unique constraints prevent duplicate buckets; **`onDelete: Cascade`** from **`Document`**.
- **Worker** — after the ingest **`$transaction`** commits, **`rebuildDocumentSummaries`** deletes prior summary rows for that document, aggregates from **`Transaction`**, then batched **`createMany`**. Keys split on **`|`** only between fixed segments (`yearMonth|currency` and `yearMonth|currency|categoryKey`) so values with **`|`** in category are handled when parsing keys back out.
- **API** — **`AnalyticsModule`** (`apps/api/src/analytics/`): **`GET /documents/:id/analytics/monthly`** and **`GET /documents/:id/analytics/by-category`** with optional **`from`** / **`to`** (`YYYY-MM`), **`page`** / **`limit`** (≤ 100), and on the category route optional **`category`** (omit = all categories; empty = uncategorized only). **`404`** if the document does not exist; **`400`** for bad month strings or **`from` > `to`**. Decimal fields are JSON **strings** (same idea as **`GET /documents/:id/transactions`**).

### Migration

- `apps/api/prisma/migrations/20260322120000_add_analytics_summaries/`

---

## Phase 12 — Web UI (upload, explorer, charts)

### What we added

- **`apps/web`** — **Vite 6** + **React 18** + **react-router-dom** + **Recharts**; **`pnpm dev`** / **`pnpm build`**; optional **`VITE_API_URL`** for production builds.
- **Upload** — `POST /documents/upload-session` → `PUT` presigned URL → `POST /documents/:id/complete-upload`; navigate to the document with **location state** carrying the filename for the header.
- **Document detail** — Polls **`GET /documents/:id/status`** until **`COMPLETED`** or **`FAILED`**; then loads analytics + transactions.
- **Charts** — Monthly grouped bars (income vs expense) from **`/analytics/monthly`**; horizontal bars for **category expense** totals aggregated client-side from **`/analytics/by-category`** (up to 500 rows).
- **API** — **`enableCors`** in **`main.ts`** (optional **`CORS_ORIGIN`** comma-separated list). Still useful when the browser talks to the API **directly** (e.g. `vite build` with a full **`VITE_API_URL`**, or tools other than the dev proxy).
- **Monorepo** — Root **`pnpm.overrides`** pin **`@types/react`** / **`@types/react-dom`** to v18 so `tsc` and JSX match **`react@18`** in `apps/web`.

### Dev proxy (why `GET /documents` stopped failing in the browser)

**Symptom:** The home page showed errors when loading the document list — the UI was calling **`http://localhost:3000`** from the **Vite** origin (**`http://localhost:5173`**). That is **cross-origin**; if the API was down, bound differently, or CORS was finicky, **`fetch`** failed with a network error.

**Fix:** In `apps/web/vite.config.ts`, **`server.proxy`** and **`preview.proxy`** forward **`/api/*`** → **`http://127.0.0.1:3000/*`** (path rewritten to strip the **`/api`** prefix). The API client (`apps/web/src/api/client.ts`) uses **`apiBase()` = `/api`** in dev when **`VITE_API_URL`** is not set, so JSON requests are **same-origin** with the Vite dev server and **do not rely on CORS** for local development. Presigned **PUT** uploads still go **directly** to MinIO/S3 (unchanged).

**Docs:** `apps/web/README.md` and **`.env.example`** explain: leave **`VITE_API_URL`** unset for **`pnpm dev`**; set it for production builds.

### Nest + editor: pick up `node_modules` and `typescript.tsdk`

See the **Monorepo + pnpm: IDE says “Cannot find module '@nestjs/core'”** subsection above. Quick refresh: Command Palette → **`TypeScript: Restart TS Server`** or **`Developer: Reload Window`**.

---

## Current Summary

Implemented so far:

- **Web UI** (`apps/web`): Vite + React — upload, list, document view with charts + transaction table; **dev proxy** (`/api` → Nest on port 3000) for reliable local API calls
- **Tooling:** pnpm **`public-hoist-pattern`** for **`@nestjs/*`**, **`.vscode/settings.json`** **`typescript.tsdk`**, and **restart TS server** after install so the IDE matches **`nest build`**
- Running backend service (NestJS) with **feature modules** (`health`, `documents`, `analytics`, `prisma`, `queue`, `storage`)
- Postgres schema and migrations via Prisma (documents + **transactions** + **summary tables**)
- Presigned direct-to-**MinIO** upload flow (same pattern will work for **AWS S3**) + completion endpoint
- Redis-backed queue in API
- Worker: download from storage → **parse CSV** → persist normalized transactions → **rebuild materialized summaries** (see **“Worker + @prisma/adapter-pg”** above for TS notes + **`worker run generate`**)
- Read API: **paginated transactions** per document; **analytics** monthly and by-category rollups with filters
- Async processing pipeline with status tracking and **structured ingest errors**

---

## Where to add the next chapter

Next natural step: **auth** so documents belong to users, richer **dashboard UI** in `apps/web`, and/or **anomaly / rules** on top of the same summary tables. Add a **new phase** here when you ship it — progress stays **additive**.
