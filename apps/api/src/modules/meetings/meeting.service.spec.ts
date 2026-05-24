import { describe, expect, it } from 'vitest';
import { roomCodeSchema } from '@rtclive/shared';

describe('meeting contracts', () => {
  it('uses 4-character uppercase room codes', () => {
    expect(roomCodeSchema.parse('z9x8')).toBe('Z9X8');
    expect(() => roomCodeSchema.parse('abc')).toThrow();
  });
});
