import { Module } from '@nestjs/common';
import { LiveKitModule } from '../livekit/livekit.module';
import { ParticipantModule } from '../participants/participant.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [LiveKitModule, ParticipantModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
