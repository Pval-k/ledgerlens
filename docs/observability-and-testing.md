# Observability and testing

This document describes the **testing** and **Prometheus/Grafana observability** added to LedgerLens: what was built, how to run it, and how the pieces fit together.

## Testing

### Worker unit tests (`apps/worker`)

Jest tests live next to the worker source:

| File | What it covers |
|------|----------------|
| `parse-csv.spec.ts` | Header aliases, amount formats `(45.10)` / `$1,234.56`, empty rows, malformed date/amount row errors, max row limit |
| `aggregate-summaries.spec.ts` | UTC month buckets, income vs expense aggregation, multi-currency → USD rollup, idempotent delete-before-insert |

Run:

```bash
pnpm --filter @ledgerlens/worker test
```

### API tests (`apps/api`)

Existing coverage:

- **Unit:** `src/health/health.controller.spec.ts`
- **E2E:** `test/app.e2e-spec.ts` — auth, `/auth/me`, cross-user isolation

New **full ingest E2E:** `test/ingest.e2e-spec.ts`

Flow:

1. Signup
2. `POST /documents/upload-session`
3. PUT sample CSV to presigned MinIO URL
4. `POST /documents/:id/complete-upload` (enqueues BullMQ job)
5. **`processIngestDocument`** (same code path as the worker) — runs ingest synchronously in the test so CI does not require a separate worker process
6. Assert `COMPLETED`, transaction count, monthly + category analytics (including Income category)

Requires **Docker Compose** infra (Postgres, Redis, MinIO) and migrations applied.

Run:

```bash
docker compose up -d
pnpm --filter @ledgerlens/api exec prisma migrate deploy
pnpm --filter @ledgerlens/api test:e2e
```

Default DB URL for e2e matches local Compose: `postgresql://user:password@127.0.0.1:5432/ledgerlens`.

### Shared ingest module

Ingest logic was extracted to `apps/worker/src/ingest-document.ts` so both the BullMQ worker and API e2e tests call the same function: download → parse → transactional `createMany` (chunked) → `rebuildDocumentSummaries`.

---

## Observability

### Design: three signals

| Signal | Source | Meaning |
|--------|--------|---------|
| **API latency** | Nest `http_request_duration_seconds` | HTTP request handling time |
| **Queue depth** | API `bullmq_queue_*_jobs` gauges | Backlog pressure (updated on each `/metrics` scrape) |
| **Ingest duration** | Worker `ingest_job_duration_seconds` | Real processing time (download → parse → DB → summaries) |

Enqueue count is tracked on the API as `ingest_enqueue_total` when `complete-upload` succeeds.

### API metrics (`apps/api`)

- **`GET /metrics`** — Prometheus text format (`prom-client`)
- Middleware records `http_request_duration_seconds` (method, route, status)
- Gauges refreshed from BullMQ on scrape: `bullmq_queue_waiting_jobs`, `bullmq_queue_active_jobs`, `bullmq_queue_failed_jobs`
- **`GET /health/metrics`** — unchanged JSON snapshot for quick debugging

### Worker metrics (`apps/worker`)

- **`GET :9091/metrics`** (port via `WORKER_METRICS_PORT`, default `9091`)
- **`ingest_job_duration_seconds`** histogram — timer starts at job begin, ends after summaries commit (`status=success|error`)
- **`ingest_jobs_total`** counter — success/error outcomes
- Console queue logs every 30s remain for local debugging

### Prometheus + Grafana (local)

Files:

```text
observability/prometheus/prometheus.yml
observability/grafana/provisioning/...
observability/grafana/dashboards/ledgerlens.json
docker-compose.observability.yml
```

**Start stack:**

```bash
# Infra + apps on host
docker compose up -d
pnpm --filter @ledgerlens/api exec prisma migrate deploy
pnpm dev:api          # :3000
pnpm dev:worker       # metrics :9091

# Observability
docker compose -f docker-compose.observability.yml up -d
```

| UI | URL | Login |
|----|-----|--------|
| Grafana | http://localhost:3001 | admin / admin |
| Prometheus | http://localhost:9090 | — |

Prometheus scrapes `host.docker.internal:3000` (API) and `host.docker.internal:9091` (worker). On Linux, `extra_hosts: host-gateway` is configured in the compose file.

The **LedgerLens** dashboard includes:

- API latency p95
- Queue waiting / active / failed
- Ingest job duration p95 (worker)
- Ingest success/error/enqueue rates

Take screenshots from Grafana for portfolio/README use.

---

## What we intentionally did not add

- Coverage percentage targets or exhaustive UI tests
- Kubernetes or multi-replica worker deployment
- Load tests at 500k rows (cap exists; not benchmarked)
- Full alerting / Alertmanager stack

Those can follow the same patterns without changing the core architecture.
