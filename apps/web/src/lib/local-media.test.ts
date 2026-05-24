import { describe, expect, it } from 'vitest';
import { canUseLocalMedia, localMediaUnavailableMessage } from './local-media';

describe('local media support', () => {
  it('detects getUserMedia support', () => {
    expect(
      canUseLocalMedia({
        mediaDevices: { getUserMedia: () => Promise.resolve({}) },
      }),
    ).toBe(true);
    expect(canUseLocalMedia({})).toBe(false);
  });

  it('returns no warning when getUserMedia is available', () => {
    expect(
      localMediaUnavailableMessage(
        { protocol: 'https:', host: 'meet.example.com' },
        { mediaDevices: { getUserMedia: () => Promise.resolve({}) } },
      ),
    ).toBe('');
  });

  it('explains insecure LAN origins for Chrome', () => {
    expect(
      localMediaUnavailableMessage({ protocol: 'http:', host: '192.168.80.6:5173' }, {}),
    ).toContain('chrome://flags/#unsafely-treat-insecure-origin-as-secure');
  });
});
