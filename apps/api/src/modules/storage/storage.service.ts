import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'rtclive';
    const endpoint = `${config.get('MINIO_USE_SSL') === 'true' ? 'https' : 'http'}://${config.get('MINIO_ENDPOINT') ?? 'localhost'}:${config.get('MINIO_PORT') ?? 9000}`;
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY') ?? 'rtclive',
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY') ?? 'rtclive_minio_password',
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      // The docker-compose bootstrap creates the bucket. If it does not exist yet, uploads will fail clearly.
    }
  }

  async putObject(input: { key: string; body: Buffer | Readable; contentType: string }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
  }

  async getObject(key: string) {
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string) {
    const base = this.config.get<string>('MINIO_PUBLIC_URL') ?? 'http://localhost:9000';
    return `${base}/${this.bucket}/${key}`;
  }
}
