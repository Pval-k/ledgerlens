import { createServer } from 'node:http';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const ingestJobDurationSeconds = new Histogram({
  name: 'ingest_job_duration_seconds',
  help: 'Wall time to download, parse, persist transactions, and rebuild summaries',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

export const ingestJobsTotal = new Counter({
  name: 'ingest_jobs_total',
  help: 'Ingest job completions by outcome',
  labelNames: ['status'] as const,
  registers: [register],
});

export function startMetricsServer(port: number): void {
  const server = createServer(async (req, res) => {
    if (req.url === '/metrics' && req.method === 'GET') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
      return;
    }
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => {
    console.log(`[worker] metrics listening on :${port}/metrics`);
  });
}
