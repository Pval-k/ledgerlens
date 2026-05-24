import { Prisma } from '@prisma/client';
import { parseLedgerCsv } from './parse-csv';

describe('parseLedgerCsv', () => {
  it('parses minimal date and amount columns', () => {
    const csv = `date,amount
2024-01-15,-12.50
2024-01-16,100.00`;
    const rows = parseLedgerCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.amount.equals(new Prisma.Decimal('-12.5000'))).toBe(true);
    expect(rows[0]!.currency).toBe('USD');
    expect(rows[0]!.rowIndex).toBe(0);
  });

  it('supports header aliases and optional fields', () => {
    const csv = `post_date,value,payee,type,curr
03/20/2024,(45.10),Coffee Shop,Food,usd`;
    const rows = parseLedgerCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount.equals(new Prisma.Decimal('-45.1000'))).toBe(true);
    expect(rows[0]!.description).toBe('Coffee Shop');
    expect(rows[0]!.category).toBe('Food');
    expect(rows[0]!.currency).toBe('USD');
  });

  it('parses currency symbols and thousands separators', () => {
    const csv = `date,amount
2024-03-01,"$1,234.56"`;
    const rows = parseLedgerCsv(csv);
    expect(rows[0]!.amount.equals(new Prisma.Decimal('1234.5600'))).toBe(true);
  });

  it('skips fully empty data rows', () => {
    const csv = `date,amount
2024-01-01,-1.00
,`;
    const rows = parseLedgerCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('throws on missing required columns', () => {
    const csv = `description,memo
foo,bar`;
    expect(() => parseLedgerCsv(csv)).toThrow(/Missing required columns/);
  });

  it('throws on invalid date with row number', () => {
    const csv = `date,amount
not-a-date,10`;
    expect(() => parseLedgerCsv(csv)).toThrow(/Row 2: invalid date/);
  });

  it('throws on invalid amount with row number', () => {
    const csv = `date,amount
2024-01-01,abc`;
    expect(() => parseLedgerCsv(csv)).toThrow(/Row 2: invalid amount/);
  });

  it('enforces max row limit', () => {
    const csv = `date,amount
2024-01-01,1
2024-01-02,2`;
    expect(() => parseLedgerCsv(csv, { maxRows: 1 })).toThrow(/max row limit/);
  });
});
