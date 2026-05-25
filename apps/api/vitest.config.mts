import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // 测试时直接解析 shared 源码，避免测试前必须先构建 packages/shared/dist。
      '@rtclive/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // API 单测运行在 Node 环境，不需要 jsdom。
    environment: 'node',
  },
});
