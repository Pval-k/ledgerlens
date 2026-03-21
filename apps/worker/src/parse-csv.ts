import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';

const MAX_ROWS_DEFAULT = 500_000;

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, '_').toLowerCase();
}

type ColumnField =
  | 'postedAt'
  | 'amount'
  | 'description'
  | 'category'
  | 'currency';

/** Map normalized header -> list of aliases (first column name wins). */
const COLUMN_GROUPS: { field: ColumnField; aliases: Set<string> }[] = [
  {
    field: 'postedAt',
    aliases: new Set([
      'date',
      'posted_at',
      'transaction_date',
      'posting_date',
      'post_date',
    ]),
  },
  {
    field: 'amount',
    aliases: new Set(['amount', 'value', 'debit', 'credit']),
  },
  {
    field: 'description',
    aliases: new Set(['description', 'memo', 'note', 'payee', 'details', 'narrative']),
  },
  {
    field: 'category',
    aliases: new Set(['category', 'type', 'class']),
  },
  {
    field: 'currency',
    aliases: new Set(['currency', 'curr']),
  },
];

export type ParsedTransactionRow = {
  postedAt: Date;
  amount: Prisma.Decimal;
  description: string | null;
  category: string | null;
  currency: string;
  rowIndex: number;
};

function parseAmountCell(raw: string): Prisma.Decimal | null {
  let t = raw.trim().replace(/[$,\s]/g, '');
  if (t === '') {
    return null;
  }
  let negative = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    negative = true;
    t = t.slice(1, -1).trim();
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return null;
  }
  const v = negative ? -n : n;
  return new Prisma.Decimal(v.toFixed(4));
}

function parseDateCell(raw: string): Date | null {
  const s = raw.trim();
  if (!s) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    const d = new Date(`${m[3]}-${mm}-${dd}T12:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function resolveColumns(
  headers: string[],
): { map: Record<string, number>; missing: string[] } {
  const normalized = headers.map((h, i) => ({
    norm: normalizeHeader(h),
    i,
  }));
  const map: Record<string, number> = {};
  const missing: string[] = [];

  for (const { field, aliases } of COLUMN_GROUPS) {
    let idx: number | undefined;
    for (const { norm, i } of normalized) {
      if (aliases.has(norm)) {
        idx = i;
        break;
      }
    }
    if (idx === undefined) {
      if (field === 'postedAt' || field === 'amount') {
        missing.push(field);
      }
      continue;
    }
    map[field] = idx;
  }

  return { map, missing };
}

/**
 * Parses LedgerLens CSV v1: first row is headers; required columns (any alias):
 * date, amount. Optional: description, category, currency.
 */
export function parseLedgerCsv(
  utf8Text: string,
  options?: { maxRows?: number },
): ParsedTransactionRow[] {
  const maxRows =
    options?.maxRows ??
    (Number(process.env.WORKER_MAX_CSV_ROWS) || MAX_ROWS_DEFAULT);

  const bomStripped =
    utf8Text.charCodeAt(0) === 0xfeff ? utf8Text.slice(1) : utf8Text;

  const records = parse(bomStripped, {
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  if (records.length < 2) {
    throw new Error(
      'CSV must have a header row and at least one data row.',
    );
  }

  const headerRow = records[0]!;
  const { map, missing } = resolveColumns(headerRow);
  if (missing.includes('postedAt') || missing.includes('amount')) {
    throw new Error(
      `Missing required columns. Need header aliases for date and amount (e.g. "date", "amount"). Missing: ${missing.join(', ')}`,
    );
  }

  const dateCol = map.postedAt!;
  const amountCol = map.amount!;
  const descCol = map.description;
  const catCol = map.category;
  const curCol = map.currency;

  const out: ParsedTransactionRow[] = [];

  for (let r = 1; r < records.length; r++) {
    if (out.length >= maxRows) {
      throw new Error(
        `CSV exceeds max row limit (${maxRows}). Increase WORKER_MAX_CSV_ROWS if needed.`,
      );
    }

    const row = records[r]!;
    const dateRaw = row[dateCol] ?? '';
    const amountRaw = row[amountCol] ?? '';

    if (!dateRaw.trim() && !amountRaw.trim()) {
      continue;
    }

    const postedAt = parseDateCell(dateRaw);
    if (!postedAt) {
      throw new Error(`Row ${r + 1}: invalid date "${dateRaw}"`);
    }

    const amount = parseAmountCell(amountRaw);
    if (!amount) {
      throw new Error(`Row ${r + 1}: invalid amount "${amountRaw}"`);
    }

    const description =
      descCol !== undefined ? (row[descCol]?.trim() || null) : null;
    const category =
      catCol !== undefined ? (row[catCol]?.trim() || null) : null;
    const currencyRaw =
      curCol !== undefined ? row[curCol]?.trim() : undefined;
    const currency =
      currencyRaw && currencyRaw.length > 0
        ? currencyRaw.toUpperCase().slice(0, 8)
        : 'USD';

    out.push({
      postedAt,
      amount,
      description,
      category,
      currency,
      rowIndex: r - 1,
    });
  }

  if (out.length === 0) {
    throw new Error('No data rows found after the header.');
  }

  return out;
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}
