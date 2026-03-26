# 13) Complete API endpoint list (public vs protected)

Protected endpoint = requires bearer JWT in `Authorization` header.

## Public endpoints

### Health

- `GET /` - hello/liveness text response
- `GET /health/live` - process liveness
- `GET /health/ready` - readiness check (critical dependencies)
- `GET /health/metrics` - lightweight runtime/queue metrics snapshot

### Auth

- `POST /auth/signup`
  - purpose: create user and issue tokens
  - body: `name`, `email`, `password`, `passwordConfirm`
- `POST /auth/login`
  - purpose: authenticate user and issue tokens
  - body: `email`, `password`
- `POST /auth/refresh`
  - purpose: rotate refresh session and issue new access token
  - body: `refreshToken`
- `POST /auth/logout`
  - purpose: revoke one refresh session
  - body: `refreshToken`

## Protected endpoints

### Auth

- `GET /auth/me`
  - purpose: return current authenticated user profile
- `POST /auth/change-password`
  - purpose: update password and revoke active refresh sessions
  - body: `currentPassword`, `newPassword`, `newPasswordConfirm`
- `POST /auth/logout-all`
  - purpose: revoke all refresh sessions for current user

### Documents

- `GET /documents`
  - purpose: list current user documents
- `POST /documents/upload-session`
  - purpose: create document row and presigned upload URL
  - body: `originalFilename?`, `contentType?`, `sizeBytes?`, `sha256?`
  - optional header: `Idempotency-Key`
- `POST /documents/:id/complete-upload`
  - purpose: verify uploaded object and enqueue ingestion
  - optional header: `Idempotency-Key`
- `GET /documents/:id/status`
  - purpose: ingestion status and metadata
- `GET /documents/:id/transactions`
  - purpose: paginated transactions for one document
  - query: `page`, `limit`
- `DELETE /documents/:id`
  - purpose: delete document and related records

### Analytics

- `GET /documents/:id/insights`
  - purpose: placeholder insights route
- `GET /documents/:id/analytics/monthly`
  - purpose: monthly aggregated analytics
  - query: `from`, `to`, `page`, `limit`
- `GET /documents/:id/analytics/by-category`
  - purpose: category aggregated analytics
  - query: `from`, `to`, `category`, `page`, `limit`

## Route totals

- public routes: 8
- protected routes: 12
- total routes: 20
