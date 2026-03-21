# Backend hardening notes

## Implemented

- **Rate limiting** — `@nestjs/throttler` global guard (default: 120 requests / minute / IP). Health checks use `@SkipThrottle()`. `POST /auth/signup` and `POST /auth/login` use a stricter limit (30 / minute / IP).
- **Structured logging** — `nestjs-pino` request + application logs (JSON in production, `pino-pretty` in development). Tests run with `silent` log level.

## E2E

See [E2E.md](./E2E.md) for database setup and the cross-user isolation suite.

## Planned / follow-ups

- **Idempotency** — For `POST /documents/upload-session` (and similar), accept an `Idempotency-Key` header and dedupe via Redis (`SET key NX` + TTL) so retries return the same upload session without double rows.
- **Distributed rate limits** — Move throttler storage from in-memory to Redis when running multiple API replicas.
- **Correlation IDs** — Propagate `X-Request-Id` through API → worker → logs.
