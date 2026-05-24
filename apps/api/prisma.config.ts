import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

const workspaceEnvPath = resolve(process.cwd(), '../../.env');
const localEnvPath = resolve(process.cwd(), '.env');

if (existsSync(workspaceEnvPath)) {
  loadEnv({ path: workspaceEnvPath });
} else if (existsSync(localEnvPath)) {
  loadEnv({ path: localEnvPath });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
