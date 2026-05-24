import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedNs = process.hrtime.bigint() - start;
      const durationSec = Number(elapsedNs) / 1e9;
      const route =
        (req.route as { path?: string } | undefined)?.path ??
        req.path ??
        'unknown';
      this.metrics.observeHttpRequest(
        req.method,
        route,
        res.statusCode,
        durationSec,
      );
    });
    next();
  }
}
