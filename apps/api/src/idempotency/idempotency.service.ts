import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

type InFlightRecord = {
  state: 'in_flight';
  fingerprint: string;
};

type CompletedRecord = {
  state: 'completed';
  fingerprint: string;
  response: unknown;
};

type StoredRecord = InFlightRecord | CompletedRecord;

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is required');
    }
    this.redis = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async runOrReplay<T>(
    key: string | undefined,
    scope: string,
    fingerprint: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return work();
    }

    const redisKey = `idempotency:${scope}:${key}`;
    const inFlight: InFlightRecord = {
      state: 'in_flight',
      fingerprint,
    };

    const acquired = await this.redis.set(
      redisKey,
      JSON.stringify(inFlight),
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );

    if (acquired === 'OK') {
      try {
        const response = await work();
        const completed: CompletedRecord = {
          state: 'completed',
          fingerprint,
          response,
        };
        await this.redis.set(
          redisKey,
          JSON.stringify(completed),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
        return response;
      } catch (err) {
        await this.redis.del(redisKey);
        throw err;
      }
    }

    const raw = await this.redis.get(redisKey);
    if (!raw) {
      return work();
    }

    let parsed: StoredRecord;
    try {
      parsed = JSON.parse(raw) as StoredRecord;
    } catch {
      throw new InternalServerErrorException(
        'Invalid idempotency record format',
      );
    }

    if (parsed.fingerprint !== fingerprint) {
      throw new ConflictException(
        'Idempotency-Key already used with different request payload',
      );
    }

    if (parsed.state === 'completed') {
      return parsed.response as T;
    }

    throw new ConflictException(
      'A request with this Idempotency-Key is already in progress',
    );
  }
}
