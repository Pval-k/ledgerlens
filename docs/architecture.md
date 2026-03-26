# LedgerLens Architecture

This doc describes the current runtime architecture. For step-by-step history and decisions, see `docs/progress.md`.

## Services

- **Web (`apps/web`)**: React UI for auth, upload, dashboard, and document detail views.
- **API (`apps/api`)**: NestJS REST API for auth, uploads, orchestration, analytics queries, and health/metrics.
- **Worker (`apps/worker`)**: BullMQ consumer for background ingestion and summary aggregation.

## Data stores

- **PostgreSQL**: source of truth for users, documents, refresh sessions, transactions, and summary tables.
- **Redis**: BullMQ queue backend plus idempotency records.
- **Object storage (S3-compatible)**: raw uploaded files addressed by `storageKey`.

## Core flow

1. Client requests `POST /documents/upload-session`.
2. API creates a document row + returns presigned PUT URL.
3. Client uploads file directly to object storage.
4. Client calls `POST /documents/:id/complete-upload`.
5. API verifies object metadata, then enqueues `INGEST_DOCUMENT`.
6. Worker downloads file, parses/normalizes rows, writes transactions.
7. Worker rebuilds monthly/category summaries and updates document status.

## Security & reliability patterns

- JWT access tokens + refresh session rotation/revocation.
- User-scoped document and analytics queries.
- Idempotency on critical write endpoints (`Idempotency-Key`).
- Structured logs with request IDs.
- Readiness/metrics endpoints and queue/job instrumentation.

## System diagram

```mermaid
flowchart LR
  Client[Web/Client] --> API[API (NestJS)]
  API --> PG[(Postgres)]
  API --> Redis[(Redis/BullMQ)]
  API --> S3[(S3/MinIO)]
  Redis --> Worker[Worker]
  Worker --> PG
  Worker --> S3
```
