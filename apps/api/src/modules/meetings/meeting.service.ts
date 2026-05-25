import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import {
  ActiveMeetingSummary,
  CreateMeetingInput,
  HostMeetingHistoryItem,
  JoinMeetingInput,
  JoinMeetingResponse,
} from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LiveKitService } from '../livekit/livekit.service';
import { ParticipantService } from '../participants/participant.service';

@Injectable()
// 会议服务是房间生命周期的核心：创建/加入/离开/解散，并协调数据库参与者和 LiveKit 房间。
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly participants: ParticipantService,
  ) {}

  async createMeeting(host: { id: string; displayName: string }, input: CreateMeetingInput): Promise<JoinMeetingResponse> {
    // roomCode 已由 Schema 规范化；这里再次转大写，保护直接调用服务层的测试或内部代码。
    const roomCode = input.roomCode.toUpperCase();
    const existing = await this.prisma.meeting.findUnique({ where: { roomCode } });
    if (existing?.status === 'active') {
      throw new ConflictException('会议室已存在');
    }

    // host identity 和 participantKey 都是会议内临时身份，不直接复用用户 id。
    const participantKey = this.participants.createParticipantKey();
    const identity = `h-${nanoid(10)}`;
    // 先创建会议，再创建主持人参与者；会议密码只保存 Argon2 哈希。
    const meeting = await this.prisma.meeting.create({
      data: {
        roomCode,
        title: input.title,
        hostId: host.id,
        passwordHash: input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : null,
      },
    });
    // 创建 host 参与者后，前端会用这条记录的 identity 建立 LiveKit 和业务 WebSocket。
    const participant = await this.prisma.participant.create({
      data: {
        meetingId: meeting.id,
        identity,
        displayName: host.displayName,
        role: 'host',
        participantKeyHash: await this.participants.hashParticipantKey(participantKey),
      },
    });
    // LiveKit 房间可以重复确保存在；已经存在时 LiveKitService 会吞掉 409。
    await this.livekit.ensureRoom(roomCode);
    return this.buildJoinResponse(meeting, participant, participantKey);
  }

  async joinMeeting(roomCodeRaw: string, input: JoinMeetingInput): Promise<JoinMeetingResponse> {
    const roomCode = roomCodeRaw.toUpperCase();
    // 加载 participants 是为了检查当前在线昵称是否重复。
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      include: { participants: true },
    });
    if (!meeting || meeting.status !== 'active') {
      throw new NotFoundException('会议不存在');
    }
    if (meeting.passwordHash) {
      // 有密码的会议必须提供正确密码；无密码会议忽略输入 password。
      const ok = input.password ? await argon2.verify(meeting.passwordHash, input.password) : false;
      if (!ok) {
        throw new ForbiddenException('会议密码错误');
      }
    }
    // 同一会议内在线昵称不允许重复，避免聊天/文件/管理面板中无法区分参与者。
    const displayNameTaken = meeting.participants.some(
      (participant) => !participant.leftAt && participant.displayName.toLowerCase() === input.displayName.toLowerCase(),
    );
    if (displayNameTaken) {
      throw new ConflictException('当前会议中该昵称已被使用，请更换昵称');
    }

    const participantKey = this.participants.createParticipantKey();
    // guest identity 独立生成，防止展示名变更或重复加入影响实时通道身份。
    const participant = await this.prisma.participant.create({
      data: {
        meetingId: meeting.id,
        identity: `g-${nanoid(10)}`,
        displayName: input.displayName,
        role: 'guest',
        participantKeyHash: await this.participants.hashParticipantKey(participantKey),
      },
    });
    await this.livekit.ensureRoom(roomCode);
    return this.buildJoinResponse(meeting, participant, participantKey);
  }

  async listActive(): Promise<ActiveMeetingSummary[]> {
    // 活动会议列表只展示 active 状态，并按创建时间倒序方便最近会议排在前面。
    const meetings = await this.prisma.meeting.findMany({
      where: { status: 'active' },
      include: { host: true, participants: true },
      orderBy: { createdAt: 'desc' },
    });
    return meetings.map((meeting) => ({
      roomCode: meeting.roomCode,
      title: meeting.title,
      passwordProtected: !!meeting.passwordHash,
      // 只统计尚未离会的参与者，历史离会记录仍保存在数据库中。
      participantCount: meeting.participants.filter((participant) => !participant.leftAt).length,
      hostDisplayName: meeting.host.displayName,
      createdAt: meeting.createdAt.toISOString(),
    }));
  }

  async listHistory(hostId: string): Promise<HostMeetingHistoryItem[]> {
    // 主持人历史保留最近 100 条，避免管理页一次拉取过多历史数据。
    const meetings = await this.prisma.meeting.findMany({
      where: { hostId },
      include: { host: true, participants: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return meetings.map((meeting) => ({
      roomCode: meeting.roomCode,
      title: meeting.title,
      passwordProtected: !!meeting.passwordHash,
      participantCount: meeting.participants.length,
      hostDisplayName: meeting.host.displayName,
      createdAt: meeting.createdAt.toISOString(),
      status: meeting.status,
      dissolvedAt: meeting.dissolvedAt?.toISOString() ?? null,
    }));
  }

  async leave(roomCode: string, identity: string, participantKey: string) {
    // 离会先验证 participantKey，避免任意用户伪造 identity 把别人踢下线。
    await this.participants.requireParticipant(roomCode, identity, participantKey);
    await this.participants.markLeft(roomCode, identity);
    return { ok: true };
  }

  async updatePassword(roomCode: string, identity: string, participantKey: string, password?: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    // password 为空时清除 passwordHash，会议立即变为无需密码加入。
    await this.prisma.meeting.update({
      where: { id: host.meetingId },
      data: { passwordHash: password ? await argon2.hash(password, { type: argon2.argon2id }) : null },
    });
    return { ok: true, passwordProtected: !!password };
  }

  async dissolve(roomCode: string, identity: string, participantKey: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    // 先通知 LiveKit 删除房间，随后更新本地数据库状态。本地数据库仍是最终业务状态来源。
    await this.livekit.deleteRoom(host.meeting.roomCode);
    await this.prisma.meeting.update({
      where: { id: host.meetingId },
      data: {
        status: 'dissolved',
        dissolvedAt: new Date(),
        participants: {
          // 解散时把所有还在线的参与者统一标记为离会。
          updateMany: {
            where: { leftAt: null },
            data: { leftAt: new Date() },
          },
        },
      },
    });
    return { ok: true };
  }

  private async buildJoinResponse(
    meeting: { roomCode: string; title: string; passwordHash: string | null },
    participant: { identity: string; displayName: string; role: string },
    participantKey: string,
  ): Promise<JoinMeetingResponse> {
    // 该响应是前端进入会议页的完整启动包：包含业务凭据、LiveKit 地址和 LiveKit token。
    return {
      roomCode: meeting.roomCode,
      title: meeting.title,
      identity: participant.identity,
      displayName: participant.displayName,
      participantKey,
      role: participant.role === 'host' ? 'host' : 'guest',
      livekitUrl: this.livekit.getPublicUrl(),
      livekitToken: await this.livekit.createJoinToken({
        roomCode: meeting.roomCode,
        identity: participant.identity,
        displayName: participant.displayName,
      }),
      roomPasswordProtected: !!meeting.passwordHash,
    };
  }
}
