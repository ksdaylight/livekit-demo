# rtcLive TS Docker 部署说明

## 1. 准备

服务器建议：

- Debian 11/12 或 Ubuntu 22.04+
- Docker 与 Docker Compose Plugin
- 至少 2C4G，生产建议 4C8G+

复制环境变量：

```bash
cp .env.example .env
```

几个关键概念：

- `apps/api` 是 NestJS 后端源码目录。
- `api` 是 Docker Compose 服务名。全 Docker 启动时，`api` 会变成运行后端的容器。
- `postgres`、`redis`、`minio`、`livekit` 都是 Compose 服务名。容器之间可以直接用这些服务名访问。
- 宿主机访问容器需要用映射端口，例如 `localhost:15432`；容器访问容器需要用服务名，例如 `postgres:5432`。

必须修改：

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `POSTGRES_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `LIVEKIT_URL`
- `LIVEKIT_SERVER_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

## 2. 启动

全 Docker 启动会同时启动基础设施、后端 `api` 容器、前端 `web` 容器和反向代理：

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

`.env.example` 默认是本机开发配置，里面的 `DATABASE_URL` 是 `localhost:15432`，`REDIS_URL` 是 `localhost:16379`。全 Docker 启动时，Compose 会给 `api` 容器覆盖为容器内部地址：

- `DATABASE_URL=postgresql://...@postgres:5432/...`
- `REDIS_URL=redis://redis:6379`
- `MINIO_ENDPOINT=minio`
- `LIVEKIT_SERVER_URL=http://livekit:7880`

这些覆盖只影响 `api` 容器，不会改写你的 `.env` 文件。

首次启动后初始化数据库结构：

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec api pnpm prisma db push
```

这里的 `exec api` 表示“进入正在运行的 `api` 后端容器执行命令”，不是进入 `apps/api` 目录。

访问：

```text
http://服务器IP:8080
```

## 3. 端口

- `8080/TCP`：Web/API/WS 统一入口
- `15432/TCP`：PostgreSQL 宿主机开发访问端口，容器内部仍使用 `5432`
- `16379/TCP`：Redis 宿主机开发访问端口，容器内部仍使用 `6379`
- `7880/TCP`：LiveKit HTTP/WebSocket
- `7881/TCP`：LiveKit RTC TCP
- `50000-50100/UDP`：LiveKit RTC UDP 示例范围
- `9000/TCP`：MinIO API
- `9001/TCP`：MinIO Console

端口写法示例：

- `15432:5432`：左边 `15432` 是宿主机端口，右边 `5432` 是容器内部端口。
- 本机工具连接 PostgreSQL 时用 `localhost:15432`。
- `api` 容器连接 PostgreSQL 时用 `postgres:5432`。

生产环境建议用域名和 HTTPS，将 Caddy 改为自动签证书配置，并按 LiveKit 官方生产配置放开完整 UDP 端口范围。PostgreSQL 和 Redis 的 `ports` 映射主要用于本机开发；生产环境如无外部访问需求，建议移除这两个映射或仅绑定到内网/本机地址。

## 4. 验收

- 主持人注册和登录
- 创建 4 位会议
- 访客用昵称和密码加入
- 音频、视频、屏幕共享
- 聊天消息同步
- 文件上传和下载
- 白板绘制和图片上传
- 主持人全员禁言、媒体锁定、清空白板、解散会议
- 解散后不能继续加入，主持人可查看历史
