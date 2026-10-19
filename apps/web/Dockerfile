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
COPY apps/web/ ./apps/web/

RUN pnpm --filter @nivaran/web exec vite build

FROM nginx:1.27-alpine AS runtime

COPY --from=builder /build/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx

USER nginx
EXPOSE 5173

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:5173/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
