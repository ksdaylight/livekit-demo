import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParticipantService {
  constructor(private readonly prisma: PrismaService) {}

  createParticipantKey() {
    return nanoid(36);
  }

  async hashParticipantKey(key: string) {
    return argon2.hash(key, { type: argon2.argon2id });
  }

  async requireParticipant(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.prisma.participant.findFirst({
      where: {
        identity,
        meeting: { roomCode: roomCode.toUpperCase(), status: 'active' },
      },
      include: {
        meeting: true,
        mediaLock: true,
      },
    });
    if (!participant) {
      throw new ForbiddenException('参会身份无效');
    }
    const valid = await argon2.verify(participant.participantKeyHash, participantKey);
    if (!valid) {
      throw new ForbiddenException('参会身份无效');
    }
    return participant;
  }

  async requireHost(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.requireParticipant(roomCode, identity, participantKey);
    if (participant.role !== 'host') {
      throw new ForbiddenException('只有主持人可以执行此操作');
    }
    return participant;
  }

  async requireActiveMeeting(roomCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: { host: true },
    });
    if (!meeting || meeting.status !== 'active') {
      throw new NotFoundException('会议不存在或已结束');
    }
    return meeting;
  }

  async markOnline(roomCode: string, identity: string) {
    await this.prisma.participant.updateMany({
      where: { identity, meeting: { roomCode: roomCode.toUpperCase() } },
      data: { leftAt: null },
    });
  }

  async markLeft(roomCode: string, identity: string) {
    await this.prisma.participant.updateMany({
      where: { identity, meeting: { roomCode: roomCode.toUpperCase() }, leftAt: null },
      data: { leftAt: new Date() },
    });
  }
}
