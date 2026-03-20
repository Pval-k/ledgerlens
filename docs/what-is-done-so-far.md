# LedgerLens - What Is Built So Far

This document tracks what has been implemented so far in a clear, step-by-step format.

## Phase 1 - Backend Foundation

### 1) Backend scaffolded via NestJS CLI

Created the API server structure in `apps/api` using NestJS.

Includes:
- Entry point (`main.ts`)
- App module
- Controller and service templates
- TypeScript configuration
- Build scripts

This is the base server that handles HTTP requests.

### 2) Environment variables configured

Created environment configuration in `apps/api/.env` and `apps/api/.env.example`.

Configured `dotenv` in `apps/api/src/main.ts` so environment variables load at startup.

Used for:
- Database URL
- Redis URL
- Storage configuration

### 3) Local infrastructure running via Docker

Three containers are running to simulate production services locally:

#### Postgres - relational database

Stores application data.

`ledgerlens-postgres`

#### Redis - queue and cache layer

Used for background jobs.

`ledgerlens-redis`

#### MinIO - S3-compatible object storage

Local replacement for AWS S3.

`ledgerlens-minio`

## Phase 2 - Database Setup with Prisma

### 4) Prisma ORM installed and configured

Files created:
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma.config.ts`

Configured:
- Datasource to Postgres via `DATABASE_URL`
- Prisma client generation

Prisma is the database access layer.

### 5) Initial database model defined

Created the first schema model: `Document`.

Fields:
- `id` - unique identifier
- `originalFilename` - uploaded file name
- `status` - processing state
- `createdAt` - creation timestamp
- `updatedAt` - last update timestamp

### 6) First database migration created and applied

Command used:

`pnpm prisma migrate dev --name init`

This:
- Created SQL migration files
- Generated Prisma client
- Applied schema to Postgres
- Created the `Document` table

## Phase 3 - Prisma Integration with NestJS

### 7) PrismaService created

File:
- `apps/api/src/prisma.service.ts`

Purpose:
- Connect NestJS to the database

Current behavior:
- Extends `PrismaClient`
- Connects automatically on app startup using `$connect()`

### 8) PrismaService registered in AppModule

File:
- `apps/api/src/app.module.ts`

Changes:
- Added `PrismaService` to providers

This makes DB access available through Nest dependency injection.

## Phase 4 - Document API (Basic CRUD)

### 9) AppService updated (business logic layer)

File:
- `apps/api/src/app.service.ts`

Uses `PrismaService` for DB interactions.

Added methods:
- `listDocuments()`
- `createDocument(originalFilename)`

### 10) AppController updated (HTTP layer)

File:
- `apps/api/src/app.controller.ts`

Endpoints:
- `GET /` (existing health/hello route)
- `GET /documents` (list documents)
- `POST /documents` (create document)

Example request body for create:

```json
{ "originalFilename": "file.csv" }
```

### 11) Prisma client generation standardized

In `schema.prisma`, generator is set to:

`provider = "prisma-client-js"`

This allows imports from:

`@prisma/client`

## Phase 5 - Build and Verification

Verified successfully:
- Prisma client generation
- TypeScript compilation
- Linting
- Database connectivity
- API document create/list flow

Commands used:
- `pnpm prisma generate`
- `pnpm --filter @ledgerlens/api build`

## Phase 6 - Async Processing Pipeline (Redis + BullMQ)

### 12) Queue system added in API

Installed dependencies in API:
- `bullmq`
- `ioredis`

Created:
- `apps/api/src/queue.constants.ts`
- `apps/api/src/queue.service.ts`

`QueueService` responsibilities:
- Connect to Redis using `REDIS_URL`
- Enqueue document processing jobs
- Use idempotent job IDs (`doc:<documentId>`)
- Configure retries and backoff

### 13) Processing endpoints added

New API endpoints:
- `POST /documents/:id/process` - enqueue an `INGEST_DOCUMENT` job
- `GET /documents/:id/status` - return current document status

### 14) PrismaService enhanced for status flow

Added helper methods:
- `getDocumentById(id)`
- `updateDocumentStatus(id, status)`

These support processing orchestration.

## Phase 7 - Worker Application

### 15) Separate worker app scaffolded

Location:
- `apps/worker`

Purpose:
- Process jobs independently of the API server

Dependencies added:
- `bullmq`
- `ioredis`
- `dotenv`
- `@prisma/client`
- `typescript`
- `tsx`

Added:
- `apps/worker/tsconfig.json`
- worker build and dev scripts in `apps/worker/package.json`

### 16) Worker consumer implemented

File:
- `apps/worker/src/index.ts`

Behavior:
1. Connects to Redis queue
2. Listens for `INGEST_DOCUMENT` jobs
3. Sets document status to `PROCESSING`
4. Simulates async work
5. On success, sets status to `COMPLETED`
6. On failure, sets status to `FAILED`

## Phase 8 - End-to-End Async Flow

System now supports this background pipeline:

`Create document -> Enqueue job -> Worker processes -> Status updates`

Status lifecycle:

`PENDING -> PROCESSING -> COMPLETED / FAILED`

## How to Run the Pipeline

From repo root, run both services.

### API server

`pnpm --filter @ledgerlens/api start:dev`

### Worker process

`pnpm --filter @ledgerlens/worker start:dev`

## End-to-End Test

1) Create document
- `POST /documents`

2) Enqueue processing
- `POST /documents/<DOC_ID>/process`

3) Check status
- `GET /documents/<DOC_ID>/status`

Expected progression:

`PENDING -> PROCESSING -> COMPLETED`

## Current Summary

Implemented so far:
- Running backend service (NestJS)
- Postgres schema and migrations via Prisma
- Document CRUD-style API basics
- Redis-backed queue in API
- Separate worker process
- Async processing pipeline with status tracking
