# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /build

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN corepack enable && corepack prepare pnpm@10.34.7 --activate
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @nivaran/shared run build
RUN pnpm --filter @nivaran/api run build
RUN pnpm --filter @nivaran/api --prod --legacy deploy /deploy \
    && cp -r /build/apps/api/dist /deploy/dist \
    && test -f /deploy/node_modules/@nivaran/shared/dist/index.js

FROM node:22-alpine AS runtime
WORKDIR /app
ENV IN_DOCKER=1

RUN addgroup -S nivaran && adduser -S -G nivaran nivaran \
    && apk add --no-cache wget

COPY --from=builder /deploy ./

USER nivaran
EXPOSE 4000

CMD ["node", "dist/index.js"]
