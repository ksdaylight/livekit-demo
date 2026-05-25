import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
// 参与者服务集中处理会议内身份验证，避免每个业务模块重复校验 participantKey。
export class ParticipantService {
  constructor(private readonly prisma: PrismaService) {}

  createParticipantKey() {
    // participantKey 是会议内短期凭据，长度足够抵抗猜测；只在加入会议响应中明文返回一次。
    return nanoid(36);
  }

  async hashParticipantKey(key: string) {
    // participantKey 使用 Argon2id 哈希存储，即使数据库泄露也不能直接伪造会议内操作。
    return argon2.hash(key, { type: argon2.argon2id });
  }

  async requireParticipant(roomCode: string, identity: string, participantKey: string) {
    // 同时按 identity 和 active meeting 查询，防止已结束会议继续操作。
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
    // 所有会议内 HTTP/WebSocket 操作都要验证 participantKey。
    const valid = await argon2.verify(participant.participantKeyHash, participantKey);
    if (!valid) {
      throw new ForbiddenException('参会身份无效');
    }
    return participant;
  }

  async requireHost(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.requireParticipant(roomCode, identity, participantKey);
    // 管理类操作统一通过 requireHost 兜底。
    if (participant.role !== 'host') {
      throw new ForbiddenException('只有主持人可以执行此操作');
    }
    return participant;
  }

  async requireActiveMeeting(roomCode: string) {
    // 用于只需要确认会议存在的场景，顺带带出 host 便于展示或权限判断。
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
    // WebSocket 重新连接时可以把之前离线的参与者恢复为在线。
    await this.prisma.participant.updateMany({
      where: { identity, meeting: { roomCode: roomCode.toUpperCase() } },
      data: { leftAt: null },
    });
  }

  async markLeft(roomCode: string, identity: string) {
    // updateMany 保持幂等：重复离会不会抛错。
    await this.prisma.participant.updateMany({
      where: { identity, meeting: { roomCode: roomCode.toUpperCase() }, leftAt: null },
      data: { leftAt: new Date() },
    });
  }
}
