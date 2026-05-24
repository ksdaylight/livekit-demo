import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { whiteboardClientMessageSchema } from '@rtclive/shared';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';
import { RtcliveSocket, parseJson, sendSystemError } from '../realtime/ws-utils';
import { WhiteboardService } from './whiteboard.service';

@Injectable()
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
