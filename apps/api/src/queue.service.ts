import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { INGEST_DOCUMENT_JOB, DOCUMENT_QUEUE_NAME } from './queue.constants';

@Injectable()
export class QueueService implements OnModuleInit {
  private queue!: Queue;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required');
    }

    this.queue = new Queue(DOCUMENT_QUEUE_NAME, {
      connection: { url: redisUrl },
    });
  }

  async enqueueDocumentIngestion(documentId: string, storageKey: string) {
    return this.queue.add(
      INGEST_DOCUMENT_JOB,
      { documentId, storageKey },
      {
        jobId: `doc-${documentId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }
}

