import { BadRequestException } from '@nestjs/common';
import { WebSocket } from 'ws';

export interface RtcliveSocket extends WebSocket {
  identity?: string;
  participantKey?: string;
}

export function parseJson(raw: unknown) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
    throw new BadRequestException('消息格式无效');
  }
  return JSON.parse(raw.toString());
}

export function sendSystemError(socket: WebSocket, message: string) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'system.error', message }));
  }
}
