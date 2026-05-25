import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'path';
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
    ConfigModule.forRoot({
      isGlobal: true,
      // 支持两种启动目录：仓库根目录 pnpm dev，以及 apps/api 目录内的 Nest/Prisma 命令。
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
    }),
    // 定时任务模块用于会议保留期清理。
    ScheduleModule.forRoot(),
    // 基础设施模块先加载，后面的业务模块可以直接依赖数据库、Redis、实时广播和对象存储。
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
// 根模块只负责组合依赖，不承载业务逻辑。
export class AppModule {}
