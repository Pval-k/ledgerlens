import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';
import { processIngestDocument } from '../../worker/src/ingest-document';

loadEnv({ path: resolve(__dirname, '../.env') });

const SAMPLE_CSV = readFileSync(
  resolve(__dirname, '../../../docs/samples/sample-iso-datetime-utc.csv'),
  'utf8',
);

function s3ClientFromEnv(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  });
}

describe('Ingest pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-jwt-secret-test';
    process.env.DATABASE_URL ??=
      process.env.E2E_DATABASE_URL ??
      'postgresql://user:password@127.0.0.1:5432/ledgerlens';
    process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
    process.env.S3_ENDPOINT ??= 'http://127.0.0.1:9000';
    process.env.S3_ACCESS_KEY_ID ??= 'minioadmin';
    process.env.S3_SECRET_ACCESS_KEY ??= 'minioadmin';
    process.env.S3_BUCKET ??= 'ledgerlens';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.get(StorageService).ensureBucket();
  });

  afterEach(async () => {
    if (app) {
      try {
        const prisma = app.get(PrismaService);
        await prisma.user.deleteMany({
          where: { email: { endsWith: '@ingest-e2e.test' } },
        });
      } catch {
        /* ignore */
      }
      await app.close();
    }
  });

  it('signup → upload → ingest → analytics', async () => {
    const email = `ingest.${Date.now()}@ingest-e2e.test`;
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        name: 'Ingest Tester',
        email,
        password: 'password12',
        passwordConfirm: 'password12',
      })
      .expect(201);

    const token = signup.body.accessToken as string;

    const session = await request(app.getHttpServer())
      .post('/documents/upload-session')
      .set('Authorization', `Bearer ${token}`)
      .send({
        originalFilename: 'sample-iso-datetime-utc.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    const documentId = session.body.documentId as string;
    const uploadUrl = session.body.uploadUrl as string;

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/csv',
        ...(session.body.headers as Record<string, string>),
      },
      body: SAMPLE_CSV,
    });
    expect(putRes.ok).toBe(true);

    await request(app.getHttpServer())
      .post(`/documents/${documentId}/complete-upload`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const prisma = app.get(PrismaService);
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    expect(doc?.storageKey).toBeTruthy();

    const result = await processIngestDocument({
      prisma,
      s3: s3ClientFromEnv(),
      bucket: process.env.S3_BUCKET!,
      documentId,
      storageKeyFromJob: doc!.storageKey,
    });
    expect(result.rowCount).toBe(3);

    const status = await request(app.getHttpServer())
      .get(`/documents/${documentId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(status.body.status).toBe('COMPLETED');
    expect(status.body.transactionCount).toBe(3);

    const monthly = await request(app.getHttpServer())
      .get(`/documents/${documentId}/analytics/monthly`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(monthly.body.items.length).toBeGreaterThan(0);

    const byCategory = await request(app.getHttpServer())
      .get(`/documents/${documentId}/analytics/by-category`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(byCategory.body.items.length).toBeGreaterThan(0);
    const hasIncome = byCategory.body.items.some(
      (r: { categoryKey: string; incomeTotal: string }) =>
        r.categoryKey === 'Income' && parseFloat(r.incomeTotal) > 0,
    );
    expect(hasIncome).toBe(true);
  }, 60_000);
});
