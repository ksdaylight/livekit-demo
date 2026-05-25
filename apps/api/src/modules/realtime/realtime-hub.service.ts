import { Injectable } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
// 内存实时广播中心。按 channel + roomCode 管理 WebSocket 集合，适合当前单实例部署。
// 如果未来水平扩容，需要替换为 Redis pub/sub 或 LiveKit data channel 等跨实例方案。
export class RealtimeHubService {
  // 结构：channel -> roomCode -> sockets。不同业务通道互相隔离，避免误广播。
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
    // 房间内没有连接后清掉 Set，避免长时间运行产生空集合。
    if (sockets?.size === 0) {
      room?.delete(roomCode);
    }
  }

  broadcast(channel: string, roomCode: string, payload: unknown, filter?: (socket: WebSocket) => boolean) {
    const sockets = this.rooms.get(channel)?.get(roomCode);
    if (!sockets) return;
    // 每次广播只序列化一次，减少房间内多连接时的重复 JSON.stringify 开销。
    const text = JSON.stringify(payload);
    for (const socket of sockets) {
      // filter 用于私聊文件等定向广播；默认发给该房间该通道的所有连接。
      if (socket.readyState === WebSocket.OPEN && (!filter || filter(socket))) {
        socket.send(text);
      }
    }
  }
}
