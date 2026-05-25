import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { whiteboardClientMessageSchema } from '@rtclive/shared';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';
import { RtcliveSocket, parseJson, sendSystemError } from '../realtime/ws-utils';
import { WhiteboardService } from './whiteboard.service';

@Injectable()
// 白板 WebSocket 网关：连接时发送事件快照，后续把新增/撤销/清空事件广播给所有客户端。
export class WhiteboardGateway implements OnModuleInit {
  private readonly logger = new Logger(WhiteboardGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly participants: ParticipantService,
    private readonly whiteboard: WhiteboardService,
    private readonly hub: RealtimeHubService,
  ) {}

  onModuleInit() {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance();
    // 白板采用事件流而不是直接保存最终画布，方便迟到客户端按顺序重放恢复状态。
    fastify.get('/ws/v1/rooms/:roomCode/whiteboard', { websocket: true }, (connection: { socket: RtcliveSocket }, request: any) => {
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
      this.hub.add('whiteboard', roomCode, socket);
      // 快照包含历史事件；前端按 event.type 应用到本地画布模型。
      socket.send(JSON.stringify({ type: 'whiteboard.snapshot', events: await this.whiteboard.snapshot(roomCode, identity, participantKey) }));
    } catch (error: any) {
      sendSystemError(socket, error.message || '白板通道连接失败');
      socket.close();
    }
  }

  handleDisconnect(socket: RtcliveSocket, roomCode: string) {
    this.hub.remove('whiteboard', roomCode, socket);
  }

  async onMessage(socket: RtcliveSocket, roomCode: string, raw: unknown) {
    try {
      if (!roomCode || !socket.identity || !socket.participantKey) return;
      const message = whiteboardClientMessageSchema.parse(parseJson(raw));
      // 客户端消息映射为数据库事件类型；撤销也作为事件追加，保留完整操作历史。
      const event =
        message.type === 'whiteboard.stroke.add'
          ? await this.whiteboard.appendEvent(roomCode, socket.identity, socket.participantKey, 'stroke_add', message.stroke)
          : message.type === 'whiteboard.image.add'
            ? await this.whiteboard.appendEvent(roomCode, socket.identity, socket.participantKey, 'image_add', message.image)
            : message.type === 'whiteboard.stroke.undo'
              ? await this.whiteboard.appendEvent(roomCode, socket.identity, socket.participantKey, 'stroke_undo', { strokeId: message.strokeId })
              : await this.whiteboard.appendEvent(roomCode, socket.identity, socket.participantKey, 'image_undo', { imageId: message.imageId });
      this.hub.broadcast('whiteboard', roomCode, { type: 'whiteboard.event', event });
    } catch (error: any) {
      this.logger.warn(error.message);
      sendSystemError(socket, error.message || '白板消息处理失败');
    }
  }
}
