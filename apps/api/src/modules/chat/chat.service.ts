import { ForbiddenException, Injectable } from '@nestjs/common';
import { ChatMessagePayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';

@Injectable()
// 聊天服务负责消息落库、快照查询和禁言规则判断。
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
  ) {}

  async snapshot(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    // 快照除了消息，还要带上禁言状态，前端才能正确禁用输入框。
    const meeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: participant.meetingId },
      include: { participants: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: { meetingId: participant.meetingId },
      include: { participant: true, meeting: true },
      orderBy: { createdAt: 'asc' },
      // 限制快照最大 300 条，避免长会议重连时传输过多历史消息。
      take: 300,
    });
    return {
      messages: messages.map((message) => this.toPayload(message)),
      allMuted: meeting.allChatMuted,
      mutedParticipantIds: meeting.participants.filter((item) => item.chatMuted).map((item) => item.identity),
    };
  }

  async append(roomCode: string, identity: string, participantKey: string, content: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const meeting = await this.prisma.meeting.findUniqueOrThrow({ where: { id: participant.meetingId } });
    // 全员禁言和单人禁言都由服务端兜底，前端按钮禁用只是体验优化。
    if (meeting.allChatMuted) {
      throw new ForbiddenException('当前会议已开启全员聊天禁言');
    }
    if (participant.chatMuted) {
      throw new ForbiddenException('你已被主持人禁止发送聊天消息');
    }
    const message = await this.prisma.chatMessage.create({
      data: {
        meetingId: participant.meetingId,
        participantId: participant.id,
        content,
      },
      include: { participant: true, meeting: true },
    });
    return this.toPayload(message);
  }

  toPayload(message: {
    id: string;
    meeting: { roomCode: string };
    participant: { identity: string; displayName: string };
    content: string;
    createdAt: Date;
  }): ChatMessagePayload {
    // 数据库模型转成前端契约，隐藏内部 meetingId/participantId。
    return {
      messageId: message.id,
      roomCode: message.meeting.roomCode,
      senderIdentity: message.participant.identity,
      senderDisplayName: message.participant.displayName,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
