import { Injectable, OnModuleInit } from '@nestjs/common';
import client from 'prom-client';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly register = new client.Registry();

  readonly httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.register],
  });

  readonly ingestEnqueueTotal = new client.Counter({
    name: 'ingest_enqueue_total',
    help: 'Document ingest jobs enqueued after successful upload',
    registers: [this.register],
  });

  readonly queueWaitingJobs = new client.Gauge({
    name: 'bullmq_queue_waiting_jobs',
    help: 'Jobs waiting in the document-processing queue',
    registers: [this.register],
  });

  readonly queueActiveJobs = new client.Gauge({
    name: 'bullmq_queue_active_jobs',
    help: 'Jobs actively processing in the document-processing queue',
    registers: [this.register],
  });

  readonly queueFailedJobs = new client.Gauge({
    name: 'bullmq_queue_failed_jobs',
    help: 'Failed jobs in the document-processing queue',
    registers: [this.register],
  });

  constructor(private readonly queue: QueueService) {}

  onModuleInit() {
    client.collectDefaultMetrics({ register: this.register });
  }

  recordIngestEnqueued() {
    this.ingestEnqueueTotal.inc();
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSec: number,
  ) {
    this.httpRequestDurationSeconds.observe(
      { method, route, status_code: String(statusCode) },
      durationSec,
    );
  }

  async refreshQueueGauges() {
    const counts = await this.queue.getQueueMetrics();
    this.queueWaitingJobs.set(Number(counts.waiting ?? 0));
    this.queueActiveJobs.set(Number(counts.active ?? 0));
    this.queueFailedJobs.set(Number(counts.failed ?? 0));
  }

  async metricsText() {
    await this.refreshQueueGauges();
    return this.register.metrics();
  }
}
