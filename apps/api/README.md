# LedgerLens API (`apps/api`)

NestJS backend for auth, document upload orchestration, analytics reads, and queue integration.

## Main responsibilities

- JWT auth + refresh session lifecycle (`signup`, `login`, `me`, `refresh`, `logout`, `logout-all`)
- Document upload flow (`upload-session` -> presigned PUT -> `complete-upload`)
- User-scoped reads for documents, transactions, and analytics
- Queue orchestration to worker via BullMQ/Redis
- Health/readiness/metrics endpoints for operability

## Run

```bash
pnpm --filter @ledgerlens/api start:dev
```

## Build & test

```bash
pnpm --filter @ledgerlens/api build
pnpm --filter @ledgerlens/api test
pnpm --filter @ledgerlens/api test:e2e
```

## Prisma

```bash
pnpm --filter @ledgerlens/api exec prisma migrate deploy
pnpm --filter @ledgerlens/api exec prisma generate
```

## Docs

- `docs/architecture.md`
- `docs/progress.md`
- `docs/interview-prep.md`
