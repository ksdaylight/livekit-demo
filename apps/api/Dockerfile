FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @rtclive/api... --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @rtclive/shared build
RUN pnpm --filter @rtclive/api prisma generate
RUN pnpm --filter @rtclive/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
CMD ["node", "dist/apps/api/src/main.js"]
