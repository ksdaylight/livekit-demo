import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { StorageModule } from '../storage/storage.module';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WhiteboardService } from './whiteboard.service';

@Module({
  imports: [ParticipantModule, StorageModule],
  controllers: [WhiteboardController],
  providers: [WhiteboardService, WhiteboardGateway],
})
export class WhiteboardModule {}
