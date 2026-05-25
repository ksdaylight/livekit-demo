import { Module } from '@nestjs/common';
import { LiveKitService } from './livekit.service';

@Module({
  providers: [LiveKitService],
  // 会议和管理模块都需要复用 LiveKit 房间管理/token 签发能力。
  exports: [LiveKitService],
})
export class LiveKitModule {}
