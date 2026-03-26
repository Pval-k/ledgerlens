# Backend hardening notes

## Implemented

- **Rate limiting** — `@nestjs/throttler` global guard (default: 120 requests / minute / IP). Health checks use `@SkipThrottle()`. `POST /auth/signup` and `POST /auth/login` use a stricter limit (30 / minute / IP); `POST /auth/change-password` is limited (15 / minute / IP).
- **Structured logging** — `nestjs-pino` request + application logs (JSON in production, `pino-pretty` in development). Tests run with `silent` log level.
- **Prisma errors** — `PrismaClientExceptionFilter` maps known `PrismaClientKnownRequestError` codes (e.g. **P2022** missing column) to JSON responses that hint running `pnpm exec prisma migrate deploy` from `apps/api` when the DB lags the schema.
- **Idempotency on document writes** — `Idempotency-Key` support for `POST /documents/upload-session` and `POST /documents/:id/complete-upload` using Redis (`SET NX EX`) with replay-safe response storage; mismatched payload/key and in-flight collisions return `409`.
- **Refresh lifecycle + revocation** — `RefreshSession` table with hashed refresh tokens, rotation on `POST /auth/refresh`, single-session revoke (`POST /auth/logout`), bulk revoke (`POST /auth/logout-all`), and revoke-all on password change.
- **Observability hooks** — request IDs + latency/status structured logs (`nestjs-pino`), API readiness/metrics endpoints (`GET /health/live`, `/health/ready`, `/health/metrics`), and worker queue/job metrics logging (counts, retries, avg/max processing time every 30s).

## E2E

See [E2E.md](./E2E.md) for database setup and the cross-user isolation suite.

## Planned / follow-ups

- **Distributed rate limits** — Move throttler storage from in-memory to Redis when running multiple API replicas.
- **Correlation IDs** — Propagate `X-Request-Id` through API → worker → logs.
- **Refresh hardening** — detect refresh-token reuse attacks and revoke token family on suspicious replay.
