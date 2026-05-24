import { describe, expect, it } from 'vitest';
import { roomCodeSchema, updateMeetingPasswordSchema } from './schemas';

describe('shared schemas', () => {
  it('normalizes meeting room codes', () => {
    expect(roomCodeSchema.parse('a1b2')).toBe('A1B2');
  });

  it('requires participant credentials when updating meeting password', () => {
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
