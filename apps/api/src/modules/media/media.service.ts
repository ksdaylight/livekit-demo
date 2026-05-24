import { Injectable } from '@nestjs/common';
import { MediaControlPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
  ) {}

  async snapshot(roomCode: string, identity: string, participantKey: string): Promise<MediaControlPayload[]> {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const participants = await this.prisma.participant.findMany({
      where: { meetingId: participant.meetingId },
      include: { mediaLock: true },
      orderBy: { joinedAt: 'asc' },
    });
    return participants.map((item) => ({
      identity: item.identity,
      displayName: item.displayName,
      audioLocked: item.mediaLock?.audioLocked ?? false,
      videoLocked: item.mediaLock?.videoLocked ?? false,
      screenLocked: item.mediaLock?.screenLocked ?? false,
    }));
  }
}
