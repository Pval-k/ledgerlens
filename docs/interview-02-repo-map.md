# 2) Repo map and what each app does

This repository is a monorepo. That means multiple apps live in one codebase and share tooling.

## High-level tree

```text
ledgerlens/
  apps/
    api/
    worker/
    web/
  docs/
```

## `apps/api` (NestJS backend)

Role:
- exposes HTTP endpoints
- handles auth and authorization
- creates upload sessions and presigned URLs
- queues ingestion jobs
- serves analytics

Think of it as the "traffic controller" for user requests.

## `apps/worker` (BullMQ consumer)

Role:
- consumes ingestion jobs from Redis
- downloads uploaded files from object storage
- parses and normalizes CSV rows
- writes transaction records
- rebuilds materialized summary tables

Think of it as the "factory worker" doing heavy data transformation.

## `apps/web` (React frontend)

Role:
- user-facing pages (landing, login, signup, dashboard, settings)
- stores auth session state
- calls backend APIs
- displays document status and analytics

Think of it as the "storefront" where users interact with the system.

## `docs` (project knowledge base)

Role:
- architecture explanations
- progress log
- interview prep and beginner walkthroughs
- CSV input format guidance

## Why this split helps

- backend concerns stay separate from UI concerns
- background processing does not block API responses
- each app can be built/tested independently
- easier ownership as team size grows

## Typical data path across apps

`web` -> `api` -> `storage/queue/db` -> `worker` -> `db` -> `api` -> `web`

This sequence is the core loop of the product.
