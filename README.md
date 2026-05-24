# rtcLive TS

`rtcLive TS` 有创建会议、加入会议、音视频、屏幕共享、聊天、文件、白板和主持人控制能力，并有 PostgreSQL、Redis、MinIO、登录认证和 Docker Compose 单机部署。

## 技术栈

- `apps/api`：NestJS + Fastify + Prisma + PostgreSQL + Redis + MinIO + LiveKit Server SDK
- `apps/web`：React + Vite + LiveKit React Components + TanStack Query
- `packages/shared`：Zod schema、DTO 和 WebSocket 消息类型
- `infra`：Docker Compose、Caddy 反向代理、LiveKit、MinIO

## 本地开发

本项目固定使用 `pnpm@11.2.2`。`pnpm-workspace.yaml` 中已声明 pnpm 11 所需的依赖构建脚本 allowlist，用于允许 Prisma、argon2、esbuild 等包在安装时生成必要产物。

先复制环境变量：

```bash
cp .env.example .env
```

安装依赖：

```bash
pnpm install
```

启动基础设施：

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres redis minio minio-init livekit
```

生成 Prisma Client 并迁移：

```bash
pnpm db:generate
pnpm db:push
```

启动开发服务：

```bash
pnpm dev
```

默认访问：

- Web：`http://localhost:5173`
- API：`http://localhost:3000/api/v1`
- LiveKit：`ws://localhost:7880`
- MinIO Console：`http://localhost:9001`

## 生产化说明

第一版按单机 Docker Compose 设计，入口建议使用 `reverse-proxy` 暴露的 `http://localhost:8080`。正式部署时请修改 `.env` 中所有密钥、域名、LiveKit 地址和 MinIO 密码。

## 当前范围

已实现：

- 主持人邮箱密码注册/登录
- 创建会议、访客加入、离会、解散、历史会议
- LiveKit token 生成和房间管理
- 聊天 WebSocket 和持久化
- 文件上传下载到 MinIO
- 白板事件流和图片上传
- 主持人聊天禁言、媒体锁定、清空白板、踢人接口

后续建议：

- 增加 Redis Pub/Sub WebSocket 适配器以支持多 API 实例
- 增加更完整的参会者列表和可视化主持人控制
- 增加 Playwright 双浏览器 E2E
- 增加 HTTPS/TURN 的生产 LiveKit 配置
