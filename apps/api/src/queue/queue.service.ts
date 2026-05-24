import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DOCUMENT_QUEUE_NAME, INGEST_DOCUMENT_JOB } from './queue.constants';

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

  async getQueueMetrics(): Promise<{
    queueName: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  }> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    return {
      queueName: DOCUMENT_QUEUE_NAME,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
    };
  }
}
