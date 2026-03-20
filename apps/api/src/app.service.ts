import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async listDocuments() {
    return this.prisma.listDocuments();
  }

  async createDocument(originalFilename: string) {
    return this.prisma.createDocument(originalFilename);
  }

  async enqueueDocument(documentId: string) {
    const existing = await this.prisma.getDocumentById(documentId);
    if (!existing) {
      return { ok: false, message: 'Document not found' };
    }

    await this.queue.enqueueDocumentIngestion(documentId);
    return { ok: true, documentId, status: existing.status };
  }

  async getDocumentStatus(documentId: string) {
    const document = await this.prisma.getDocumentById(documentId);
    if (!document) {
      return { ok: false, message: 'Document not found' };
    }

    return {
      ok: true,
      documentId: document.id,
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
