# 4) NestJS structure: Module / Controller / Service

NestJS is organized around clear architectural roles. LedgerLens follows that pattern.

## Module: feature wiring

A module groups related parts of a feature and wires dependencies.

Typical module responsibilities:
- declare controllers
- register providers (services)
- import/export dependencies

Think: "feature container."

## Controller: HTTP boundary

A controller defines routes and handles request/response shape.

Typical controller responsibilities:
- route paths and methods (`GET`, `POST`, `DELETE`)
- parameter extraction (`@Body`, `@Param`, `@Query`, headers)
- auth guards/decorators
- delegation to service methods

Think: "API surface."

## Service: business logic

A service contains domain behavior and orchestration.

Typical service responsibilities:
- call Prisma for DB operations
- call storage/queue collaborators
- validate state transitions
- build response objects
- throw meaningful exceptions

Think: "application brain."

## Example pattern in LedgerLens

- `documents.controller.ts`: exposes `/documents/*` routes
- `documents.service.ts`: implements upload session, completion, status, delete, transactions
- `documents.module.ts`: wires dependencies

## Why this pattern matters

- keeps route code thin and readable
- makes business logic testable
- avoids tangled code where HTTP and domain logic are mixed

## Request lifecycle in Nest

1. Incoming request hits route in controller.
2. Guards/interceptors/pipes run.
3. Controller calls service method.
4. Service uses DB/storage/queue and returns data.
5. Nest serializes response to JSON.

This predictable flow helps both debugging and onboarding.
