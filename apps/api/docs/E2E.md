# E2E tests (`test/app.e2e-spec.ts`)

## Prerequisites

- **Postgres** reachable with a database that has migrations applied (same schema as dev).
- **`DATABASE_URL`** — the test file loads `apps/api/.env` first. Set `DATABASE_URL` to a dedicated test DB (e.g. `ledgerlens_test`) or export **`E2E_DATABASE_URL`** to override the fallback only.
- Run migrations: `pnpm --filter @ledgerlens/api exec prisma migrate deploy`

## What is covered

- `GET /` health string
- `GET /auth/me` — 401 without token; 200 with signup + Bearer
- **Cross-user isolation** — user B gets **404** on user A’s document `status`, `analytics/monthly`, and `insights`

## Run

```bash
pnpm --filter @ledgerlens/api test:e2e
```

Redis / MinIO env vars are set to local defaults in the test file for modules that read them; ingestion is not exercised in these tests.
