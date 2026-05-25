import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { WhiteboardEventPayload } from '@rtclive/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantService } from '../participants/participant.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
// 白板服务负责图片上传和白板事件持久化。画布状态由事件列表重放得到。
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
    // 图片对象按会议号分目录，便于后续会议级清理；URL 用于前端在画布中渲染。
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
    // 所有白板操作都追加为事件，不覆盖旧记录；撤销由前端根据 undo 事件解释。
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
    // 按创建时间升序返回，前端可以确定性地重放事件。
    const events = await this.prisma.whiteboardEvent.findMany({
      where: { meetingId: participant.meetingId },
      include: { meeting: true, participant: true },
      orderBy: { createdAt: 'asc' },
    });
    return events.map((event) =>
      // 旧事件的参与者可能已被删除，使用系统身份兜底展示。
      this.toPayload(event, event.participant ?? { identity: 'system', displayName: '系统' }),
    );
  }

  toPayload(
    event: { id: string; type: 'stroke_add' | 'image_add' | 'stroke_undo' | 'image_undo' | 'board_clear'; payload: unknown; createdAt: Date },
    participant: { identity: string; displayName: string },
  ): WhiteboardEventPayload {
    // 数据库事件转为前端共享契约，隐藏 meetingId/participantId 等内部关联字段。
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
  // 图片文件名进入对象 key 前先去掉路径非法字符，避免跨平台下载/展示异常。
  return (name || 'image.png').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}
