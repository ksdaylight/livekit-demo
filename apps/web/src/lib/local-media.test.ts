import { describe, expect, it } from 'vitest';
import { canUseLocalMedia, localMediaUnavailableMessage } from './local-media';

describe('local media support', () => {
  it('detects getUserMedia support', () => {
    // 只要 navigator.mediaDevices.getUserMedia 是函数，就认为浏览器支持本地媒体采集。
    expect(
      canUseLocalMedia({
        mediaDevices: { getUserMedia: () => Promise.resolve({}) },
      }),
    ).toBe(true);
    expect(canUseLocalMedia({})).toBe(false);
  });

  it('returns no warning when getUserMedia is available', () => {
    // HTTPS 页面且浏览器支持 getUserMedia 时，不需要展示额外提示。
    expect(
      localMediaUnavailableMessage(
        { protocol: 'https:', host: 'meet.example.com' },
        { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      ),
    ).toBe('');
  });

  it('explains insecure LAN origins for Chrome', () => {
    // Chrome 会限制非安全上下文访问摄像头/麦克风，这个提示用于局域网 HTTP 调试。
    expect(
      localMediaUnavailableMessage({ protocol: 'http:', host: '192.168.80.6:5173' }, {}),
    ).toContain('chrome://flags/#unsafely-treat-insecure-origin-as-secure');
  });
});
