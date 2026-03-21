import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

/** Return shape for status + transaction count (explicit so `ingestError` is always typed). */
export type DocumentWithTransactionCount = Prisma.DocumentGetPayload<{
  select: {
    id: true;
    originalFilename: true;
    storageKey: true;
    contentType: true;
    sizeBytes: true;
    sha256: true;
    status: true;
    ingestError: true;
    createdAt: true;
    updatedAt: true;
    _count: { select: { transactions: true } };
  };
}>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  listDocuments(userId: string) {
    return this.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createUploadSession(data: {
    userId: string;
    id: string;
    originalFilename: string;
    storageKey: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
  }) {
    return this.document.create({
      data: {
        userId: data.userId,
        id: data.id,
        originalFilename: data.originalFilename,
        storageKey: data.storageKey,
        contentType: data.contentType ?? undefined,
        sizeBytes: data.sizeBytes ?? undefined,
        sha256: data.sha256 ?? undefined,
      },
    });
  }

  findDocumentForUser(id: string, userId: string) {
    return this.document.findFirst({
      where: { id, userId },
    });
  }

  getDocumentByIdWithTransactionCount(
    id: string,
    userId: string,
  ): Promise<DocumentWithTransactionCount | null> {
    return this.document.findFirst({
      where: { id, userId },
      select: {
        id: true,
        originalFilename: true,
        storageKey: true,
        contentType: true,
        sizeBytes: true,
        sha256: true,
        status: true,
        ingestError: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { transactions: true } },
      },
    });
  }

  listTransactionsForDocument(
    documentId: string,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;
    return this.$transaction([
      this.transaction.count({ where: { documentId } }),
      this.transaction.findMany({
        where: { documentId },
        orderBy: [{ postedAt: 'desc' }, { rowIndex: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          postedAt: true,
          amount: true,
          currency: true,
          description: true,
          category: true,
          rowIndex: true,
        },
      }),
    ]);
  }

  updateDocumentStatus(id: string, status: string) {
    return this.document.update({
      where: { id },
      data: { status },
    });
  }

  updateDocumentObjectMetadata(
    id: string,
    data: { sizeBytes: number; contentType?: string },
  ) {
    return this.document.update({
      where: { id },
      data: {
        sizeBytes: data.sizeBytes,
        ...(data.contentType ? { contentType: data.contentType } : {}),
      },
    });
  }
}
