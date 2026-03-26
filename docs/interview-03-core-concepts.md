# 3) Core backend concepts (pnpm, ORM, Prisma, migrations, E2E)

This section explains core terms in plain language.

## What is pnpm?

`pnpm` is the package manager used in this monorepo.

It handles:
- installing dependencies
- running scripts
- workspace-aware filtering (run command only for one app)

Examples:
- `pnpm --filter @ledgerlens/api build`
- `pnpm --filter @ledgerlens/api test:e2e`

## What is a relational database?

A relational database stores data in tables (rows and columns), with relationships between tables.

In LedgerLens, PostgreSQL is the relational database.

Examples of table relationships:
- one `User` has many `Document`
- one `Document` has many `Transaction`

## What is ORM?

ORM means Object-Relational Mapping.

It is a programming layer that maps your code types/objects to relational database tables.

Without ORM:
- you write raw SQL for most operations

With ORM:
- you call typed methods in code (create, find, update, delete)
- the ORM builds SQL under the hood

## What is Prisma?

Prisma is the ORM used here.

Prisma gives:
- a schema file (`schema.prisma`) to define models and relations
- generated TypeScript client
- migration tooling to evolve DB structure safely

## What is `schema.prisma`?

It is a model definition file.

It describes:
- entities (models like `User`, `Document`, `Transaction`)
- fields and types
- indexes and unique constraints
- relationships between models

Think: "target database structure I want."

## What is `migration.sql`?

`migration.sql` files are versioned SQL scripts generated/applied as part of schema evolution.

They are **instructions**, not your live database.

Think: "steps to transform DB structure from old state to new state."

## Where is the actual database?

The real database is the running PostgreSQL instance referenced by `DATABASE_URL`.

That instance stores:
- real rows
- indexes
- constraints
- migration history table

`migration.sql` lives in Git; real data lives in Postgres.

## What are E2E tests?

End-to-end tests simulate real app usage through HTTP endpoints.

In this repo they validate:
- auth flow behavior
- protected route behavior
- cross-user isolation

E2E tests are valuable because they test integration between modules and infrastructure, not just isolated functions.

## Why beginners should care about these concepts

If you understand these five concepts (pnpm, DB, ORM, migrations, E2E), you can explain:
- how code turns into running behavior
- how data shape changes safely over time
- how we confirm behavior is correct
