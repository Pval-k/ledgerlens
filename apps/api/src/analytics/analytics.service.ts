import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const YM = /^\d{4}-\d{2}$/;

function parseYearMonth(
  label: 'from' | 'to',
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!YM.test(value)) {
    throw new BadRequestException(`${label} must be YYYY-MM (UTC month bucket)`);
  }
  return value;
}

function serializeSummaryRow<
  T extends {
    netAmount: Prisma.Decimal;
    incomeTotal: Prisma.Decimal;
    expenseTotal: Prisma.Decimal;
  },
>(row: T) {
  return {
    ...row,
    netAmount: row.netAmount.toString(),
    incomeTotal: row.incomeTotal.toString(),
    expenseTotal: row.expenseTotal.toString(),
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureDocument(documentId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
  }

  async listMonthly(
    documentId: string,
    query: { from?: string; to?: string; page: number; limit: number },
  ) {
    await this.ensureDocument(documentId);

    const from = parseYearMonth('from', query.from);
    const to = parseYearMonth('to', query.to);
    if (from && to && from > to) {
      throw new BadRequestException('from must be <= to');
    }

    const where: Prisma.DocumentMonthlySummaryWhereInput = { documentId };
    if (from || to) {
      where.yearMonth = {};
      if (from) where.yearMonth.gte = from;
      if (to) where.yearMonth.lte = to;
    }

    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.documentMonthlySummary.count({ where }),
      this.prisma.documentMonthlySummary.findMany({
        where,
        orderBy: [{ yearMonth: 'desc' }, { currency: 'asc' }],
        skip,
        take: query.limit,
        select: {
          yearMonth: true,
          currency: true,
          netAmount: true,
          incomeTotal: true,
          expenseTotal: true,
          transactionCount: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      documentId,
      page: query.page,
      limit: query.limit,
      total,
      items: items.map(serializeSummaryRow),
    };
  }

  async listByCategory(
    documentId: string,
    query: {
      from?: string;
      to?: string;
      page: number;
      limit: number;
      category?: string;
    },
  ) {
    await this.ensureDocument(documentId);

    const from = parseYearMonth('from', query.from);
    const to = parseYearMonth('to', query.to);
    if (from && to && from > to) {
      throw new BadRequestException('from must be <= to');
    }

    const where: Prisma.CategoryMonthlySummaryWhereInput = { documentId };
    if (from || to) {
      where.yearMonth = {};
      if (from) where.yearMonth.gte = from;
      if (to) where.yearMonth.lte = to;
    }
    if (query.category !== undefined) {
      where.categoryKey = query.category;
    }

    const skip = (query.page - 1) * query.limit;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.categoryMonthlySummary.count({ where }),
      this.prisma.categoryMonthlySummary.findMany({
        where,
        orderBy: [
          { yearMonth: 'desc' },
          { categoryKey: 'asc' },
          { currency: 'asc' },
        ],
        skip,
        take: query.limit,
        select: {
          yearMonth: true,
          categoryKey: true,
          currency: true,
          netAmount: true,
          incomeTotal: true,
          expenseTotal: true,
          transactionCount: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      documentId,
      page: query.page,
      limit: query.limit,
      total,
      items: items.map(serializeSummaryRow),
    };
  }
}
