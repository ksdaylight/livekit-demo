import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { MediaGateway } from './media.gateway';
import { MediaService } from './media.service';

@Module({
  // 媒体控制状态绑定参与者身份，Gateway 连接时也要校验 participantKey。
  imports: [ParticipantModule],
  providers: [MediaService, MediaGateway],
  // AdminService 当前通过 Hub 直接广播，保留导出方便后续复用媒体快照。
  exports: [MediaService],
})
export class MediaModule {}
