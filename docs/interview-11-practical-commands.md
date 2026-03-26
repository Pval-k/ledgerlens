# 11) Practical commands

This section groups commands by what you are trying to do.

## Build

- `pnpm --filter @ledgerlens/api build`
- `pnpm --filter @ledgerlens/worker build`
- `pnpm --filter @ledgerlens/web build`

Use these to verify TypeScript compilation and production bundle generation.

## Tests

- `pnpm --filter @ledgerlens/api test`
- `pnpm --filter @ledgerlens/api test:e2e`

Use unit tests for local logic checks and e2e for full HTTP + integration behavior.

## Prisma migrations and client generation

- `pnpm --filter @ledgerlens/api exec prisma migrate deploy`
- `pnpm --filter @ledgerlens/api exec prisma generate`

Run migrations before starting app versions that require newer schema.

## Common beginner workflow

1. Pull latest changes.
2. Install deps: `pnpm install`.
3. Apply DB migrations.
4. Build API and worker.
5. Run tests.

If something fails, fix build/test failures before feature debugging.
