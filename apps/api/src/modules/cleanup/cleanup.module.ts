import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';

@Module({
  // 定时清理服务由 ScheduleModule 触发，不需要控制器入口。
  providers: [CleanupService],
})
export class CleanupModule {}
