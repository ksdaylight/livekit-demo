import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const apiPort = env.API_PORT ?? '3000';
  const liveKitServerUrl = env.LIVEKIT_SERVER_URL ?? 'http://localhost:7880';

  return {
    envDir: workspaceRoot,
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        '/ws': {
          target: `ws://localhost:${apiPort}`,
          ws: true,
        },
        '/rtc': {
          target: liveKitServerUrl,
          ws: true,
        },
      },
    },
  };
});
