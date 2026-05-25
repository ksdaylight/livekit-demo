import { Global, Module } from '@nestjs/common';
import { RealtimeHubService } from './realtime-hub.service';

@Global()
@Module({
  providers: [RealtimeHubService],
  // RealtimeHub 是进程内广播中心，多个 Gateway/Service 都需要共享同一个实例。
  exports: [RealtimeHubService],
})
export class RealtimeModule {}
