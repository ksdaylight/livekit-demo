import { Injectable } from '@nestjs/common';
import { MediaControlPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';

@Injectable()
// 媒体服务只维护业务层面的“锁定状态”；真正的媒体连接由 LiveKit 客户端处理。
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
  ) {}

  async snapshot(roomCode: string, identity: string, participantKey: string): Promise<MediaControlPayload[]> {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    // 返回会议内所有参与者的当前锁定状态，前端据此更新管理面板和本地控制按钮。
    const participants = await this.prisma.participant.findMany({
      where: { meetingId: participant.meetingId },
      include: { mediaLock: true },
      orderBy: { joinedAt: 'asc' },
    });
    return participants.map((item) => ({
      identity: item.identity,
      displayName: item.displayName,
      // 未创建 mediaLock 记录时默认三个媒体能力都未锁定。
      audioLocked: item.mediaLock?.audioLocked ?? false,
      videoLocked: item.mediaLock?.videoLocked ?? false,
      screenLocked: item.mediaLock?.screenLocked ?? false,
    }));
  }
}
