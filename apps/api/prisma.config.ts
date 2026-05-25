import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const workspaceEnvPath = resolve(process.cwd(), '../../.env');
const localEnvPath = resolve(process.cwd(), '.env');

// Prisma CLI 可能从 apps/api 目录或仓库根目录间接运行，因此同时兼容两种 .env 位置。
if (existsSync(workspaceEnvPath)) {
  loadEnv({ path: workspaceEnvPath });
} else if (existsSync(localEnvPath)) {
  loadEnv({ path: localEnvPath });
}

export default defineConfig({
  // schema 路径相对 apps/api，和 package.json 中的 prisma 命令保持一致。
  schema: 'prisma/schema.prisma',
});
