import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { AppModule } from './modules/app.module';
import { ZodExceptionFilter } from './shared/zod-exception.filter';

// Nest 应用启动入口。这里显式使用 Fastify，是因为项目需要 multipart 上传和原生 WebSocket 插件。
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
  const config = app.get(ConfigService);
  // 上传上限从环境变量读取，默认 200MB，和前端/买家验收清单中的文件上传能力保持一致。
  const maxUploadBytes = Number(config.get('MAX_UPLOAD_BYTES') ?? 209_715_200);

  // helmet 提供基础安全响应头；本项目开发态包含 LiveKit/同源代理，所以先关闭严格 CSP。
  await app.register(helmet, { contentSecurityPolicy: false });
  // origin=true 允许本机/局域网开发地址访问 API；credentials 预留给后续 cookie 场景。
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  // Fastify multipart 插件负责接收会议文件和白板图片。
  await app.register(multipart, {
    limits: {
      fileSize: maxUploadBytes,
    },
  });
  // 业务 WebSocket 路由由各 Gateway 在 onModuleInit 中挂到 Fastify 实例上。
  await app.register(websocket);

  // 所有 HTTP API 统一使用 /api/v1 前缀；WebSocket 路由保持 /ws/v1，避免被全局前缀影响。
  app.setGlobalPrefix('api/v1');
  // 把 Zod/Nest 异常统一格式化成前端容易消费的 JSON。
  app.useGlobalFilters(new ZodExceptionFilter());

  const port = Number(config.get('API_PORT') ?? 3000);
  // 监听 0.0.0.0，保证 Docker 容器和局域网开发环境都能访问。
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
