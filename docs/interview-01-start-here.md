# 1) Start Here: What this project is

LedgerLens is a web application that turns raw financial CSV files into organized analytics for each logged-in user.

If you are new to backend development, think of LedgerLens as a pipeline with four big stages:

1. **Identity stage**: a user creates an account and logs in.
2. **Upload stage**: that user uploads a CSV file to object storage.
3. **Processing stage**: a background worker parses rows and stores normalized transactions.
4. **Analytics stage**: the API serves fast summaries and charts from precomputed tables.

## The one-sentence architecture

The API coordinates requests, the worker handles heavy background processing, PostgreSQL stores structured data, Redis powers queueing, and S3-compatible storage holds uploaded files.

## Why this project exists

Real financial data is messy:
- column names vary by bank
- date formats vary
- amounts can be negative, positive, or in parentheses
- users upload big files, so processing can be slow

LedgerLens solves this by standardizing input and separating interactive requests from heavy compute.

## What "multi-tenant" means in this project

Multi-tenant means one deployed system serves many users, but each user only sees their own data.

In LedgerLens:
- users log in with JWT auth
- documents belong to one user (`userId`)
- transaction and analytics queries are filtered by that `userId`
- attempts to access another user document return not found

## The user journey in plain language

1. User signs up or logs in.
2. User starts an upload session.
3. API returns a temporary URL where browser uploads the file.
4. User confirms upload completion.
5. API queues ingestion work.
6. Worker downloads file, parses rows, writes transactions.
7. Worker computes monthly and category summaries.
8. Frontend fetches analytics from API and renders charts.

## Why there is an API and a worker

The API should answer quickly. CSV parsing and aggregation can take time.

If the API did everything inline:
- request times would be slow
- failures would be harder to retry safely
- app would scale poorly

Using a worker gives:
- responsive API
- async retries
- clearer failure boundaries

## What success looks like

A good run means:
- document moves to `COMPLETED`
- transactions are stored for that document
- summary tables are rebuilt
- dashboard endpoints return totals and trends

## What failure looks like

A failed parse means:
- document moves to `FAILED`
- a readable `ingestError` message is stored
- no partial confusing state is shown as success

That behavior is intentional so users can retry with a corrected CSV.
