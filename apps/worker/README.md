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

Not implemented yet (Stage 0 scaffolding only).

