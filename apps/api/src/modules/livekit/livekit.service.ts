import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
// LiveKit 服务封装房间管理和 token 签发，避免业务模块直接依赖 livekit-server-sdk。
export class LiveKitService {
  private readonly roomClient: RoomServiceClient;

  constructor(private readonly config: ConfigService) {
    // LIVEKIT_SERVER_URL 是 API 访问 LiveKit 的服务端地址，本机开发可指向虚拟机/Docker 映射端口。
    this.roomClient = new RoomServiceClient(
      this.config.get<string>('LIVEKIT_SERVER_URL') ?? 'http://localhost:7880',
      this.config.get<string>('LIVEKIT_API_KEY') ?? 'devkey',
      this.config.get<string>('LIVEKIT_API_SECRET') ?? 'secret',
    );
  }

  getPublicUrl() {
    // LIVEKIT_URL 是发给浏览器的地址；same-origin 表示前端通过 /rtc 代理连接。
    return this.config.get<string>('LIVEKIT_URL')?.trim() || 'same-origin';
  }

  async ensureRoom(roomCode: string) {
    try {
      await this.roomClient.createRoom({ name: roomCode });
    } catch (error: any) {
      const message = String(error?.message ?? '');
      // LiveKit 房间已存在属于可接受状态，创建/加入会议可以继续。
      if (!message.includes('already exists') && !message.includes('409')) {
        throw new ServiceUnavailableException('创建 LiveKit 房间失败');
      }
    }
  }

  async removeParticipant(roomCode: string, identity: string) {
    try {
      // 主持人踢人时同时移除 LiveKit 里的媒体连接。
      await this.roomClient.removeParticipant(roomCode, identity);
    } catch {
      throw new ServiceUnavailableException('调用 LiveKit 踢人失败');
    }
  }

  async deleteRoom(roomCode: string) {
    try {
      await this.roomClient.deleteRoom(roomCode);
    } catch {
      // LiveKit 房间可能已经因无人或服务重启消失；会议业务状态以本地数据库为准。
    }
  }

  async createJoinToken(input: { roomCode: string; identity: string; displayName: string }) {
    // LiveKit token 只授予加入指定 room 的权限，identity/name 用于客户端和服务端事件识别。
    const token = new AccessToken(
      this.config.get<string>('LIVEKIT_API_KEY') ?? 'devkey',
      this.config.get<string>('LIVEKIT_API_SECRET') ?? 'secret',
      {
        identity: input.identity,
        name: input.displayName,
        ttl: Number(this.config.get('LIVEKIT_TOKEN_TTL_SECONDS') ?? 7200),
      },
    );
    // roomJoin grant 限定只能加入当前会议号对应的 LiveKit 房间。
    token.addGrant({ roomJoin: true, room: input.roomCode });
    return token.toJwt();
  }
}
