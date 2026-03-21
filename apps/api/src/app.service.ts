import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { safeStorageBasename } from './filename.util';
import { PrismaService } from './prisma.service';
import { QueueService } from './queue.service';
import { StorageService } from './storage.service';

export type UploadSessionBody = {
  originalFilename?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
};

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  listDocuments() {
    return this.prisma.listDocuments();
  }

  async createUploadSession(body: UploadSessionBody) {
    const originalFilename =
      body.originalFilename?.trim() || 'untitled.csv';
    const id = randomUUID();
    const storageKey = `documents/${id}/${safeStorageBasename(originalFilename)}`;

    const document = await this.prisma.createUploadSession({
      id,
      originalFilename,
      storageKey,
      contentType: body.contentType?.trim() || null,
      sizeBytes:
        typeof body.sizeBytes === 'number' && Number.isFinite(body.sizeBytes)
          ? Math.trunc(body.sizeBytes)
          : null,
      sha256: body.sha256?.trim().toLowerCase() || null,
    });

    const { uploadUrl, expiresIn } = await this.storage.presignedPutUrl(
      storageKey,
      {
        contentType: document.contentType ?? undefined,
      },
    );

    const headers: Record<string, string> = {};
    if (document.contentType) {
      headers['Content-Type'] = document.contentType;
    }

    return {
      documentId: document.id,
      uploadUrl,
      method: 'PUT' as const,
      expiresIn,
      headers,
    };
  }

  async completeUpload(documentId: string) {
    const document = await this.prisma.getDocumentById(documentId);
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    let head;
    try {
      head = await this.storage.headObject(document.storageKey);
    } catch (err) {
      if (err instanceof Error && err.message === 'OBJECT_NOT_FOUND') {
        throw new BadRequestException(
          'Object not found in storage; upload the file to the presigned URL first.',
        );
      }
      throw err;
    }

    if (head.contentLength <= 0) {
      throw new BadRequestException('Uploaded object is empty.');
    }

    await this.prisma.updateDocumentObjectMetadata(documentId, {
      sizeBytes: head.contentLength,
      ...(head.contentType ? { contentType: head.contentType } : {}),
    });

    await this.queue.enqueueDocumentIngestion(
      documentId,
      document.storageKey,
    );

    return {
      ok: true as const,
      documentId,
      sizeBytes: head.contentLength,
      contentType: head.contentType ?? document.contentType,
    };
  }

  async getDocumentStatus(documentId: string) {
    const document = await this.prisma.getDocumentById(documentId);
    if (!document) {
      return { ok: false as const, message: 'Document not found' };
    }

    return {
      ok: true as const,
      documentId: document.id,
      status: document.status,
      storageKey: document.storageKey,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}
