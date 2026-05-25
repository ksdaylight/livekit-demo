FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @rtclive/web... --frozen-lockfile=false

FROM deps AS build
COPY . .
ARG VITE_API_BASE=/api/v1
RUN pnpm --filter @rtclive/shared build
RUN pnpm --filter @rtclive/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx-web.conf /etc/nginx/conf.d/default.conf
