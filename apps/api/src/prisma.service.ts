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

  createUploadSession(data: {
    id: string;
    originalFilename: string;
    storageKey: string;
    contentType?: string | null;
    sizeBytes?: number | null;
    sha256?: string | null;
  }) {
    return this.document.create({
      data: {
        id: data.id,
        originalFilename: data.originalFilename,
        storageKey: data.storageKey,
        contentType: data.contentType ?? undefined,
        sizeBytes: data.sizeBytes ?? undefined,
        sha256: data.sha256 ?? undefined,
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

