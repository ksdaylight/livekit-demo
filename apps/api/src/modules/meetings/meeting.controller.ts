import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createMeetingSchema, joinMeetingSchema, leaveMeetingSchema, updateMeetingPasswordSchema } from '@rtclive/shared';
import { CurrentUser, RequestUser } from '../../shared/auth-user.decorator';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingService } from './meeting.service';

@Controller()
export class MeetingController {
  constructor(private readonly meetings: MeetingService) {}

  @Post('meetings')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createMeetingSchema)) body: any) {
    return this.meetings.createMeeting(user, body);
  }

  @Get('meetings/active')
  listActive() {
    return this.meetings.listActive();
  }

  @Get('host/meetings/history')
  @UseGuards(JwtAuthGuard)
  history(@CurrentUser() user: RequestUser) {
    return this.meetings.listHistory(user.id);
  }

  @Post('meetings/:roomCode/join')
  join(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(joinMeetingSchema)) body: any) {
    return this.meetings.joinMeeting(roomCode, body);
  }

  @Post('meetings/:roomCode/leave')
  leave(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(leaveMeetingSchema)) body: any) {
    return this.meetings.leave(roomCode, body.identity, body.participantKey);
  }

  @Patch('meetings/:roomCode/password')
  updatePassword(
    @Param('roomCode') roomCode: string,
    @Body(new ZodValidationPipe(updateMeetingPasswordSchema)) body: any,
  ) {
    return this.meetings.updatePassword(roomCode, body.identity, body.participantKey, body.password);
  }

  @Post('meetings/:roomCode/dissolve')
  dissolve(@Param('roomCode') roomCode: string, @Body(new ZodValidationPipe(leaveMeetingSchema)) body: any) {
    return this.meetings.dissolve(roomCode, body.identity, body.participantKey);
  }
}
