import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  // 文件和白板模块共享同一个 S3/MinIO 客户端配置。
  exports: [StorageService],
})
export class StorageModule {}
