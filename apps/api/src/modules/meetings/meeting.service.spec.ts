import { describe, expect, it } from 'vitest';
import { roomCodeSchema } from '@rtclive/shared';

describe('meeting contracts', () => {
  it('uses 4-character uppercase room codes', () => {
    // 服务层和数据库都依赖 roomCode 标准化，测试共享 schema 能保证输入统一。
    expect(roomCodeSchema.parse('z9x8')).toBe('Z9X8');
    expect(() => roomCodeSchema.parse('abc')).toThrow();
  });
});
