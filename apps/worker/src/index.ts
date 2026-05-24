import 'dotenv/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Queue, Worker } from 'bullmq';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { processIngestDocument } from './ingest-document';
import { startMetricsServer } from './metrics';

const DOCUMENT_QUEUE_NAME = 'document-processing';
const INGEST_DOCUMENT_JOB = 'INGEST_DOCUMENT';

type IngestJobData = {
  documentId: string;
  storageKey?: string;
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

const metricsPort = Number(process.env.WORKER_METRICS_PORT ?? 9091);
startMetricsServer(metricsPort);

const worker = new Worker<IngestJobData>(
  DOCUMENT_QUEUE_NAME,
  async (job) => {
    if (job.name !== INGEST_DOCUMENT_JOB) {
      return;
    }

    const { documentId, storageKey: storageKeyFromJob } = job.data;
    const result = await processIngestDocument({
      prisma,
      s3,
      bucket: s3Env.bucket,
      documentId,
      storageKeyFromJob,
    });
    console.log(
      `[worker] stored ${result.rowCount} transactions for document ${documentId}`,
    );
  },
  {
    connection: { url: redisUrl },
  },
);

const queueMetrics = new Queue(DOCUMENT_QUEUE_NAME, {
  connection: { url: redisUrl },
});

const metrics = {
  processed: 0,
  succeeded: 0,
  failed: 0,
  retried: 0,
  totalProcessingMs: 0,
  maxProcessingMs: 0,
};

function avgProcessingMs(): number {
  if (metrics.succeeded === 0) return 0;
  return Math.round(metrics.totalProcessingMs / metrics.succeeded);
}

async function logQueueMetrics() {
  const counts = await queueMetrics.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
  console.log('[worker][metrics]', {
    queue: DOCUMENT_QUEUE_NAME,
    counts,
    processed: metrics.processed,
    succeeded: metrics.succeeded,
    failed: metrics.failed,
    retried: metrics.retried,
    avgProcessingMs: avgProcessingMs(),
    maxProcessingMs: metrics.maxProcessingMs,
  });
}

worker.on('ready', () => {
  console.log('[worker] connected and ready');
});

worker.on('completed', (job) => {
  metrics.processed += 1;
  metrics.succeeded += 1;
  const start = job.processedOn ?? job.timestamp;
  const end = job.finishedOn ?? Date.now();
  const durationMs = Math.max(0, end - start);
  metrics.totalProcessingMs += durationMs;
  metrics.maxProcessingMs = Math.max(metrics.maxProcessingMs, durationMs);
  if (job.attemptsMade > 1) {
    metrics.retried += 1;
  }
  console.log(`[worker] completed job ${job.id}`, {
    durationMs,
    attemptsMade: job.attemptsMade,
  });
});

worker.on('failed', async (job, err) => {
  metrics.processed += 1;
  metrics.failed += 1;
  if (job && job.attemptsMade > 1) {
    metrics.retried += 1;
  }
  console.error('[worker] job failed', err);
});

setInterval(() => {
  void logQueueMetrics().catch((err) => {
    console.error('[worker] failed to emit metrics', err);
  });
}, 30_000);
