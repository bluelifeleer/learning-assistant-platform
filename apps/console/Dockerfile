# 构建上下文是仓库根目录：控制台依赖 pnpm workspace 里的 lockfile 与根配置
FROM node:20-alpine AS build

WORKDIR /repo

ENV CI=true
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# 先只拷 manifest，让依赖层可以缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/console/package.json apps/console/package.json
COPY apps/extension/package.json apps/extension/package.json
RUN pnpm install --frozen-lockfile

COPY apps/console ./apps/console

# 同源部署：前端用相对路径 /api/v1，由 nginx 反代到 api 容器
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm --filter @learn-assistant/console build

FROM nginx:1.27-alpine

COPY apps/console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/console/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
