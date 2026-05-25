import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { fileClientMessageSchema } from '@rtclive/shared';
import { RtcliveSocket, parseJson, sendSystemError } from '../realtime/ws-utils';
import { RealtimeHubService } from '../realtime/realtime-hub.service';
import { ParticipantService } from '../participants/participant.service';
import { FileService } from './file.service';

@Injectable()
// 文件 WebSocket 网关：连接时下发可见文件快照，收到 file.ack 后广播对应文件消息。
export class FileGateway implements OnModuleInit {
  private readonly logger = new Logger(FileGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly participants: ParticipantService,
    private readonly files: FileService,
    private readonly hub: RealtimeHubService,
  ) {}

  onModuleInit() {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance();
    // 文件上传走 HTTP multipart，WebSocket 只负责文件消息通知和快照同步。
    fastify.get('/ws/v1/rooms/:roomCode/files', { websocket: true }, (connection: { socket: RtcliveSocket }, request: any) => {
      const socket = connection.socket;
      const roomCode = String(request.params.roomCode).toUpperCase();
      const identity = String(request.query.identity ?? '');
      const participantKey = String(request.query.participantKey ?? '');
      void this.handleConnection(socket, roomCode, identity, participantKey);
      socket.on('message', (raw) => void this.onMessage(socket, roomCode, raw));
      socket.on('close', () => this.handleDisconnect(socket, roomCode));
    });
  }

  async handleConnection(socket: RtcliveSocket, roomCode: string, identity: string, participantKey: string) {
    try {
      await this.participants.requireParticipant(roomCode, identity, participantKey);
      socket.identity = identity;
      socket.participantKey = participantKey;
      this.hub.add('files', roomCode, socket);
      // 只返回当前参与者可见的文件：群发、自己发出的私发、发给自己的私发。
      const messages = await this.files.listVisible(roomCode, identity, participantKey);
      socket.send(JSON.stringify({ type: 'file.snapshot', messages }));
    } catch (error: any) {
      sendSystemError(socket, error.message || '文件通道连接失败');
      socket.close();
    }
  }

  handleDisconnect(socket: RtcliveSocket, roomCode: string) {
    this.hub.remove('files', roomCode, socket);
  }

  async onMessage(socket: RtcliveSocket, roomCode: string, raw: unknown) {
    try {
      if (!roomCode || !socket.identity || !socket.participantKey) return;
      const message = fileClientMessageSchema.parse(parseJson(raw));
      const messages = await this.files.listVisible(roomCode, socket.identity, socket.participantKey);
      const file = messages.find((item) => item.fileId === message.fileId);
      if (file) {
        // 私发文件只广播给发送者和接收者；群发文件广播给房间内所有文件通道连接。
        this.hub.broadcast('files', roomCode, { type: 'file.message', message: file }, (target: any) => {
          return (
            !file.targetIdentity ||
            target.identity === file.senderIdentity ||
            target.identity === file.targetIdentity
          );
        });
      }
    } catch (error: any) {
      this.logger.warn(error.message);
      sendSystemError(socket, error.message || '文件消息处理失败');
    }
  }
}
