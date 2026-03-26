# Worker (`apps/worker`)

Background worker service for asynchronous ingestion and aggregation.

## Current behavior

- Consumes `INGEST_DOCUMENT` jobs with `{ documentId, storageKey }` (legacy jobs may omit `storageKey`; the worker falls back to the DB row).
- Downloads the object from MinIO/S3 using the same `S3_*` env vars as the API.
- Parses CSV and writes normalized transactions to Postgres.
- Rebuilds materialized monthly/category summaries after successful ingest.
- Emits periodic queue/job metrics logs (queue depth, success/failure/retry counts, avg/max processing time).

Copy env from `apps/api/.env.example` (at least `DATABASE_URL`, `REDIS_URL`, and the `S3_*` variables).

After changing `apps/api/prisma/schema.prisma`, regenerate the client so this app’s types match:

`pnpm --filter @ledgerlens/worker run generate`

(same as `prisma generate --schema=../api/prisma/schema.prisma`).

## CSV format (v1)

The worker expects a header row. **Required** columns (any of the listed header aliases):

- **Date:** e.g. `date`, `posted_at`, `transaction_date`
- **Amount:** e.g. `amount`, `value`

Optional: `description` / `memo`, `category`, `currency` (defaults to `USD`).

See `apps/worker/src/parse-csv.ts` and `docs/sample-transactions.csv`.

