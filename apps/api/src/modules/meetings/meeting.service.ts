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
export class MeetingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly participants: ParticipantService,
  ) {}

  async createMeeting(host: { id: string; displayName: string }, input: CreateMeetingInput): Promise<JoinMeetingResponse> {
    const roomCode = input.roomCode.toUpperCase();
    const existing = await this.prisma.meeting.findUnique({ where: { roomCode } });
    if (existing?.status === 'active') {
      throw new ConflictException('会议室已存在');
    }

    const participantKey = this.participants.createParticipantKey();
    const identity = `h-${nanoid(10)}`;
    const meeting = await this.prisma.meeting.create({
      data: {
        roomCode,
        title: input.title,
        hostId: host.id,
        passwordHash: input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : null,
      },
    });
    const participant = await this.prisma.participant.create({
      data: {
        meetingId: meeting.id,
        identity,
        displayName: host.displayName,
        role: 'host',
        participantKeyHash: await this.participants.hashParticipantKey(participantKey),
      },
    });
    await this.livekit.ensureRoom(roomCode);
    return this.buildJoinResponse(meeting, participant, participantKey);
  }

  async joinMeeting(roomCodeRaw: string, input: JoinMeetingInput): Promise<JoinMeetingResponse> {
    const roomCode = roomCodeRaw.toUpperCase();
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode },
      include: { participants: true },
    });
    if (!meeting || meeting.status !== 'active') {
      throw new NotFoundException('会议不存在');
    }
    if (meeting.passwordHash) {
      const ok = input.password ? await argon2.verify(meeting.passwordHash, input.password) : false;
      if (!ok) {
        throw new ForbiddenException('会议密码错误');
      }
    }
    const displayNameTaken = meeting.participants.some(
      (participant) => !participant.leftAt && participant.displayName.toLowerCase() === input.displayName.toLowerCase(),
    );
    if (displayNameTaken) {
      throw new ConflictException('当前会议中该昵称已被使用，请更换昵称');
    }

    const participantKey = this.participants.createParticipantKey();
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
    const meetings = await this.prisma.meeting.findMany({
      where: { status: 'active' },
      include: { host: true, participants: true },
      orderBy: { createdAt: 'desc' },
    });
    return meetings.map((meeting) => ({
      roomCode: meeting.roomCode,
      title: meeting.title,
      passwordProtected: !!meeting.passwordHash,
      participantCount: meeting.participants.filter((participant) => !participant.leftAt).length,
      hostDisplayName: meeting.host.displayName,
      createdAt: meeting.createdAt.toISOString(),
    }));
  }

  async listHistory(hostId: string): Promise<HostMeetingHistoryItem[]> {
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
    await this.participants.requireParticipant(roomCode, identity, participantKey);
    await this.participants.markLeft(roomCode, identity);
    return { ok: true };
  }

  async updatePassword(roomCode: string, identity: string, participantKey: string, password?: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    await this.prisma.meeting.update({
      where: { id: host.meetingId },
      data: { passwordHash: password ? await argon2.hash(password, { type: argon2.argon2id }) : null },
    });
    return { ok: true, passwordProtected: !!password };
  }

  async dissolve(roomCode: string, identity: string, participantKey: string) {
    const host = await this.participants.requireHost(roomCode, identity, participantKey);
    await this.livekit.deleteRoom(host.meeting.roomCode);
    await this.prisma.meeting.update({
      where: { id: host.meetingId },
      data: {
        status: 'dissolved',
        dissolvedAt: new Date(),
        participants: {
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
