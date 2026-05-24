import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { FileMessagePayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantService,
    private readonly storage: StorageService,
  ) {}

  async upload(input: {
    roomCode: string;
    identity: string;
    participantKey: string;
    targetIdentity?: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }) {
    const sender = await this.participants.requireParticipant(input.roomCode, input.identity, input.participantKey);
    let targetId: string | null = null;
    if (input.targetIdentity) {
      const target = await this.prisma.participant.findFirst({
        where: { meetingId: sender.meetingId, identity: input.targetIdentity },
      });
      if (!target) throw new NotFoundException('接收人不存在');
      targetId = target.id;
    }

    const objectKey = `${sender.meeting.roomCode}/files/${nanoid(18)}-${sanitizeFileName(input.fileName)}`;
    await this.storage.putObject({ key: objectKey, body: input.buffer, contentType: input.contentType });
    const record = await this.prisma.fileRecord.create({
      data: {
        meetingId: sender.meetingId,
        senderParticipantId: sender.id,
        targetParticipantId: targetId,
        objectKey,
        fileName: sanitizeFileName(input.fileName),
        fileSize: BigInt(input.buffer.length),
        contentType: input.contentType || 'application/octet-stream',
      },
      include: { senderParticipant: true, targetParticipant: true, meeting: true },
    });
    return this.toPayload(record);
  }

  async listVisible(roomCode: string, identity: string, participantKey: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const files = await this.prisma.fileRecord.findMany({
      where: {
        meetingId: participant.meetingId,
        OR: [{ targetParticipantId: null }, { senderParticipantId: participant.id }, { targetParticipantId: participant.id }],
      },
      include: { senderParticipant: true, targetParticipant: true, meeting: true },
      orderBy: { createdAt: 'asc' },
    });
    return files.map((file) => this.toPayload(file));
  }

  async download(roomCode: string, identity: string, participantKey: string, fileId: string) {
    const participant = await this.participants.requireParticipant(roomCode, identity, participantKey);
    const file = await this.prisma.fileRecord.findUnique({
      where: { id: fileId },
      include: { senderParticipant: true, targetParticipant: true, meeting: true },
    });
    if (!file || file.meetingId !== participant.meetingId) {
      throw new NotFoundException('文件不存在');
    }
    const canAccess =
      !file.targetParticipantId ||
      file.senderParticipantId === participant.id ||
      file.targetParticipantId === participant.id;
    if (!canAccess) {
      throw new ForbiddenException('无权下载该文件');
    }
    return { file, object: await this.storage.getObject(file.objectKey) };
  }

  toPayload(record: {
    id: string;
    meeting: { roomCode: string };
    senderParticipant: { identity: string; displayName: string };
    targetParticipant: { identity: string; displayName: string } | null;
    fileName: string;
    fileSize: bigint;
    contentType: string;
    createdAt: Date;
  }): FileMessagePayload {
    return {
      fileId: record.id,
      roomCode: record.meeting.roomCode,
      senderIdentity: record.senderParticipant.identity,
      senderDisplayName: record.senderParticipant.displayName,
      targetIdentity: record.targetParticipant?.identity ?? null,
      targetDisplayName: record.targetParticipant?.displayName ?? null,
      fileName: record.fileName,
      fileSize: Number(record.fileSize),
      contentType: record.contentType,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

function sanitizeFileName(name: string) {
  return (name || 'unnamed-file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
}
