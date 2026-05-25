import { describe, expect, it } from 'vitest';
import { roomCodeSchema, updateMeetingPasswordSchema } from './schemas.js';

describe('shared schemas', () => {
  it('normalizes meeting room codes', () => {
    // 会议号输入允许小写，但系统内部统一存储/比较大写值。
    expect(roomCodeSchema.parse('a1b2')).toBe('A1B2');
  });

  it('requires participant credentials when updating meeting password', () => {
    // 主持人改密接口必须带会议内凭据，避免匿名用户直接改会议密码。
    expect(() => updateMeetingPasswordSchema.parse({ password: 'abc' })).toThrow();
    expect(
      updateMeetingPasswordSchema.parse({
        identity: 'h-abc',
        participantKey: '1234567890123456',
        password: 'abc',
      }).password,
    ).toBe('abc');
  });
});
