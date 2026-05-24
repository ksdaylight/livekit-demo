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

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

首次启动后初始化数据库结构：

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec api pnpm prisma db push
```

访问：

```text
http://服务器IP:8080
```

## 3. 端口

- `8080/TCP`：Web/API/WS 统一入口
- `7880/TCP`：LiveKit HTTP/WebSocket
- `7881/TCP`：LiveKit RTC TCP
- `50000-50100/UDP`：LiveKit RTC UDP 示例范围
- `9000/TCP`：MinIO API
- `9001/TCP`：MinIO Console

生产环境建议用域名和 HTTPS，将 Caddy 改为自动签证书配置，并按 LiveKit 官方生产配置放开完整 UDP 端口范围。

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
