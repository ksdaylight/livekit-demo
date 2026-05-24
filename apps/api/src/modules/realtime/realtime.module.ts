import { Global, Module } from '@nestjs/common';
import { RealtimeHubService } from './realtime-hub.service';

@Global()
@Module({
  providers: [RealtimeHubService],
  exports: [RealtimeHubService],
})
export class RealtimeModule {}
