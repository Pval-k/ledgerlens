# LedgerLens

LedgerLens is a production-style **financial document intelligence** platform.
It ingests user-uploaded financial files, processes them asynchronously, and produces **deterministic** structured analytics (totals, breakdowns, trends, anomalies). Natural-language “AI explanations” are an optional enhancement layer added later.

## Repo structure

```
ledgerlens/
  apps/
    api/        # NestJS REST API (auth, uploads, orchestration, query APIs)
    worker/     # background jobs (BullMQ consumers: parse, normalize, aggregate)
    web/        # React + TypeScript UI (upload, explorer, dashboard)
  docs/         # architecture notes and design docs
  README.md
```

## How we’ll build this (stage-by-stage)

- **Stage 0 — Folder + docs scaffold (this stage)**\n  Create the base repo structure and starter docs so every next step has a clear home.\n\n- **Stage 1 — API scaffold**\n  Add NestJS under `apps/api` and expose `GET /health`.\n\n- **Stage 2 — Web scaffold**\n  Add React under `apps/web` and call the API `GET /health`.\n\n- **Stage 3 — Database + auth**\n  Add Postgres + Prisma; implement register/login (JWT) in the API.\n\n- **Stage 4 — Upload + worker**\n  Add Redis + BullMQ; add document upload metadata; enqueue ingestion; worker consumes jobs.\n\n- **Stage 5 — CSV ingestion**\n  Parse CSV → normalize → persist `transactions`.\n\n- **Stage 6 — Deterministic analytics**\n  Compute monthly/category summaries and basic anomaly detection; expose analytics endpoints; render dashboard charts.\n+
## Where to look for architecture\n+
Start with [`docs/architecture.md`](docs/architecture.md).

