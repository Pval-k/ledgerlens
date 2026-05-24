import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [QueueModule],
  controllers: [MetricsController],
  providers: [MetricsService, HttpMetricsMiddleware],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HttpMetricsMiddleware)
      .exclude('metrics', 'health/live', 'health/ready')
      .forRoutes('*');
  }
}
