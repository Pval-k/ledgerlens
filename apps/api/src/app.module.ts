import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';

const isTest =
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isProd = process.env.NODE_ENV === 'production';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: isTest ? 'silent' : isProd ? 'info' : 'debug',
        ...(isTest || isProd
          ? {}
          : {
              transport: {
                target: 'pino-pretty',
                options: { singleLine: true },
              },
            }),
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    QueueModule,
    StorageModule,
    DocumentsModule,
    AnalyticsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
