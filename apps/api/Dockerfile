FROM node:22-alpine AS base
# Corepack 根据 packageManager 字段启用固定版本 pnpm，保证本地和容器构建工具一致。
RUN corepack enable
WORKDIR /app

FROM base AS deps
# 先拷贝 lockfile 和各 workspace 的 package.json，让依赖安装层可以被 Docker 缓存复用。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @rtclive/api... --frozen-lockfile=false

FROM deps AS build
# 再拷贝完整源码，避免宿主机源码变化导致依赖层重复安装。
COPY . .
# API 编译依赖 @rtclive/shared 的 dist 产物，所以先构建共享包。
RUN pnpm --filter @rtclive/shared build
# Prisma Client 根据 schema 生成到 node_modules，必须在 Nest 构建前完成。
RUN pnpm --filter @rtclive/api prisma generate
RUN pnpm --filter @rtclive/api build

FROM base AS runtime
ENV NODE_ENV=production
# 运行层只复制已安装依赖和构建产物，减少镜像中无关构建缓存。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
# Nest CLI 的 monorepo 输出路径位于 apps/api/dist/apps/api/src/main.js。
CMD ["node", "dist/apps/api/src/main.js"]
