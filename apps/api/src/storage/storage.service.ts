import { Injectable } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type ObjectHeadResult = {
  contentLength: number;
  contentType?: string;
};

function readS3Config() {
  const endpoint = process.env.S3_ENDPOINT ?? process.env.AWS_S3_ENDPOINT;
  const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET ?? process.env.AWS_BUCKET_NAME;
  const forcePathStyle =
    (process.env.S3_FORCE_PATH_STYLE ?? 'true').toLowerCase() !== 'false';

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle,
  };
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | null = null;

  constructor() {
    const cfg = readS3Config();
    if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
      throw new Error(
        'S3/MinIO is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET (or legacy AWS_* / AWS_BUCKET_NAME).',
      );
    }

    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      forcePathStyle: cfg.forcePathStyle,
    });
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch {
      // Bucket missing or no access — try create (MinIO / dev).
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (err: unknown) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') {
        return;
      }
      throw err;
    }
  }

  async ensureBucket(): Promise<void> {
    if (!this.bucketReady) {
      this.bucketReady = this.ensureBucketExists();
    }
    await this.bucketReady;
  }

  async presignedPutUrl(
    storageKey: string,
    options?: { contentType?: string; expiresInSeconds?: number },
  ): Promise<{ uploadUrl: string; expiresIn: number }> {
    await this.ensureBucket();

    const expiresIn = Math.min(
      Math.max(
        Number(process.env.PRESIGNED_PUT_EXPIRES_SECONDS ?? 3600) || 3600,
        60,
      ),
      86400,
    );

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ...(options?.contentType ? { ContentType: options.contentType } : {}),
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSeconds ?? expiresIn,
    });

    return { uploadUrl, expiresIn: options?.expiresInSeconds ?? expiresIn };
  }

  async headObject(storageKey: string): Promise<ObjectHeadResult> {
    await this.ensureBucket();

    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      );
      const len = out.ContentLength ?? 0;
      return {
        contentLength: len,
        contentType: out.ContentType,
      };
    } catch (err: unknown) {
      const status =
        err && typeof err === 'object' && '$metadata' in err
          ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : undefined;
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name: string }).name)
          : '';
      if (status === 404 || name === 'NotFound') {
        throw new Error('OBJECT_NOT_FOUND');
      }
      throw err;
    }
  }

  /** Best-effort delete of the uploaded object (S3/MinIO delete is idempotent for missing keys). */
  async deleteObject(storageKey: string): Promise<void> {
    await this.ensureBucket();
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }
}
