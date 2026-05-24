import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { WhiteboardEventPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class WhiteboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
    private readonly storage: StorageService,
  ) {}

  async uploadImage(input: {
    roomCode: string;
    identity: string;
    participantKey: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }) {
    const participant = await this.participants.requireParticipant(input.roomCode, input.identity, input.participantKey);
    const imageId = nanoid(18);
    const objectKey = `${participant.meeting.roomCode}/whiteboard/${imageId}-${sanitizeFileName(input.fileName)}`;
    await this.storage.putObject({ key: objectKey, body: input.buffer, contentType: input.contentType || 'image/png' });
    return { imageId, imageUrl: this.storage.publicUrl(objectKey), objectKey };
  }

  async appendEvent(
    roomCode: string,
    identity: string,
    participantKey: string,
    type: 'stroke_add' | 'image_add' | 'stroke_undo' | 'image_undo' | 'board_clear',
    payload: unknown,
  ) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const event = await this.prisma.whiteboardEvent.create({
      data: {
        meetingId: participant.meetingId,
        participantId: participant.id,
        type,
        payload: payload as any,
      },
    });
    return this.toPayload(event, participant);
  }

  async snapshot(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const events = await this.prisma.whiteboardEvent.findMany({
      where: { meetingId: participant.meetingId },
      include: { meeting: true, participant: true },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((event) =>
      this.toPayload(event, event.participant ?? { identity: 'system', displayName: '系统' }),
    );
  }

  toPayload(
    event: { id: string; type: 'stroke_add' | 'image_add' | 'stroke_undo' | 'image_undo' | 'board_clear'; payload: unknown; createdAt: Date },
    participant: { identity: string; displayName: string },
  ): WhiteboardEventPayload {
    return {
      eventId: event.id,
      type: event.type,
      authorIdentity: participant.identity,
      authorDisplayName: participant.displayName,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }
}

function sanitizeFileName(name: string) {
  return (name || 'image.png').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}
