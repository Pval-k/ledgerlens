import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
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

