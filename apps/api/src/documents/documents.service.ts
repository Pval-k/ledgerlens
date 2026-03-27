import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { DocumentWithTransactionCount } from '../prisma/prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { safeStorageBasename } from './filename.util';

export type UploadSessionBody = {
  originalFilename?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
};

function hashFingerprint(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly queue: QueueService,
    private readonly storage: StorageService,
  ) {}

  listDocuments(userId: string) {
    return this.prisma.listDocuments(userId);
  }

  async createUploadSession(
    userId: string,
    body: UploadSessionBody,
    idempotencyKey?: string,
  ) {
    const normalizedBody = {
      originalFilename: body.originalFilename?.trim() || 'untitled.csv',
      contentType: body.contentType?.trim() || null,
      sizeBytes:
        typeof body.sizeBytes === 'number' && Number.isFinite(body.sizeBytes)
          ? Math.trunc(body.sizeBytes)
          : null,
      sha256: body.sha256?.trim().toLowerCase() || null,
    };
    const fingerprint = hashFingerprint({
      route: 'upload-session',
      userId,
      ...normalizedBody,
    });

    return this.idempotency.runOrReplay(
      idempotencyKey,
      `documents:upload-session:${userId}`,
      fingerprint,
      async () => {
        const id = randomUUID();
        const storageKey = `documents/${id}/${safeStorageBasename(normalizedBody.originalFilename)}`;

        const document = await this.prisma.createUploadSession({
          userId,
          id,
          originalFilename: normalizedBody.originalFilename,
          storageKey,
          contentType: normalizedBody.contentType,
          sizeBytes: normalizedBody.sizeBytes,
          sha256: normalizedBody.sha256,
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
      },
    );
  }

  async completeUpload(
    userId: string,
    documentId: string,
    idempotencyKey?: string,
  ) {
    const fingerprint = hashFingerprint({
      route: 'complete-upload',
      userId,
      documentId,
    });

    return this.idempotency.runOrReplay(
      idempotencyKey,
      `documents:complete-upload:${userId}:${documentId}`,
      fingerprint,
      async () => {
        const document = await this.prisma.findDocumentForUser(
          documentId,
          userId,
        );
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
      },
    );
  }

  async getDocumentStatus(userId: string, documentId: string) {
    const document: DocumentWithTransactionCount | null =
      await this.prisma.getDocumentByIdWithTransactionCount(
        documentId,
        userId,
      );
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return {
      ok: true as const,
      documentId: document.id,
      originalFilename: document.originalFilename,
      status: document.status,
      storageKey: document.storageKey,
      contentType: document.contentType,
      sizeBytes: document.sizeBytes,
      transactionCount: document._count.transactions,
      ingestError: document.ingestError,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  async getDocumentDownloadUrl(userId: string, documentId: string) {
    const document = await this.prisma.findDocumentForUser(
      documentId,
      userId,
    );
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    const { url, expiresIn } = await this.storage.presignedGetUrl(
      document.storageKey,
      {
        downloadFilename: document.originalFilename || 'document.csv',
      },
    );
    return {
      url,
      expiresIn,
      filename: document.originalFilename ?? 'document.csv',
    };
  }

  async listTransactions(
    userId: string,
    documentId: string,
    query: { page: number; limit: number },
  ) {
    const document = await this.prisma.findDocumentForUser(
      documentId,
      userId,
    );
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const [total, items] = await this.prisma.listTransactionsForDocument(
      documentId,
      query.page,
      query.limit,
    );

    return {
      documentId,
      page: query.page,
      limit: query.limit,
      total,
      items: items.map((row) => ({
        ...row,
        amount: row.amount.toString(),
      })),
    };
  }

  /**
   * Removes the document row (cascades transactions + summaries). Deletes the object in
   * MinIO/S3 first when possible; storage failures are logged but do not block DB deletion.
   */
  async deleteDocument(userId: string, documentId: string) {
    const document = await this.prisma.findDocumentForUser(
      documentId,
      userId,
    );
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    try {
      await this.storage.deleteObject(document.storageKey);
    } catch (err) {
      console.warn(
        `[documents] deleteObject failed for ${document.storageKey}:`,
        err,
      );
    }

    await this.prisma.document.delete({
      where: { id: documentId },
    });
  }
}
