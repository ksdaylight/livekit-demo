import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { FileModule } from './files/file.module';
import { LiveKitModule } from './livekit/livekit.module';
import { MeetingModule } from './meetings/meeting.module';
import { MediaModule } from './media/media.module';
import { ParticipantModule } from './participants/participant.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StorageModule } from './storage/storage.module';
import { WhiteboardModule } from './whiteboard/whiteboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    StorageModule,
    LiveKitModule,
    AuthModule,
    ParticipantModule,
    MeetingModule,
    AdminModule,
    ChatModule,
    FileModule,
    WhiteboardModule,
    MediaModule,
    CleanupModule,
  ],
})
export class AppModule {}
