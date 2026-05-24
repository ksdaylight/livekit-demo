import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LiveKitModule } from '../livekit/livekit.module';
import { ParticipantModule } from '../participants/participant.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [AuthModule, LiveKitModule, ParticipantModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
