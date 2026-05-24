import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly roomClient: RoomServiceClient;

  constructor(private readonly config: ConfigService) {
    this.roomClient = new RoomServiceClient(
      this.config.get<string>('LIVEKIT_SERVER_URL') ?? 'http://localhost:7880',
      this.config.get<string>('LIVEKIT_API_KEY') ?? 'devkey',
      this.config.get<string>('LIVEKIT_API_SECRET') ?? 'secret',
    );
  }

  getPublicUrl() {
    return this.config.get<string>('LIVEKIT_URL') ?? 'ws://localhost:7880';
  }

  async ensureRoom(roomCode: string) {
    try {
      await this.roomClient.createRoom({ name: roomCode });
    } catch (error: any) {
      const message = String(error?.message ?? '');
      if (!message.includes('already exists') && !message.includes('409')) {
        throw new ServiceUnavailableException('创建 LiveKit 房间失败');
      }
    }
  }

  async removeParticipant(roomCode: string, identity: string) {
    try {
      await this.roomClient.removeParticipant(roomCode, identity);
    } catch {
      throw new ServiceUnavailableException('调用 LiveKit 踢人失败');
    }
  }

  async deleteRoom(roomCode: string) {
    try {
      await this.roomClient.deleteRoom(roomCode);
    } catch {
      // LiveKit room may have already disappeared; local meeting state is the source of truth here.
    }
  }

  async createJoinToken(input: { roomCode: string; identity: string; displayName: string }) {
    const token = new AccessToken(
      this.config.get<string>('LIVEKIT_API_KEY') ?? 'devkey',
      this.config.get<string>('LIVEKIT_API_SECRET') ?? 'secret',
      {
        identity: input.identity,
        name: input.displayName,
        ttl: Number(this.config.get('LIVEKIT_TOKEN_TTL_SECONDS') ?? 7200),
      },
    );
    token.addGrant({ roomJoin: true, room: input.roomCode });
    return token.toJwt();
  }
}
