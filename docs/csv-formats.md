# CSV Formats LedgerLens Accepts

This document shows practical CSV shapes that the worker can parse today.

## Required columns

You must provide headers that map to:
- `date` (or a supported alias)
- `amount` (or a supported alias)

Everything else is optional.

## Header aliases supported

Date column aliases:
- `date`
- `posted_at`
- `transaction_date`
- `posting_date`
- `post_date`

Amount column aliases:
- `amount`
- `value`
- `debit`
- `credit`

Description aliases (optional):
- `description`
- `memo`
- `note`
- `payee`
- `details`
- `narrative`

Category aliases (optional):
- `category`
- `type`
- `class`

Currency aliases (optional):
- `currency`
- `curr`

## Rules and defaults

- If `currency` is missing, worker uses `USD`.
- `category` is optional.
- Month is not a CSV field; it is derived from the parsed date.
- Empty lines are skipped.
- Date and amount are validated per row.
- If a row has invalid date/amount, ingestion fails with an error that includes row number.

## Supported date formats

Examples that parse:
- `2026-03-20`
- `2026-03-20T08:30:00Z`
- `03/20/2026`

## Supported amount formats

Examples that parse:
- `120.50`
- `-45.10`
- `(45.10)` (treated as negative)
- `$1,234.56`

---

## Example A: Minimal required

```csv
date,amount
2026-03-01,-45.12
2026-03-02,1200.00
```

## Example B: Common bank-style statement

```csv
posting_date,amount,description,category,currency
2026-03-01,-12.50,Coffee Shop,Food,USD
2026-03-02,-89.40,Grocery Store,Groceries,USD
2026-03-05,3000.00,Payroll,Income,USD
```

## Example C: Credit/debit style headers

```csv
transaction_date,debit,payee,type,curr
03/01/2026,45.67,Online Retail,Shopping,usd
03/03/2026,-120.00,Electric Utility,Bills,USD
03/10/2026,2500.00,Employer Inc,Income,USD
```

## Example D: No category provided

```csv
date,amount,memo,currency
2026-03-01,-55.00,Ride share,USD
2026-03-02,-14.20,Cafe,USD
2026-03-03,1800.00,Salary,USD
```

## Example E: Multi-currency input

```csv
date,amount,description,category,currency
2026-03-01,-20.00,Coffee,Food,EUR
2026-03-04,1500.00,Consulting,Income,USD
2026-03-06,-900.00,Rent,Housing,GBP
```

## Example F: Alternate aliases

```csv
post_date,value,narrative,class,curr
2026-03-01,-8.99,Music subscription,Entertainment,USD
2026-03-02,-120.45,Supermarket,Groceries,USD
2026-03-08,2200.00,Monthly salary,Income,USD
```
