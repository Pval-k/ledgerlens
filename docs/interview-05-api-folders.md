# 5) `apps/api/src` folders explained

This section explains each backend folder in practical terms.

## `auth/`

Purpose:
- user identity
- credential validation
- token issuance and refresh rotation
- logout and session revocation

Common components:
- controller (routes)
- service (business logic)
- JWT strategy/guard
- DTOs for request validation

## `documents/`

Purpose:
- create upload sessions
- complete uploads
- document status
- paginated transaction listing
- document deletion

This is the bridge between user uploads and ingestion workflow.

## `analytics/`

Purpose:
- read-only analytical views for documents
- monthly rollups
- category rollups
- insights placeholder endpoint

This layer reads summary tables built by the worker.

## `prisma/`

Purpose:
- Prisma client lifecycle management
- shared query helper methods
- DB exception mapping to cleaner API errors

This folder centralizes DB access patterns.

## `queue/`

Purpose:
- enqueue ingestion jobs into BullMQ
- expose queue stats needed by health/observability

This keeps queue code out of controllers.

## `storage/`

Purpose:
- create presigned upload URLs
- read object metadata (`head`)
- delete object by key

This abstracts S3-compatible operations.

## `health/`

Purpose:
- liveness endpoint
- readiness endpoint (checks critical dependencies)
- lightweight runtime metrics endpoint

Useful for deployments, probes, and quick diagnostics.

## `idempotency/`

Purpose:
- safe retries for write endpoints
- replay same response for same idempotency key + same request fingerprint
- reject key collisions for different payloads

Important for production-grade API behavior.

## `generated/`

Purpose:
- generated Prisma client artifacts used by TypeScript/runtime

This is generated code, not handwritten feature logic.
