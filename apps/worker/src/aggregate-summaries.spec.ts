import { Prisma } from '@prisma/client';
import { rebuildDocumentSummaries, yearMonthUtc } from './aggregate-summaries';

describe('yearMonthUtc', () => {
  it('formats UTC year-month', () => {
    const d = new Date('2024-04-10T23:59:59.000Z');
    expect(yearMonthUtc(d)).toBe('2024-04');
  });
});

describe('rebuildDocumentSummaries', () => {
  it('aggregates income and expense per category', async () => {
    const rows = [
      {
        postedAt: new Date('2024-06-01T12:00:00.000Z'),
        amount: new Prisma.Decimal('-50.00'),
        category: 'Food',
        currency: 'USD',
      },
      {
        postedAt: new Date('2024-06-15T12:00:00.000Z'),
        amount: new Prisma.Decimal('2000.00'),
        category: 'Income',
        currency: 'USD',
      },
    ];

    const monthCreates: unknown[] = [];
    const catCreates: unknown[] = [];

    const prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
      documentMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          monthCreates.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
      categoryMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          catCreates.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    };

    await rebuildDocumentSummaries(prisma as never, 'doc-1');

    const food = (catCreates as { categoryKey: string; expenseTotal: Prisma.Decimal; incomeTotal: Prisma.Decimal }[]).find(
      (r) => r.categoryKey === 'Food',
    );
    const income = (catCreates as { categoryKey: string; expenseTotal: Prisma.Decimal; incomeTotal: Prisma.Decimal }[]).find(
      (r) => r.categoryKey === 'Income',
    );
    expect(food?.expenseTotal.equals(new Prisma.Decimal('50.00'))).toBe(true);
    expect(food?.incomeTotal.equals(new Prisma.Decimal('0'))).toBe(true);
    expect(income?.incomeTotal.equals(new Prisma.Decimal('2000.00'))).toBe(true);

    const month = (monthCreates as { expenseTotal: Prisma.Decimal; incomeTotal: Prisma.Decimal }[])[0];
    expect(month?.expenseTotal.equals(new Prisma.Decimal('50.00'))).toBe(true);
    expect(month?.incomeTotal.equals(new Prisma.Decimal('2000.00'))).toBe(true);
  });

  it('converts mixed currencies to USD summaries', async () => {
    const rows = [
      {
        postedAt: new Date('2024-04-01T12:00:00.000Z'),
        amount: new Prisma.Decimal('-100.00'),
        category: 'Travel',
        currency: 'GBP',
      },
      {
        postedAt: new Date('2024-04-10T12:00:00.000Z'),
        amount: new Prisma.Decimal('-50.00'),
        category: 'Food',
        currency: 'EUR',
      },
    ];

    const catCreates: {
      currency: string;
      categoryKey: string;
      expenseTotal: Prisma.Decimal;
    }[] = [];
    const prisma = {
      transaction: { findMany: jest.fn().mockResolvedValue(rows) },
      documentMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      categoryMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          catCreates.push(...data);
          return Promise.resolve({ count: data.length });
        }),
      },
    };

    await rebuildDocumentSummaries(prisma as never, 'doc-mc');

    expect(catCreates.every((r) => r.currency === 'USD')).toBe(true);
    const travel = catCreates.find((r) => r.categoryKey === 'Travel');
    // 100 GBP * 1.26 = 126 USD expense magnitude
    expect(travel?.expenseTotal.equals(new Prisma.Decimal('126.00'))).toBe(true);
  });

  it('deletes prior summaries before insert (idempotent rebuild)', async () => {
    const prisma = {
      transaction: { findMany: jest.fn().mockResolvedValue([]) },
      documentMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn(),
      },
      categoryMonthlySummary: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
        createMany: jest.fn(),
      },
    };

    await rebuildDocumentSummaries(prisma as never, 'doc-empty');
    expect(prisma.documentMonthlySummary.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-empty' },
    });
    expect(prisma.categoryMonthlySummary.deleteMany).toHaveBeenCalled();
    expect(prisma.documentMonthlySummary.createMany).not.toHaveBeenCalled();
  });
});
