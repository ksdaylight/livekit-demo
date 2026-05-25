import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaControlPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LiveKitService } from '../livekit/livekit.service';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';

@Injectable()
// 管理服务集中处理主持人能力：踢人、禁言、媒体锁和清空白板。
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
    // 先调用 LiveKit 断开媒体连接，再更新本地参与者状态。
    await this.livekit.removeParticipant(host.meeting.roomCode, target.identity);
    await this.prisma.participant.update({ where: { id: target.id }, data: { leftAt: new Date() } });
    this.hub.broadcast('media-control', host.meeting.roomCode, { type: 'participant.kicked', targetIdentity });
    return { ok: true };
  }

  async updateChatMute(roomCode: string, identity: string, participantKey: string, targetIdentity: string, muted: boolean) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    const target = await this.findTarget(host.meetingId, targetIdentity);
    // 单人禁言状态保存在 Participant 上，ChatService 发送消息前会再次检查。
    await this.prisma.participant.update({ where: { id: target.id }, data: { chatMuted: muted } });
    await this.broadcastChatModeration(host.meetingId, host.meeting.roomCode);
    return { ok: true };
  }

  async updateAllChatMute(roomCode: string, identity: string, participantKey: string, muted: boolean) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    // 全员禁言状态保存在 Meeting 上，影响会议内所有 guest。
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
    // 根据媒体类型只更新对应布尔位，避免覆盖其他锁定状态。
    const data =
      mediaType === 'audio'
        ? { audioLocked: locked }
        : mediaType === 'video'
          ? { videoLocked: locked }
          : { screenLocked: locked };
    const mediaLock = await this.prisma.mediaLock.upsert({
      // 每个参与者最多一条 mediaLock 记录；没有时创建，有时更新。
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
    // 推送给所有媒体控制通道，目标客户端会立即关闭/禁用对应媒体能力。
    this.hub.broadcast('media-control', host.meeting.roomCode, { type: 'media.control', participant: payload });
    return { ok: true, participant: payload };
  }

  async clearWhiteboard(roomCode: string, identity: string, participantKey: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    // 清空白板不删除历史事件，而是追加 board_clear，保证所有客户端按事件顺序得到一致状态。
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
    // 管理操作的目标必须属于同一会议。
    const target = await this.prisma.participant.findFirst({
      where: { meetingId, identity: targetIdentity },
    });
    if (!target) {
      throw new NotFoundException('目标用户不存在');
    }
    return target;
  }

  private async broadcastChatModeration(meetingId: string, roomCode: string) {
    // 禁言状态改变后广播完整 moderation 快照，前端无需自行合并局部状态。
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
