import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService],
  // Redis 作为基础设施全局导出，便于队列/在线状态模块复用。
  exports: [RedisService],
})
export class RedisModule {}
