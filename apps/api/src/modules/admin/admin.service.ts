import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaControlPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LiveKitService } from '../livekit/livekit.service';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
    private readonly livekit: LiveKitService,
    private readonly hub: RealtimeHubService,
  ) {}

  async kick(roomCode: string, identity: string, participantKey: string, targetIdentity: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    if (targetIdentity === host.identity) {
      throw new BadRequestException('主持人不能踢自己');
    }
    const target = await this.findTarget(host.meetingId, targetIdentity);
    await this.livekit.removeParticipant(host.meeting.roomCode, target.identity);
    await this.prisma.participant.update({ where: { id: target.id }, data: { leftAt: new Date() } });
    this.hub.broadcast('media-control', host.meeting.roomCode, { type: 'participant.kicked', targetIdentity });
    return { ok: true };
  }

  async updateChatMute(roomCode: string, identity: string, participantKey: string, targetIdentity: string, muted: boolean) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    const target = await this.findTarget(host.meetingId, targetIdentity);
    await this.prisma.participant.update({ where: { id: target.id }, data: { chatMuted: muted } });
    await this.broadcastChatModeration(host.meetingId, host.meeting.roomCode);
    return { ok: true };
  }

  async updateAllChatMute(roomCode: string, identity: string, participantKey: string, muted: boolean) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    await this.prisma.meeting.update({ where: { id: host.meetingId }, data: { allChatMuted: muted } });
    await this.broadcastChatModeration(host.meetingId, host.meeting.roomCode);
    return { ok: true };
  }

  async updateMediaLock(
    roomCode: string,
    identity: string,
    participantKey: string,
    targetIdentity: string,
    mediaType: 'audio' | 'video' | 'screen',
    locked: boolean,
  ) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    if (targetIdentity === host.identity) {
      throw new BadRequestException('主持人不能修改自己的音视频控制');
    }
    const target = await this.findTarget(host.meetingId, targetIdentity);
    const data =
      mediaType === 'audio'
        ? { audioLocked: locked }
        : mediaType === 'video'
          ? { videoLocked: locked }
          : { screenLocked: locked };
    const mediaLock = await this.prisma.mediaLock.upsert({
      where: { participantId: target.id },
      update: data,
      create: { meetingId: host.meetingId, participantId: target.id, ...data },
    });
    const payload: MediaControlPayload = {
      identity: target.identity,
      displayName: target.displayName,
      audioLocked: mediaLock.audioLocked,
      videoLocked: mediaLock.videoLocked,
      screenLocked: mediaLock.screenLocked,
    };
    this.hub.broadcast('media-control', host.meeting.roomCode, { type: 'media.control', participant: payload });
    return { ok: true, participant: payload };
  }

  async clearWhiteboard(roomCode: string, identity: string, participantKey: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    const event = await this.prisma.whiteboardEvent.create({
      data: {
        meetingId: host.meetingId,
        participantId: host.id,
        type: 'board_clear',
        payload: {},
      },
    });
    this.hub.broadcast('whiteboard', host.meeting.roomCode, {
      type: 'whiteboard.clear',
      event: {
        eventId: event.id,
        type: event.type,
        authorIdentity: host.identity,
        authorDisplayName: host.displayName,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      },
    });
    return { ok: true };
  }

  private async findTarget(meetingId: string, targetIdentity: string) {
    const target = await this.prisma.participant.findFirst({
      where: { meetingId, identity: targetIdentity },
    });
    if (!target) {
      throw new NotFoundException('目标用户不存在');
    }
    return target;
  }

  private async broadcastChatModeration(meetingId: string, roomCode: string) {
    const meeting = await this.prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      include: { participants: true },
    });
    this.hub.broadcast('chat', roomCode, {
      type: 'chat.moderation',
      allMuted: meeting.allChatMuted,
      mutedParticipantIds: meeting.participants.filter((item) => item.chatMuted).map((item) => item.identity),
    });
  }
}
