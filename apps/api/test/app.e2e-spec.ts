import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Prefer `apps/api/.env` so local DATABASE_URL is used; fallback for CI. */
loadEnv({ path: resolve(__dirname, '../.env') });

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'e2e-jwt-secret-test';
    process.env.DATABASE_URL ??=
      process.env.E2E_DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:5432/ledgerlens_test';
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
  });

  afterEach(async () => {
    if (app) {
      try {
        const prisma = app.get(PrismaService);
        await prisma.user.deleteMany({
          where: { email: { endsWith: '@e2e.test' } },
        });
      } catch {
        /* ignore cleanup errors */
      }
      await app.close();
    }
  });

  it('GET / returns hello', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /auth/me returns 401 without token', () => {
    return request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('signup then GET /auth/me returns user from database', async () => {
    const email = `alice.${Date.now()}@e2e.test`;
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, password: 'password12' })
      .expect(201);

    const token = signup.body.accessToken as string;
    expect(token).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.user.email).toBe(email.toLowerCase());
    expect(me.body.user.id).toBe(signup.body.user.id);
    expect(me.body.user.createdAt).toBeDefined();
  });

  it('cross-user: user B cannot read user A document status, analytics, or insights', async () => {
    const resA = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: `owner.${Date.now()}@e2e.test`, password: 'password12' })
      .expect(201);
    const tokenA = resA.body.accessToken as string;
    const userIdA = resA.body.user.id as string;

    const emailB = `other.${Date.now()}@e2e.test`;
    const resB = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: emailB, password: 'password12' })
      .expect(201);
    const tokenB = resB.body.accessToken as string;

    const prisma = app.get(PrismaService);
    const doc = await prisma.document.create({
      data: {
        userId: userIdA,
        originalFilename: 'e2e.csv',
        storageKey: `e2e-doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'PENDING',
      },
    });

    await request(app.getHttpServer())
      .get(`/documents/${doc.id}/status`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/documents/${doc.id}/analytics/monthly`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/documents/${doc.id}/insights`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/documents/${doc.id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });
});
