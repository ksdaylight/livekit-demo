import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { MediaGateway } from './media.gateway';
import { MediaService } from './media.service';

@Module({
  imports: [ParticipantModule],
  providers: [MediaService, MediaGateway],
  exports: [MediaService],
})
export class MediaModule {}
