import { BadRequestException } from '@nestjs/common';
import { WebSocket } from 'ws';

// 业务 WebSocket 会在连接认证后把会议内身份挂到 socket 上，广播过滤时直接读取。
export interface RtcliveSocket extends WebSocket {
  identity?: string;
  participantKey?: string;
}

// 统一解析客户端 WebSocket 文本消息；非字符串/Buffer 直接视为非法消息。
export function parseJson(raw: unknown) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
    throw new BadRequestException('消息格式无效');
  }
  return JSON.parse(raw.toString());
}

// WebSocket 无法走 HTTP 异常过滤器，所以用 system.error 事件把可恢复错误发给前端。
export function sendSystemError(socket: WebSocket, message: string) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'system.error', message }));
  }
}
