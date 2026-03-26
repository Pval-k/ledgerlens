# 12) Interview questions + expanded sample answers

## Q1) Why separate API and worker?

Because request latency and batch processing have different needs. The API should be responsive and mostly orchestration-focused. CSV ingestion and aggregation are heavier and can fail independently, so they run in a queue-backed worker. This pattern improves UX, scalability, and operational clarity.

## Q2) How do summaries get generated?

Worker parses normalized transaction rows, stores them in `Transaction`, then groups by UTC month and currency (and by category for the second summary table). It writes precomputed aggregates so analytics routes read quickly without expensive on-demand grouping.

## Q3) What does "multi-tenant isolation" mean here?

Each document belongs to one user. Protected routes extract user identity from JWT and apply ownership checks in DB queries. If user B asks for user A's document, API returns not found. This avoids both data leakage and existence leakage.

## Q4) What is ORM and why use Prisma?

ORM is an abstraction that maps relational tables to typed code APIs. Prisma gives schema definitions, typed queries, and migration tooling. It speeds development while preserving relational modeling and reducing SQL boilerplate.

## Q5) `migration.sql` is not the DB, so what is it?

It is a versioned instruction script for changing DB structure. The actual database is the running PostgreSQL instance and its stored rows. Migrations are applied to that instance to move schema forward safely.

## Q6) What does "parse + normalize CSV" mean?

Parsing converts text cells into typed values (date, decimal, strings). Normalization maps different source headers into one canonical shape used by `Transaction`. For example, several date aliases map into one `postedAt` field.

## Q7) What are protected endpoints?

Routes behind JWT auth guard. Client must provide bearer access token. Missing or invalid token returns `401`. For document-specific reads/writes, ownership checks enforce tenant boundaries.

## Q8) How is reliability handled?

Reliability comes from queue-based async processing, idempotency on critical writes, explicit document status tracking, and worker retry/failure handling. Observability is supported by structured logs, health endpoints, and queue/job metrics.

## Q9) Why use summary tables instead of calculating from transactions on every request?

Summary tables trade write complexity for read speed. Charts and dashboard APIs become fast and stable because heavy grouping is done once during ingestion, not repeatedly during every user request.
