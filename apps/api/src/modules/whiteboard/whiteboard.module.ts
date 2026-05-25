import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { StorageModule } from '../storage/storage.module';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WhiteboardService } from './whiteboard.service';

@Module({
  // 白板模块既要校验参与者，也要把图片保存到对象存储。
  imports: [ParticipantModule, StorageModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService, WhiteboardGateway],
})
export class WhiteboardModule {}
