# 14) CSV formats this project accepts

This section explains what the parser expects and what flexibility is supported.

## Minimum required headers

A CSV must map to:
- date column (or date alias)
- amount column (or amount alias)

If either is missing, ingestion fails.

## Optional headers

- description
- category
- currency

Defaults:
- if currency is missing, `USD` is used
- if category is missing, value is stored as null/empty category bucket

## Supported aliases

Date aliases:
- `date`
- `posted_at`
- `transaction_date`
- `posting_date`
- `post_date`

Amount aliases:
- `amount`
- `value`
- `debit`
- `credit`

Description aliases:
- `description`
- `memo`
- `note`
- `payee`
- `details`
- `narrative`

Category aliases:
- `category`
- `type`
- `class`

Currency aliases:
- `currency`
- `curr`

## Date parsing behavior

Common accepted examples:
- `2026-03-20`
- `2026-03-20T12:00:00Z`
- `03/20/2026`

Invalid dates produce row-specific errors.

## Amount parsing behavior

Accepted examples:
- `120.50`
- `-45.10`
- `(45.10)` -> treated as negative
- `$1,234.56` -> symbol and comma tolerated

Invalid amounts produce row-specific errors.

## Is month required in the CSV?

No. Month is derived from parsed date during summary aggregation (`YYYY-MM` UTC buckets).

## Is category required?

No. Category is optional.

## What if file is not valid CSV?

The worker parser throws an error, document status becomes failed, and error message is saved for debugging.

## Ready-to-use templates

See `docs/csv-formats.md` for copy-paste sample CSV files across multiple schemas.
