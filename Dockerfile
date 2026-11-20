# syntax=docker/dockerfile:1
# ============================================================
# 微信云托管镜像（Serverless 单容器）
#
# 云托管只暴露一个端口，所以这里把 web 构建产物打进后端镜像，由 Koa 直接托管：
#   /api/*  → Midway 控制器
#   /*      → web/dist 静态文件（未命中回落 index.html，交给前端路由）
#
# 构建（仓库根目录执行）：
#   docker build -t erp-cloud .
#   docker run --rm -p 8080:8080 -e MYSQL_ADDRESS=host:3306 -e MYSQL_USERNAME=root \
#     -e MYSQL_PASSWORD=xxx -e MYSQL_DATABASE=erp erp-cloud
#
# 云托管控制台「从代码仓库部署」会自动读取 container.config.json，
# 也可以直接把本文件当 Dockerfile 上传。
# ============================================================

# ---------- 1. 构建 web 静态文件 ----------
FROM node:20-bookworm-slim AS web-build
WORKDIR /app

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund

# vite.config.ts 的 @shared 别名指向 ../server/src/shared，必须一起带进来
COPY server/src/shared ./server/src/shared
COPY web ./web

# tsbuildinfo 是增量缓存，跨机器会失效
RUN cd web && rm -f tsconfig.tsbuildinfo && npm run build

# ---------- 2. 编译后端 ----------
FROM node:20-bookworm-slim AS server-build
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/ ./
RUN npm run build

# ---------- 3. 运行时（单容器：API + 静态页） ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=Asia/Shanghai \
    PORT=8080 \
    WEB_DIST=/app/web/dist

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=server-build /app/dist ./dist
COPY server/bootstrap.js ./bootstrap.js
COPY --from=web-build /app/web/dist ./web/dist

# 用非 root 运行；8080 不涉及特权端口，云托管只需要 containerPort 对齐
USER node

EXPOSE 8080

# 就绪探针带数据库检查：连不上库返回 503，云托管不会把流量导进来
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "bootstrap.js"]