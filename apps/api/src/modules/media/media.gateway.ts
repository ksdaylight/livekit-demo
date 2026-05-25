import { Injectable, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ParticipantService } from '../participants/participant.service';
import { RealtimeHubService } from '../realtime/realtime-hub.service';
import { RtcliveSocket, sendSystemError } from '../realtime/ws-utils';
import { MediaService } from './media.service';

@Injectable()
// 媒体控制 WebSocket 网关：主要用于向客户端推送主持人设置的音频/视频/屏幕锁。
export class MediaGateway implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly participants: ParticipantService,
    private readonly media: MediaService,
    private readonly hub: RealtimeHubService,
  ) {}

  onModuleInit() {
    const fastify = this.httpAdapterHost.httpAdapter.getInstance();
    // 该通道当前只需要服务端推送，客户端连接后不发送业务消息。
    fastify.get('/ws/v1/rooms/:roomCode/media-control', { websocket: true }, (connection: { socket: RtcliveSocket }, request: any) => {
      const socket = connection.socket;
      const roomCode = String(request.params.roomCode).toUpperCase();
      const identity = String(request.query.identity ?? '');
      const participantKey = String(request.query.participantKey ?? '');
      void this.handleConnection(socket, roomCode, identity, participantKey);
      socket.on('close', () => this.handleDisconnect(socket, roomCode));
    });
  }

  async handleConnection(socket: RtcliveSocket, roomCode: string, identity: string, participantKey: string) {
    try {
      await this.participants.requireParticipant(roomCode, identity, participantKey);
      socket.identity = identity;
      socket.participantKey = participantKey;
      this.hub.add('media-control', roomCode, socket);
      // 连接后立即下发完整媒体锁快照，避免刷新页面后按钮状态丢失。
      socket.send(JSON.stringify({ type: 'media.snapshot', participants: await this.media.snapshot(roomCode, identity, participantKey) }));
    } catch (error: any) {
      sendSystemError(socket, error.message || '媒体控制通道连接失败');
      socket.close();
    }
  }

  handleDisconnect(socket: RtcliveSocket, roomCode: string) {
    this.hub.remove('media-control', roomCode, socket);
  }
}
