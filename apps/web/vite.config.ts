import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置文件位于 apps/web，真实 .env 位于仓库根目录，因此需要显式计算 workspaceRoot。
const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, '../..');

export default defineConfig(({ mode }) => {
  // 第三个参数传空字符串表示加载所有 env，而不仅仅是 VITE_ 前缀变量。
  const env = loadEnv(mode, workspaceRoot, '');
  const apiPort = env.API_PORT ?? '3000';
  const liveKitServerUrl = env.LIVEKIT_SERVER_URL ?? 'http://localhost:7880';

  return {
    // 让 Vite 客户端和服务端都以仓库根目录作为 env 文件目录。
    envDir: workspaceRoot,
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      proxy: {
        // 开发态 API 走本机 Nest 服务；Docker/生产态由 Caddy/nginx 处理反向代理。
        '/api': `http://localhost:${apiPort}`,
        // 业务 WebSocket 也代理到 Nest API，保持浏览器同源访问。
        '/ws': {
          target: `ws://localhost:${apiPort}`,
          ws: true,
        },
        // LiveKit 信令在本机开发时可能跑在虚拟机/Docker 中，所以从 LIVEKIT_SERVER_URL 读取。
        '/rtc': {
          target: liveKitServerUrl,
          ws: true,
        },
      },
    },
  };
});
