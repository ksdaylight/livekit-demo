import { describe, expect, it } from 'vitest';
import { resolveLiveKitUrl } from './livekit-url';

describe('resolveLiveKitUrl', () => {
  it('uses the current origin for same-origin configuration', () => {
    // same-origin 是推荐配置，浏览器会连接当前域名，再由 /rtc 代理到 LiveKit。
    expect(resolveLiveKitUrl('same-origin', { protocol: 'https:', host: 'meet.example.com' })).toBe(
      'wss://meet.example.com',
    );
  });

  it('keeps explicit public LiveKit URLs', () => {
    // 如果部署时提供了公网 wss 地址，前端应原样使用。
    expect(
      resolveLiveKitUrl('wss://livekit.example.com', {
        protocol: 'https:',
        host: 'meet.example.com',
      }),
    ).toBe('wss://livekit.example.com');
  });

  it('rewrites localhost defaults when the page is opened through a non-local host', () => {
    // 局域网访问时不能把 ws://localhost:7880 发给浏览器，否则会连接用户自己的电脑。
    expect(
      resolveLiveKitUrl('ws://localhost:7880', { protocol: 'http:', host: '10.0.0.20:8080' }),
    ).toBe('ws://10.0.0.20:8080');
  });
});
