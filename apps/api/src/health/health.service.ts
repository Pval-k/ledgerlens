import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async readiness() {
    const startedAt = Date.now();
    let dbOk = false;
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      dbError = err instanceof Error ? err.message : String(err);
    }

    let queueOk = false;
    let queueError: string | undefined;
    let queueMetrics:
      | Awaited<ReturnType<QueueService['getQueueMetrics']>>
      | undefined;
    try {
      queueMetrics = await this.queue.getQueueMetrics();
      queueOk = true;
    } catch (err) {
      queueError = err instanceof Error ? err.message : String(err);
    }

    const ok = dbOk && queueOk;
    return {
      ok,
      durationMs: Date.now() - startedAt,
      checks: {
        db: dbOk ? { ok: true } : { ok: false, error: dbError },
        queue: queueOk
          ? { ok: true, metrics: queueMetrics }
          : { ok: false, error: queueError },
      },
    };
  }

  async metrics() {
    const queueMetrics = await this.queue.getQueueMetrics();
    const mem = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      process: {
        uptimeSec: Math.round(process.uptime()),
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      queue: queueMetrics,
    };
  }
}
