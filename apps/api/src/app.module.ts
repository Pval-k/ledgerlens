import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    StorageModule,
    DocumentsModule,
    AnalyticsModule,
    HealthModule,
  ],
})
export class AppModule {}
