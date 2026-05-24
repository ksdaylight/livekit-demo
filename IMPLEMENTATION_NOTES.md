# Implementation Notes

## 已落地

- `pnpm` monorepo：`apps/api`、`apps/web`、`packages/shared`。
- `pnpm@11.2.2` 项目固定版本，并在 `pnpm-workspace.yaml` 中配置 `allowBuilds` 以兼容 pnpm 11 的构建脚本审批机制。
- NestJS + Fastify API，统一 `/api/v1`。
- Fastify 原生 WebSocket 路由，统一 `/ws/v1/rooms/:roomCode/*`。
- Prisma PostgreSQL 数据模型。
- Prisma CLI 使用 `apps/api/prisma.config.ts` 加载仓库根目录 `.env`；当前仍基于 Prisma 6.19，`schema.prisma` 需要保留 datasource `url`。
- 主持人邮箱密码注册/登录、JWT access token、refresh token。
- LiveKit token、创建房间、踢人、删除房间服务。
- 会议创建、加入、离开、解散、历史记录。
- 聊天、文件、白板、媒体控制模块。
- React + Vite 前端，包含入口页、会议页和实时面板。
- Docker Compose：Postgres、Redis、MinIO、LiveKit、API、Web、Caddy。
- 交付文档：`README.md`、`DEPLOYMENT_DOCKER.md`、`BUYER_CHECKLIST.md`。

## 验证结果

2026-05-24 已在本机用 `pnpm@11.2.2` 完成：

- `pnpm install`
- `pnpm db:generate`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

以上命令均通过。构建时 Vite 提示主 JS chunk 超过 500KB，这是 LiveKit/React 依赖导致的体积警告，不影响构建结果；后续可通过路由级 dynamic import 或 manual chunks 优化。

## 当前限制

- 当前 WebSocket 广播是单 API 实例内存 Hub；多实例部署需要 Redis Pub/Sub 或 Socket adapter。
- 前端主持人媒体控制第一版需要手动输入目标 `identity`，后续应增加参会者列表和按钮化控制。
- 白板第一版实现为基础画笔/图片事件流，复杂缩放、撤销 UI 和截图导出可后续增强。
- Docker 部署第一版使用 `prisma db push` 初始化数据库；正式长期维护建议生成并提交 Prisma migrations。
