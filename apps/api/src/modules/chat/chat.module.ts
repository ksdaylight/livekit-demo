import { Module } from '@nestjs/common';
import { ParticipantModule } from '../participants/participant.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  // 聊天发送和快照都需要验证会议内参与者身份。
  imports: [ParticipantModule],
  providers: [ChatService, ChatGateway],
  // AdminService 不直接依赖 ChatService，但保留导出方便后续扩展。
  exports: [ChatService],
})
export class ChatModule {}
