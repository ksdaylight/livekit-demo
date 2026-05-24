import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { AppModule } from './modules/app.module';
import { ZodExceptionFilter } from './shared/zod-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));
  const config = app.get(ConfigService);
  const maxUploadBytes = Number(config.get('MAX_UPLOAD_BYTES') ?? 209_715_200);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(multipart, {
    limits: {
      fileSize: maxUploadBytes,
    },
  });
  await app.register(websocket);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ZodExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const port = Number(config.get('API_PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
