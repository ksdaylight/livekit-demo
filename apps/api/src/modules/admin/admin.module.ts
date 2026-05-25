import { Module } from '@nestjs/common';
import { LiveKitModule } from '../livekit/livekit.module';
import { ParticipantModule } from '../participants/participant.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  // 管理操作需要调用 LiveKit 断开参与者，并验证调用者是否为主持人。
  imports: [LiveKitModule, ParticipantModule],
  controllers: [AdminController],
  providers: [AdminService],
  // 导出 AdminService，便于后续把管理能力接入更多入口。
  exports: [AdminService],
})
export class AdminModule {}
