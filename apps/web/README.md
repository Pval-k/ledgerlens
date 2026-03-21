# LedgerLens web

Vite + React + TypeScript. Talks to the Nest API (`apps/api`) over HTTP.

## Scripts

- `pnpm dev` — dev server (default [http://localhost:5173](http://localhost:5173))
- `pnpm build` — typecheck + production bundle to `dist/`
- `pnpm preview` — serve `dist/` locally

## Configuration

**Local dev (`pnpm dev`):** leave **`VITE_API_URL` unset**. The app calls **`/api/...`** on the Vite origin; `vite.config.ts` proxies that to **`http://127.0.0.1:3000`**, so you avoid CORS and the UI works as long as the Nest API is running on port 3000.

**Production build:** set **`VITE_API_URL`** to your API’s public URL (no trailing slash).

The API should still enable CORS for non-proxied browsers (see **`CORS_ORIGIN`** in `apps/api/.env.example` if needed).

## Features

- CSV upload via presigned URL → complete upload → worker ingest
- Document list and detail with live status polling
- Monthly income/expense chart and category spending (Stage 6 analytics APIs)
- Paginated transaction table