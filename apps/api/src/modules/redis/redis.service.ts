import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
// Redis 封装服务。当前主要作为队列/临时状态基础设施，后续可扩展会议在线状态等能力。
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    // maxRetriesPerRequest=null 是 BullMQ 推荐配置，避免队列长任务因自动重试限制异常退出。
    this.client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:16379', {
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy() {
    // Nest 关闭时优雅退出 Redis 连接，避免开发态 watch 重启残留连接。
    await this.client.quit();
  }

  roomPresenceKey(roomCode: string) {
    // 统一 Redis key 命名，避免不同模块拼接出不一致的在线状态 key。
    return `room:${roomCode}:presence`;
  }
}
