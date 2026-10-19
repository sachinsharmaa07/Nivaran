# syntax=docker/dockerfile:1

FROM node:22.18-alpine3.24 AS builder
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

RUN pnpm --filter @nivaran/api exec tsc --project tsconfig.json

FROM node:22.18-alpine3.24 AS runtime
WORKDIR /app

RUN addgroup -S nivaran && adduser -S -G nivaran nivaran \
    && apk add --no-cache wget

COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/api/dist ./dist
COPY --from=builder /build/apps/api/package.json ./package.json

USER nivaran
EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "dist/index.js"]
