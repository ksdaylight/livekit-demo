import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { ParticipantModule } from '../participants/participant.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  // 会议模块依赖登录用户、LiveKit 房间管理和会议内参与者身份校验。
  imports: [AuthModule, LiveKitModule, ParticipantModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  // 导出 MeetingService，便于后续其他模块复用会议生命周期能力。
  exports: [MeetingService],
})
export class MeetingModule {}
