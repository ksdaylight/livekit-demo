import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
// 对象存储服务，使用 S3 SDK 访问 MinIO。业务模块只关心 key、文件流和公开 URL。
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'rtclive';
    // 本机开发和 Docker 模式只需要切换 endpoint/port/ssl，S3 API 语义保持一致。
    const endpoint = `${config.get('MINIO_USE_SSL') === 'true' ? 'https' : 'http'}://${config.get('MINIO_ENDPOINT') ?? 'localhost'}:${config.get('MINIO_PORT') ?? 9000}`;
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint,
      // MinIO 本地开发通常使用 path-style 地址：/bucket/key，而不是虚拟主机 bucket.endpoint。
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
      // docker-compose 中的 minio-init 会创建 bucket；如果还没创建，后续上传会返回明确错误。
    }
  }

  async putObject(input: { key: string; body: Buffer | Readable; contentType: string }) {
    // 文件和白板图片统一走 PutObject，contentType 用于下载/预览时正确识别类型。
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
    // 下载接口返回 S3 对象流，由控制器设置响应头后直接 pipe 给浏览器。
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  publicUrl(key: string) {
    const base = this.config.get<string>('MINIO_PUBLIC_URL') ?? 'http://localhost:9000';
    // 公开 URL 只用于前端展示/下载；鉴权仍由 API 的下载接口和业务规则控制。
    return `${base}/${this.bucket}/${key}`;
  }
}
