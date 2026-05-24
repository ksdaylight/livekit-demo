# rtcLive TS

`rtcLive TS` 有创建会议、加入会议、音视频、屏幕共享、聊天、文件、白板和主持人控制能力，并有 PostgreSQL、Redis、MinIO、登录认证和 Docker Compose 单机部署。

## 技术栈

- `apps/api`：NestJS + Fastify + Prisma + PostgreSQL + Redis + MinIO + LiveKit Server SDK
- `apps/web`：React + Vite + LiveKit React Components + TanStack Query
- `packages/shared`：Zod schema、DTO 和 WebSocket 消息类型
- `infra`：Docker Compose、Caddy 反向代理、LiveKit、MinIO

## 运行模型

先区分几个名字：

- `apps/api`：后端源码目录，里面是 NestJS API 服务。
- `api`：`infra/docker-compose.yml` 里的 Docker Compose 服务名。用 Docker 启动它时，它会变成一个运行 NestJS 后端的容器。
- `apps/web`：前端源码目录，里面是 React + Vite 页面。
- `web`：Docker Compose 服务名。用 Docker 启动它时，它会变成一个运行前端静态站点的容器。
- `postgres`、`redis`：Docker Compose 服务名，也是 Docker 内部网络里的主机名，只能被同一组 Compose 容器直接访问。

端口映射规则：

- `15432:5432` 表示宿主机的 `15432` 端口转发到 Postgres 容器内部的 `5432` 端口。
- `16379:6379` 表示宿主机的 `16379` 端口转发到 Redis 容器内部的 `6379` 端口。
- 本机进程连接 Docker 里的数据库时，用 `localhost:15432` 和 `localhost:16379`。
- Docker 容器之间互相连接时，用服务名和容器内部端口，例如 `postgres:5432` 和 `redis:6379`。

## 本地开发

本项目固定使用 `pnpm@11.2.2`。`pnpm-workspace.yaml` 中已声明 pnpm 11 所需的依赖构建脚本 allowlist，用于允许 Prisma、argon2、esbuild 等包在安装时生成必要产物。

推荐开发模式是：数据库、Redis、MinIO、LiveKit 用 Docker 跑；后端和前端用 `pnpm dev` 跑在本机。这样调试代码最快，也不会占用本机已有的 `5432/6379`。

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

这个命令只启动基础设施，不启动 `api` 和 `web` 容器。随后执行 `pnpm dev` 时，`apps/api` 和 `apps/web` 会直接跑在你的本机上。

默认端口不会占用本机已有的 PostgreSQL/Redis：

- PostgreSQL 容器内部端口仍是 `5432`，宿主机访问端口是 `15432`。
- Redis 容器内部端口仍是 `6379`，宿主机访问端口是 `16379`。
- `.env.example` 默认适配宿主机运行 `pnpm dev`，所以写的是 `localhost:15432` 和 `localhost:16379`。

生成 Prisma Client 并迁移：

```bash
pnpm db:generate
pnpm db:push
```

Prisma 说明：

- 当前项目使用 `prisma@6.19.3` 和 `@prisma/client@6.19.3`。
- `apps/api/prisma.config.ts` 会在运行 Prisma CLI 时加载仓库根目录 `.env`，解决 monorepo 下 `DATABASE_URL` 读不到的问题。
- 在 Prisma 6.19 及以前，`apps/api/prisma/schema.prisma` 的 `datasource db` 仍需要保留 `url = env("DATABASE_URL")`。
- 如果 `pnpm db:push` 报 `Environment variable not found: DATABASE_URL`，先确认已经在仓库根目录执行过 `cp .env.example .env`，并且 `.env` 里有 `DATABASE_URL`。
- Prisma 7 会要求把 datasource URL 完整迁移到 `prisma.config.ts`，并为 Prisma Client 配置 driver adapter；升级到 Prisma 7 前不要单独删除 `schema.prisma` 里的 `url`。

启动开发服务：

```bash
pnpm dev
```

默认访问：

- Web：`http://localhost:5173`
- API：`http://localhost:3000/api/v1`
- PostgreSQL：`localhost:15432`
- Redis：`localhost:16379`
- LiveKit：`ws://localhost:7880`
- MinIO Console：`http://localhost:9001`

## 全 Docker 启动

如果希望后端和前端也放进 Docker，可以启动全部服务：

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

这时 `api` 就不是“源码目录”的意思，而是 Docker Compose 里的后端服务容器。`api` 容器运行在 Docker 网络内部，所以它不能用 `localhost:15432` 连接 Postgres，因为容器里的 `localhost` 指的是容器自己。Compose 会在 `api.environment` 中覆盖这些地址：

- `DATABASE_URL` 覆盖为 `postgres:5432`
- `REDIS_URL` 覆盖为 `redis:6379`
- `MINIO_ENDPOINT` 覆盖为 `minio`
- `LIVEKIT_SERVER_URL` 覆盖为 `http://livekit:7880`

首次全 Docker 启动后初始化数据库：

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec api pnpm prisma db push
```

访问入口：

- 统一入口：`http://localhost:8080`
- 直接访问 Web 容器：`http://localhost:5173`
- 直接访问 API 容器：`http://localhost:3000/api/v1`

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
