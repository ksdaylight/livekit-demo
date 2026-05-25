import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  clearWhiteboardSchema,
  kickParticipantSchema,
  updateAllChatMuteSchema,
  updateChatMuteSchema,
  updateMediaLockSchema,
} from '@rtclive/shared';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { AdminService } from './admin.service';

@Controller('meetings/:roomCode/admin')
// 主持人管理接口。所有接口都用会议内 participantKey 验证主持人身份，而不是只依赖登录态。
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('kick')
  // 踢出参与者：同时断开 LiveKit 媒体连接并标记数据库离会。
  kick(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(kickParticipantSchema)) body: any) {
    return this.admin.kick(roomCode, body.identity, body.participantKey, body.targetIdentity);
  }

  @Post('chat-mute')
  // 单人禁言/解除禁言。
  chatMute(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(updateChatMuteSchema)) body: any) {
    return this.admin.updateChatMute(roomCode, body.identity, body.participantKey, body.targetIdentity, body.muted);
  }

  @Post('all-chat-mute')
  // 全员聊天禁言/解除，全体客户端会收到 chat.moderation 广播。
  allChatMute(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(updateAllChatMuteSchema)) body: any) {
    return this.admin.updateAllChatMute(roomCode, body.identity, body.participantKey, body.muted);
  }

  @Post('media-lock')
  // 锁定参与者的麦克风、摄像头或屏幕共享权限。
  mediaLock(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(updateMediaLockSchema)) body: any) {
    return this.admin.updateMediaLock(
      roomCode,
      body.identity,
      body.participantKey,
      body.targetIdentity,
      body.mediaType,
      body.locked,
    );
  }

  @Post('whiteboard-clear')
  // 清空白板本质上也是追加 board_clear 事件，前端收到后重置画布。
  whiteboardClear(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(clearWhiteboardSchema)) body: any) {
    return this.admin.clearWhiteboard(roomCode, body.identity, body.participantKey);
  }
}
