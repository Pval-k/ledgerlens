import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHello(): string {
    return 'Hello World!';
  }

  /** Liveness endpoint for load balancers and quick checks. */
  @Get('health/live')
  live() {
    return { ok: true, status: 'live' as const };
  }

  /** Readiness endpoint checks database + queue reachability. */
  @Get('health/ready')
  async ready() {
    return this.health.readiness();
  }

  /** Lightweight JSON metrics for ad-hoc SLO tracking and debugging. */
  @Get('health/metrics')
  async metrics() {
    return this.health.metrics();
  }
}
