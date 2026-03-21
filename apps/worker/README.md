# Worker (`apps/worker`)

This will be the **background worker service**.

Planned responsibilities:
- consume BullMQ jobs from Redis (e.g., `INGEST_DOCUMENT`)
- fetch uploaded files from object storage (S3/MinIO)
- parse and validate (CSV first; PDF later)
- normalize transactions deterministically
- persist normalized transactions to Postgres
- compute deterministic aggregates (monthly/category summaries) and anomalies
- update document status + failure details with retries/backoff

## Current behavior

- Consumes `INGEST_DOCUMENT` jobs with `{ documentId, storageKey }` (legacy jobs may omit `storageKey`; the worker falls back to the DB row).
- Downloads the object from MinIO/S3 using the same `S3_*` env vars as the API.
- Still uses a short sleep as a stand-in for CSV → `transactions` parsing.

Copy env from `apps/api/.env.example` (at least `DATABASE_URL`, `REDIS_URL`, and the `S3_*` variables).

## CSV format (v1)

The worker expects a header row. **Required** columns (any of the listed header aliases):

- **Date:** e.g. `date`, `posted_at`, `transaction_date`
- **Amount:** e.g. `amount`, `value`

Optional: `description` / `memo`, `category`, `currency` (defaults to `USD`).

See `apps/worker/src/parse-csv.ts` and `docs/sample-transactions.csv`.

