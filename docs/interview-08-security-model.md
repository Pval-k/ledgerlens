# 8) Security model

LedgerLens security is layered. No single control is trusted alone.

## 1) Authentication: JWT access token

Protected routes require bearer token:
- `Authorization: Bearer <token>`

If token is missing/invalid:
- API returns `401`

## 2) Session lifecycle: refresh tokens

Refresh tokens support:
- issuing new access tokens
- rotation (new refresh token replaces old)
- revocation on logout
- revoke-all on password change / logout-all

This reduces long-lived token risk.

## 3) Password handling

- passwords are hashed with bcrypt
- raw passwords are never stored
- password change path validates current password and confirmation fields

## 4) Authorization: user-scoped data

Every document belongs to a user.

For document/analytics routes:
- API enforces `userId` ownership checks
- cross-user access attempts return not found

This prevents data leaks across tenants.

## 5) Idempotency on critical writes

Write endpoints that may be retried can accept idempotency keys.

Behavior:
- same key + same request fingerprint -> replay previous response
- same key + different payload -> reject conflict

This prevents duplicate side effects from retries.

## 6) Rate limiting

Sensitive endpoints such as auth operations are throttled.

This limits brute-force attempts and abusive traffic bursts.

## 7) Error handling discipline

Failures are returned as explicit API errors, and backend logs preserve context with request IDs.

Good security includes strong diagnostics; silent failures are dangerous.
