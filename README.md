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
  docs/         # architecture.md, progress.md (build diary), etc.
  README.md
```

## How we’ll build this (stage-by-stage)

- **Stage 0 — Folder + docs scaffold** — Base repo structure and starter docs.
- **Stage 1 — API scaffold** — NestJS under `apps/api` and a simple health route.
- **Stage 2 — Web scaffold** — React under `apps/web` calling the API.
- **Stage 3 — Database + auth** — Postgres + Prisma; JWT auth (**signup / login / me / change-password**), **`User`** + per-user **`Document`** scoping, web landing + dashboard + settings — see **Phase 13** in [`docs/progress.md`](docs/progress.md).
- **Stage 4 — Upload + worker** — Redis + BullMQ; document metadata; enqueue ingestion; worker consumes jobs.
- **Stage 5 — CSV ingestion** — Parse CSV → normalize → persist `transactions`.
- **Stage 6 — Deterministic analytics** — Summaries, anomaly flags, analytics APIs, dashboard charts.

## Where to look for docs

- **Where files live (repo map for beginners):** [`docs/repo-layout.md`](docs/repo-layout.md) — includes *migrations vs database* explained clearly
- **Architecture (current design):** [`docs/architecture.md`](docs/architecture.md)
- **Build progress (beginner-friendly diary, bugs, history):** [`docs/progress.md`](docs/progress.md)

