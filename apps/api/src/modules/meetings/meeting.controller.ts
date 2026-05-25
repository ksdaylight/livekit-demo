import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createMeetingSchema, joinMeetingSchema, leaveMeetingSchema, updateMeetingPasswordSchema } from '@rtclive/shared';
import { CurrentUser, RequestUser } from '../../shared/auth-user.decorator';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingService } from './meeting.service';

@Controller()
// 会议 HTTP 控制器：创建/加入/离开/解散会议，以及主持人的会议历史和密码管理。
export class MeetingController {
  constructor(private readonly meetings: MeetingService) {}

  @Post('meetings')
  @UseGuards(JwtAuthGuard)
  // 创建会议必须登录；创建者会自动作为 host 加入会议。
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createMeetingSchema)) body: any) {
    return this.meetings.createMeeting(user, body);
  }

  @Get('meetings/active')
  // 公开活动会议列表，不需要登录，便于访客选择加入。
  listActive() {
    return this.meetings.listActive();
  }

  @Get('host/meetings/history')
  @UseGuards(JwtAuthGuard)
  // 主持人历史只返回当前登录用户创建过的会议。
  history(@CurrentUser() user: RequestUser) {
    return this.meetings.listHistory(user.id);
  }

  @Post('meetings/:roomCode/join')
  // 游客加入会议。接口会返回 LiveKit token 和业务 WebSocket 需要的 participantKey。
  join(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(joinMeetingSchema)) body: any) {
    return this.meetings.joinMeeting(roomCode, body);
  }

  @Post('meetings/:roomCode/leave')
  // 离会不要求登录，只要求会议内 participantKey，因为游客没有账号登录态。
  leave(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(leaveMeetingSchema)) body: any) {
    return this.meetings.leave(roomCode, body.identity, body.participantKey);
  }

  @Patch('meetings/:roomCode/password')
  // 修改会议密码由服务层验证主持人身份；传空密码表示取消密码保护。
  updatePassword(
    @Param('roomCode') roomCode: string,
    @Body(new ZodValidationPipe(updateMeetingPasswordSchema)) body: any,
  ) {
    return this.meetings.updatePassword(roomCode, body.identity, body.participantKey, body.password);
  }

  @Post('meetings/:roomCode/dissolve')
  // 解散会议会同步删除 LiveKit 房间并标记所有在线参与者离会。
  dissolve(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(leaveMeetingSchema)) body: any) {
    return this.meetings.dissolve(roomCode, body.identity, body.participantKey);
  }
}
