import { Logger, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { chatClientMessageSchema } from '@rtclive/shared';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';
import { RtcliveSocket, parseJson, sendSystemError } from '../realtime/ws-utils';
import { ChatService } from './chat.service';

export class ChatGateway implements OnModuleInit {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly participants: ParticipantService,
    private readonly chat: ChatService,
    private readonly hub: RealtimeHubService,
  ) {}

  onModuleInit() {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance();
    fastify.get('/ws/v1/rooms/:roomCode/chat', { websocket: true }, (connection: { socket: RtcliveSocket }, request: any) => {
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
      this.hub.add('chat', roomCode, socket);
      const snapshot = await this.chat.snapshot(roomCode, identity, participantKey);
      socket.send(JSON.stringify({ type: 'chat.snapshot', ...snapshot }));
    } catch (error: any) {
      sendSystemError(socket, error.message || '聊天通道连接失败');
      socket.close();
    }
  }

  handleDisconnect(socket: RtcliveSocket, roomCode: string) {
    this.hub.remove('chat', roomCode, socket);
  }

  async onMessage(socket: RtcliveSocket, roomCode: string, raw: unknown) {
    try {
      if (!roomCode || !socket.identity || !socket.participantKey) return;
      const message = chatClientMessageSchema.parse(parseJson(raw));
      const payload = await this.chat.append(roomCode, socket.identity, socket.participantKey, message.content);
      this.hub.broadcast('chat', roomCode, { type: 'chat.message', message: payload });
    } catch (error: any) {
      this.logger.warn(error.message);
      sendSystemError(socket, error.message || '聊天消息处理失败');
    }
  }
}
