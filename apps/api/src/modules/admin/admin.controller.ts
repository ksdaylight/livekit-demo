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
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('kick')
  kick(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(kickParticipantSchema)) body: any) {
    return this.admin.kick(roomCode, body.identity, body.participantKey, body.targetIdentity);
  }

  @Post('chat-mute')
  chatMute(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(updateChatMuteSchema)) body: any) {
    return this.admin.updateChatMute(roomCode, body.identity, body.participantKey, body.targetIdentity, body.muted);
  }

  @Post('all-chat-mute')
  allChatMute(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(updateAllChatMuteSchema)) body: any) {
    return this.admin.updateAllChatMute(roomCode, body.identity, body.participantKey, body.muted);
  }

  @Post('media-lock')
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
  whiteboardClear(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(clearWhiteboardSchema)) body: any) {
    return this.admin.clearWhiteboard(roomCode, body.identity, body.participantKey);
  }
}
