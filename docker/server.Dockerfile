# syntax=docker/dockerfile:1
# 后端镜像：Midway 4 (Koa) + TypeORM，构建上下文为仓库根目录
#   docker build -f docker/server.Dockerfile -t erp-server .

# ---------- 1. 安装依赖（含 devDependencies，构建需要 mwtsc/typescript） ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2. 编译 TypeScript ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
# mwtsc --cleanOutDir：产物输出到 /app/dist，入口仍为 /app/bootstrap.js
RUN npm run build

# ---------- 3. 运行时（仅生产依赖） ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TZ=Asia/Shanghai

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server/bootstrap.js ./bootstrap.js

USER node

EXPOSE 7001

# 与 compose 中的 healthcheck 一致；/api/ping 在鉴权白名单内，无需登录
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:7001/api/ping').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "bootstrap.js"]
