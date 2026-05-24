import { randomUUID } from 'node:crypto';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { rebuildDocumentSummaries } from './aggregate-summaries';
import {
  ingestJobDurationSeconds,
  ingestJobsTotal,
} from './metrics';
import { bytesToUtf8, parseLedgerCsv } from './parse-csv';

export const CREATE_MANY_CHUNK = 2000;

/** `prisma.transaction` model delegate — explicit for TS when using `@prisma/adapter-pg`. */
export type LedgerTransactionDelegate = {
  deleteMany: (args: {
    where: { documentId: string };
  }) => Prisma.PrismaPromise<Prisma.BatchPayload>;
  createMany: (args: {
    data: Array<{
      id: string;
      documentId: string;
      postedAt: Date;
      amount: Prisma.Decimal;
      currency: string;
      description: string | null;
      category: string | null;
      rowIndex: number;
    }>;
  }) => Prisma.PrismaPromise<Prisma.BatchPayload>;
};

export type ProcessIngestParams = {
  prisma: PrismaClient;
  s3: S3Client;
  bucket: string;
  documentId: string;
  storageKeyFromJob?: string;
};

async function downloadFromStorage(
  s3: S3Client,
  bucket: string,
  storageKey: string,
): Promise<Uint8Array> {
  const out: GetObjectCommandOutput = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  );
  if (!out.Body) {
    throw new Error('S3 GetObject returned empty body');
  }
  return out.Body.transformToByteArray();
}

/**
 * Downloads CSV from object storage, parses rows, writes transactions + summaries.
 * Used by the BullMQ worker and by API e2e tests (direct invoke, no queue).
 */
export async function processIngestDocument(
  params: ProcessIngestParams,
): Promise<{ rowCount: number }> {
  const { prisma, s3, bucket, documentId, storageKeyFromJob } = params;
  const endTimer = ingestJobDurationSeconds.startTimer();

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const storageKey = storageKeyFromJob ?? document.storageKey;
    if (storageKeyFromJob && storageKeyFromJob !== document.storageKey) {
      throw new Error('Job storageKey does not match document.storageKey');
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PROCESSING',
        ingestError: null,
      } as Prisma.DocumentUpdateInput,
    });

    const bytes = await downloadFromStorage(s3, bucket, storageKey);
    const text = bytesToUtf8(bytes);
    const parsed = parseLedgerCsv(text);

    const ledger = (prisma as unknown as { transaction: LedgerTransactionDelegate })
      .transaction;
    const steps: Prisma.PrismaPromise<unknown>[] = [
      ledger.deleteMany({ where: { documentId } }),
    ];

    for (let i = 0; i < parsed.length; i += CREATE_MANY_CHUNK) {
      const chunk = parsed.slice(i, i + CREATE_MANY_CHUNK);
      steps.push(
        ledger.createMany({
          data: chunk.map((row) => ({
            id: randomUUID(),
            documentId,
            postedAt: row.postedAt,
            amount: row.amount,
            currency: row.currency,
            description: row.description,
            category: row.category,
            rowIndex: row.rowIndex,
          })),
        }),
      );
    }

    steps.push(
      prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'COMPLETED',
          ingestError: null,
        } as Prisma.DocumentUpdateInput,
      }),
    );

    await prisma.$transaction(steps);
    await rebuildDocumentSummaries(prisma, documentId);

    endTimer({ status: 'success' });
    ingestJobsTotal.inc({ status: 'success' });
    return { rowCount: parsed.length };
  } catch (err) {
    endTimer({ status: 'error' });
    ingestJobsTotal.inc({ status: 'error' });
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.document
      .update({
        where: { id: documentId },
        data: {
          status: 'FAILED',
          ingestError: msg.slice(0, 8000),
        } as Prisma.DocumentUpdateInput,
      })
      .catch(() => undefined);
    throw err;
  }
}
