import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const DOCUMENT_QUEUE_NAME = 'document-processing';
const INGEST_DOCUMENT_JOB = 'INGEST_DOCUMENT';

type IngestJobData = {
  documentId: string;
};

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error('REDIS_URL is required');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const worker = new Worker<IngestJobData>(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    if (job.name !== INGEST_DOCUMENT_JOB) {
      return;
    }

    const { documentId } = job.data;
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING' },
    });

    // Simulate async ingestion work.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'COMPLETED' },
    });
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
    await prisma.document.update({
      where: { id: job.data.documentId },
      data: { status: 'FAILED' },
    });
  }
  console.error('[worker] job failed', err);
});

