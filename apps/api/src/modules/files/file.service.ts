import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { FileMessagePayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
// 文件服务负责 multipart 上传后的对象存储、数据库记录和访问权限判断。
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
    // targetIdentity 存在时表示私发文件，需要确认接收者属于同一会议。
    if (input.targetIdentity) {
      const target = await this.prisma.participant.findFirst({
        where: { meetingId: sender.meetingId, identity: input.targetIdentity },
      });
      if (!target) throw new NotFoundException('接收人不存在');
      targetId = target.id;
    }

    // objectKey 按会议号分目录，方便后续按会议清理对象；文件名仍做安全化处理。
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
    // 可见规则：群发文件、自己发送的私发文件、发给自己的私发文件。
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
    // 下载时再次检查可见性，不能只依赖前端列表。
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
    // BigInt 不能直接 JSON.stringify，转换为 number 后再发给前端。
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
  // 去掉 Windows/Linux 路径非法字符，并限制长度，避免对象 key 或下载头异常。
  return (name || 'unnamed-file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
}
