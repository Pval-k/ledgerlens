import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Prisma } from '@prisma/client';
import { Worker } from 'bullmq';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { bytesToUtf8, parseLedgerCsv } from './parse-csv';

const DOCUMENT_QUEUE_NAME = 'document-processing';
const INGEST_DOCUMENT_JOB = 'INGEST_DOCUMENT';
const CREATE_MANY_CHUNK = 2000;

type IngestJobData = {
  documentId: string;
  /** Present for jobs enqueued after object-storage rollout; older jobs omit it. */
  storageKey?: string;
};

/** `prisma.transaction` model delegate — explicit for TS when using `@prisma/adapter-pg` (generated client omits `.transaction` on the adapter client type). */
type LedgerTransactionDelegate = {
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

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

function readS3Env() {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
  const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET ?? process.env.AWS_BUCKET_NAME;
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'S3/MinIO env required: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET',
    );
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle,
  };
}

const s3Env = readS3Env();
const s3 = new S3Client({
  region: s3Env.region,
  endpoint: s3Env.endpoint,
  credentials: {
    accessKeyId: s3Env.accessKeyId,
    secretAccessKey: s3Env.secretAccessKey,
  },
  forcePathStyle: s3Env.forcePathStyle,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function downloadFromStorage(storageKey: string): Promise<Uint8Array> {
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: s3Env.bucket,
      Key: storageKey,
    }),
  );
  if (!out.Body) {
    throw new Error('S3 GetObject returned empty body');
  }
  return out.Body.transformToByteArray();
}

const worker = new Worker<IngestJobData>(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    if (job.name !== INGEST_DOCUMENT_JOB) {
      return;
    }

    const { documentId, storageKey: storageKeyFromJob } = job.data;

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const storageKey = storageKeyFromJob ?? document.storageKey;
    if (
      storageKeyFromJob &&
      storageKeyFromJob !== document.storageKey
    ) {
      throw new Error('Job storageKey does not match document.storageKey');
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'PROCESSING',
        ingestError: null,
      } as Prisma.DocumentUpdateInput,
    });

    const bytes = await downloadFromStorage(storageKey);
    const text = bytesToUtf8(bytes);
    console.log(
      `[worker] downloaded ${bytes.byteLength} bytes for document ${documentId}`,
    );

    const parsed = parseLedgerCsv(text);

    // `Transaction` model delegate — runtime is `prisma.transaction`. `@prisma/adapter-pg` typings omit it; cast is intentional.
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

    console.log(
      `[worker] stored ${parsed.length} transactions for document ${documentId}`,
    );
  },
  {
    connection: { url: redisUrl },
  },
);

worker.on('ready', () => {
  console.log('[worker] connected and ready');
});

worker.on('completed', (job) => {
  console.log(`[worker] completed job ${job.id}`);
});

worker.on('failed', async (job, err) => {
  if (job?.data?.documentId) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.document.update({
      where: { id: job.data.documentId },
      data: {
        status: 'FAILED',
        ingestError: msg.slice(0, 8000),
      } as Prisma.DocumentUpdateInput,
    });
  }
  console.error('[worker] job failed', err);
});
