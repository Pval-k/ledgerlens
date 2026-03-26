# 6) Prisma and migrations in this project

This section answers three beginner questions:
- how data models are defined
- how schema changes are tracked safely
- how those changes affect the running database

## Source of truth files

- Model definition: `apps/api/prisma/schema.prisma`
- Migration scripts: `apps/api/prisma/migrations/*/migration.sql`

## Important models in LedgerLens

- `User`: account identity, email/password hash, profile name
- `RefreshSession`: refresh token session lifecycle and revocation state
- `Document`: uploaded file metadata and ingestion status
- `Transaction`: normalized row-level financial data
- `DocumentMonthlySummary`: per-month aggregates
- `CategoryMonthlySummary`: per-month per-category aggregates

## Why there are both transactions and summaries

Transactions preserve detailed source-level data.
Summaries provide faster analytical reads.

This is a common pattern called materialization or pre-aggregation.

## Migration lifecycle (simple mental model)

1. You update `schema.prisma`.
2. Prisma generates a migration SQL script.
3. Migration is committed to source control.
4. Environment runs migration against Postgres.
5. DB now has updated structure.

## What migration scripts usually contain

- `CREATE TABLE` / `ALTER TABLE`
- indexes
- foreign keys
- unique constraints
- backfill statements when needed

## Why ordered migrations matter

Schema changes are stateful. A migration assumes previous migrations already ran.

Applying out of order can break constraints or references.

## Practical safety rules

- never hand-edit random DB tables directly in production
- keep schema + migrations in sync
- apply migrations before running app versions that depend on them
- use clear migration names for maintainability

## One beginner-friendly analogy

- `schema.prisma` = blueprint
- `migration.sql` = renovation instructions
- Postgres instance = actual building people live in
