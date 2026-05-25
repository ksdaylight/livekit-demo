import { defineWorkspace } from 'vitest/config';

// Vitest workspace 同时纳入 API、Web 和 shared 包，便于根目录一次性跑完整测试。
export default defineWorkspace(['apps/api', 'apps/web', 'packages/shared']);
