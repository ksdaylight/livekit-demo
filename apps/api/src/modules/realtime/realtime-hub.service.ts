import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class RealtimeHubService {
  private readonly rooms = new Map<string, Map<string, Set<WebSocket>>>();

  add(channel: string, roomCode: string, socket: WebSocket) {
    const room = this.rooms.get(channel) ?? new Map<string, Set<WebSocket>>();
    const sockets = room.get(roomCode) ?? new Set<WebSocket>();
    sockets.add(socket);
    room.set(roomCode, sockets);
    this.rooms.set(channel, room);
  }

  remove(channel: string, roomCode: string, socket: WebSocket) {
    const room = this.rooms.get(channel);
    const sockets = room?.get(roomCode);
    sockets?.delete(socket);
    if (sockets?.size === 0) {
      room?.delete(roomCode);
    }
  }

  broadcast(channel: string, roomCode: string, payload: unknown, filter?: (socket: WebSocket) => boolean) {
    const sockets = this.rooms.get(channel)?.get(roomCode);
    if (!sockets) return;
    const text = JSON.stringify(payload);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN && (!filter || filter(socket))) {
        socket.send(text);
      }
    }
  }
}
