import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
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

  listDocuments() {
    return this.document.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  createDocument(originalFilename: string) {
    return this.document.create({
      data: {
        originalFilename,
      },
    });
  }

  getDocumentById(id: string) {
    return this.document.findUnique({
      where: { id },
    });
  }

  updateDocumentStatus(id: string, status: string) {
    return this.document.update({
      where: { id },
      data: { status },
    });
  }
}

