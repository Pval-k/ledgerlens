# 7) Full request flow (file-to-file)

This is the end-to-end lifecycle from user click to analytics chart.

## Stage A: User auth (signup/login)

Frontend:
- user submits auth form
- client calls auth endpoint
- stores access token and refresh token response payload

Backend:
- controller validates request body DTO
- service verifies/creates user
- service issues tokens and session metadata

Result:
- authenticated session starts

## Stage B: Create upload session

1. Frontend calls `POST /documents/upload-session`.
2. API creates a `Document` row with `PENDING`-style upload state metadata.
3. API requests presigned PUT URL from storage service.
4. API returns `{ documentId, uploadUrl, headers }`.

Why this design:
- browser uploads file directly to storage
- API avoids proxying large file bodies

## Stage C: Browser uploads file to storage

Browser sends PUT request directly to presigned URL.

At this point, the file exists in storage, but ingestion has not started yet.

## Stage D: Complete upload call

1. Frontend calls `POST /documents/:id/complete-upload`.
2. API verifies object exists via storage `head` call.
3. API enqueues ingestion job with document ID and storage key.

Now async pipeline takes over.

## Stage E: Worker ingestion

Worker receives `INGEST_DOCUMENT` job.

Detailed steps:
1. Load document metadata from DB.
2. Download file bytes from storage.
3. Decode bytes to UTF-8 text.
4. Parse CSV rows.
5. Normalize rows into standard transaction shape.
6. Replace existing transactions for that document.
7. Insert parsed transactions.
8. Mark document as completed.
9. Rebuild summary tables.

If parse fails:
- job marks document as `FAILED`
- `ingestError` stores readable failure reason

## Stage F: Analytics reads

Frontend calls analytics routes.

API:
- verifies document ownership
- reads from summary tables
- returns paginated/filterable aggregates

Because summaries are precomputed, reads are fast and chart-friendly.

## What "normalize rows" means in this project

Different CSV headers are mapped into standard fields:
- posted date
- amount
- description
- category
- currency

This gives one consistent DB shape even when source CSV formats differ.
