import { describe, expect, it } from 'vitest';
import { resolveLiveKitUrl } from './livekit-url';

describe('resolveLiveKitUrl', () => {
  it('uses the current origin for same-origin configuration', () => {
    expect(resolveLiveKitUrl('same-origin', { protocol: 'https:', host: 'meet.example.com' })).toBe(
      'wss://meet.example.com',
    );
  });

  it('keeps explicit public LiveKit URLs', () => {
    expect(
      resolveLiveKitUrl('wss://livekit.example.com', {
        protocol: 'https:',
        host: 'meet.example.com',
      }),
    ).toBe('wss://livekit.example.com');
  });

  it('rewrites localhost defaults when the page is opened through a non-local host', () => {
    expect(
      resolveLiveKitUrl('ws://localhost:7880', { protocol: 'http:', host: '10.0.0.20:8080' }),
    ).toBe('ws://10.0.0.20:8080');
  });
});
