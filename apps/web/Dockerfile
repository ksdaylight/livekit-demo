FROM node:22-alpine AS base
# 使用 Corepack 激活 package.json 中声明的 pnpm 版本，避免构建环境版本漂移。
RUN corepack enable
WORKDIR /app

FROM base AS deps
# 只拷贝依赖声明文件，Docker 可以在业务源码变化时复用 pnpm install 缓存层。
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @rtclive/web... --frozen-lockfile=false

FROM deps AS build
# 依赖安装完成后再拷贝源码，防止宿主机 node_modules 覆盖容器内依赖。
COPY . .
# 预留给前端构建的 API 前缀参数；当前代码默认使用同源 /api/v1。
ARG VITE_API_BASE=/api/v1
# Web 类型检查会引用 shared 源码/类型，生产构建前先生成 shared dist。
RUN pnpm --filter @rtclive/shared build
RUN pnpm --filter @rtclive/web build

FROM nginx:1.27-alpine AS runtime
# Vite 构建产物是静态文件，nginx 负责提供页面和资源。
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# 自定义 nginx 配置用于 SPA fallback。
COPY infra/nginx-web.conf /etc/nginx/conf.d/default.conf
