import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * Static USD rates per 1 unit of foreign currency (display / rollup only).
 * When a document uses more than one currency, amounts are converted with this
 * table so month and category charts are on one scale (USD).
 */
const USD_PER_UNIT: Record<string, number> = {
  USD: 1,
  GBP: 1.26,
  EUR: 1.08,
  CAD: 0.74,
  AUD: 0.66,
  CHF: 1.12,
  JPY: 0.0067,
};

function usdPerUnit(code: string): Prisma.Decimal {
  const key = code.trim().toUpperCase();
  const n = USD_PER_UNIT[key];
  return new Prisma.Decimal(n === undefined ? 1 : n);
}

export function yearMonthUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

type Agg = {
  net: Prisma.Decimal;
  income: Prisma.Decimal;
  expense: Prisma.Decimal;
  count: number;
  currency: string;
};

function zeroAgg(currency: string): Agg {
  return {
    net: new Prisma.Decimal(0),
    income: new Prisma.Decimal(0),
    expense: new Prisma.Decimal(0),
    count: 0,
    currency,
  };
}

function addToAgg(agg: Agg, amt: Prisma.Decimal): Agg {
  const incomeDelta = amt.gt(0) ? amt : new Prisma.Decimal(0);
  const expenseDelta = amt.lt(0) ? amt.abs() : new Prisma.Decimal(0);
  return {
    net: agg.net.add(amt),
    income: agg.income.add(incomeDelta),
    expense: agg.expense.add(expenseDelta),
    count: agg.count + 1,
    currency: agg.currency,
  };
}

/**
 * Recomputes materialized monthly + category summaries for one document from `Transaction` rows.
 * Idempotent: deletes prior summary rows for the document, then inserts fresh aggregates.
 */
export async function rebuildDocumentSummaries(
  prisma: PrismaClient,
  documentId: string,
): Promise<void> {
  const rows = await prisma.transaction.findMany({
    where: { documentId },
    select: {
      postedAt: true,
      amount: true,
      category: true,
      currency: true,
    },
  });

  await prisma.documentMonthlySummary.deleteMany({ where: { documentId } });
  await prisma.categoryMonthlySummary.deleteMany({ where: { documentId } });

  if (rows.length === 0) {
    return;
  }

  const distinctCurrencies = new Set(
    rows.map((r) => (r.currency?.trim() || 'USD').toUpperCase()),
  );
  const normalizeToUsd = distinctCurrencies.size > 1;
  const summaryCurrency = normalizeToUsd ? 'USD' : [...distinctCurrencies][0]!;

  const monthly = new Map<string, Agg>();
  const byCategory = new Map<string, Agg>();

  for (const row of rows) {
    const ym = yearMonthUtc(row.postedAt);
    const curRaw = row.currency?.trim() || 'USD';
    const cur = curRaw.toUpperCase();
    const catKey = row.category?.trim() ?? '';
    let amt = new Prisma.Decimal(row.amount);
    if (normalizeToUsd) {
      amt = amt.mul(usdPerUnit(cur));
    }

    const mkMonth = `${ym}|${summaryCurrency}`;
    const mkCat = `${ym}|${summaryCurrency}|${catKey}`;

    monthly.set(
      mkMonth,
      addToAgg(monthly.get(mkMonth) ?? zeroAgg(summaryCurrency), amt),
    );
    byCategory.set(
      mkCat,
      addToAgg(byCategory.get(mkCat) ?? zeroAgg(summaryCurrency), amt),
    );
  }

  const monthRows = [...monthly.entries()].map(([key, agg]) => {
    const sep = key.indexOf('|');
    const yearMonth = key.slice(0, sep);
    const currency = key.slice(sep + 1);
    return {
      id: randomUUID(),
      documentId,
      yearMonth,
      currency,
      netAmount: agg.net,
      incomeTotal: agg.income,
      expenseTotal: agg.expense,
      transactionCount: agg.count,
    };
  });

  const catRows = [...byCategory.entries()].map(([key, agg]) => {
    const sep = key.indexOf('|');
    const sep2 = key.indexOf('|', sep + 1);
    const yearMonth = key.slice(0, sep);
    const currency = key.slice(sep + 1, sep2);
    const categoryKey = key.slice(sep2 + 1);
    return {
      id: randomUUID(),
      documentId,
      yearMonth,
      currency,
      categoryKey,
      netAmount: agg.net,
      incomeTotal: agg.income,
      expenseTotal: agg.expense,
      transactionCount: agg.count,
    };
  });

  const CHUNK = 500;
  for (let i = 0; i < monthRows.length; i += CHUNK) {
    await prisma.documentMonthlySummary.createMany({
      data: monthRows.slice(i, i + CHUNK),
    });
  }
  for (let i = 0; i < catRows.length; i += CHUNK) {
    await prisma.categoryMonthlySummary.createMany({
      data: catRows.slice(i, i + CHUNK),
    });
  }
}
