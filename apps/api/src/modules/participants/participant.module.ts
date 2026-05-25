import { Module } from '@nestjs/common';
import { ParticipantService } from './participant.service';

@Module({
  providers: [ParticipantService],
  // 参与者身份校验是多个业务模块的共同依赖，所以作为独立模块导出。
  exports: [ParticipantService],
})
export class ParticipantModule {}
