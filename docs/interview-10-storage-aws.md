# 10) S3/MinIO and AWS clarification

LedgerLens uses the AWS SDK S3 API surface.

## Local development vs cloud deployment

Local:
- commonly uses MinIO
- endpoint often like `http://localhost:9000`

Cloud:
- same SDK calls can target AWS S3 by environment configuration

Meaning: code path is storage-provider compatible as long as provider supports S3 API.

## Why presigned URLs are used

Instead of uploading file bytes through API:
- API returns temporary signed URL
- browser uploads directly to object storage

Benefits:
- lower API bandwidth load
- better scalability for larger files
- clearer separation of concerns

## Typical environment variables involved

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

Different environments can swap values without code changes.

## Beginner-friendly summary statement

"We implemented S3-compatible object storage using AWS SDK. In local development we target MinIO, and in production we can target AWS S3 using environment configuration."
