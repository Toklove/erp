# syntax=docker/dockerfile:1
# 前端镜像：Vite 构建静态文件 + Nginx 托管，并把 /api 反向代理到 server
#   docker build -f docker/web.Dockerfile -t erp-web .

# ---------- 1. 构建静态文件 ----------
FROM node:20-bookworm-slim AS build
WORKDIR /build

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund

# web/vite.config.ts 的 @shared 别名指向 ../server/src/shared，必须一起带进构建上下文
COPY server/src/shared ./server/src/shared
COPY web ./web

# tsbuildinfo 是增量编译缓存，镜像内不需要（跨机器会失效）
RUN cd web && rm -f tsconfig.tsbuildinfo && npm run build

# ---------- 2. Nginx 托管 ----------
FROM nginx:1.27-alpine

ENV TZ=Asia/Shanghai

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
