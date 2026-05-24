import { ForbiddenException, Injectable } from '@nestjs/common';
import { ChatMessagePayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
  ) {}

  async snapshot(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const meeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: participant.meetingId },
      include: { participants: true },
    });
    const messages = await this.prisma.chatMessage.findMany({
      where: { meetingId: participant.meetingId },
      include: { participant: true, meeting: true },
      orderBy: { createdAt: 'asc' },
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
