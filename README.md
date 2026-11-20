# 仓库 ERP

Midway 4 + React 19 + MySQL 8 的仓库 ERP，面向**单人开发**裁剪过：模块化单体、一套 TypeScript、不做微服务。

当前已打通「物料 → 单据 → 审核 → 过账 → 库存 → 打印」的完整闭环。

## 目录

```
erp/
├─ server/                  Midway 4（Koa）后端
│  ├─ src/
│  │  ├─ configuration.ts   组件装配（koa / validation / typeorm / jwt）
│  │  ├─ config/            环境配置（数据库、JWT、端口）
│  │  ├─ entity/            TypeORM 实体（与 db/schema.sql 对应）
│  │  ├─ middleware/        error（统一异常）/ auth（JWT 鉴权）
│  │  ├─ service/           auth / item / doc(单据) / stock(过账核心) / import(管家婆导入) / master-data(档案解析)
│  │  ├─ controller/        ping / auth / md / doc / stock / import
│  │  ├─ common/            biz-error / money(decimal 封装)
│  │  └─ shared/            ★ 前后端共享枚举（web 通过 @shared 引用）
│  ├─ scripts/              e2e / 导入 / 数据修复脚本
│  └─ bootstrap.js          启动入口
├─ web/                     React 19 + Vite + AntD 6
│  ├─ src/api/              请求封装 + 接口定义（client / doc / md / import）
│  ├─ src/components/       AutoCompleteInput（历史值自动补全）
│  ├─ src/config/           company.ts（打印抬头）
│  ├─ src/hooks/            useIsMobile（移动端判定）
│  ├─ src/layouts/          基础布局（侧边栏 / 抽屉 + 标题映射）
│  ├─ src/utils/            cn-money.ts（人民币大写 / 金额格式化）
│  └─ src/pages/            登录 / 业务单据(列表·编辑·详情·打印) / 物料档案 / 管家婆导入
├─ miniapp/                 uni-app（Vue3 + Vite）微信小程序端，只做业务单据
│  ├─ src/api/              请求封装（uni.request / 云托管 callContainer 双通道）
│  ├─ src/components/       hint-input（历史值自动补全，easycom）
│  ├─ src/pages/            登录 / 单据列表·详情·编辑·打印
│  └─ src/utils/            format.ts（人民币大写 / 状态映射）
├─ docker/                  容器化文件
│  ├─ server.Dockerfile     后端镜像（多阶段构建）
│  ├─ web.Dockerfile        前端镜像（nginx）
│  ├─ nginx.conf            SPA 回落 + /api 反代
│  └─ mysql/                初始化脚本 01-schema → 05-wx-login（+ init/ 数据快照）
├─ Dockerfile               ★ 微信云托管单容器镜像（静态页 + API 同源）
├─ container.config.json    ★ 微信云托管部署参数（端口 / 规格 / 缩容到 0）
├─ docker-compose.yml       自有服务器一键部署（MySQL + server + web）
├─ tools/etl/               管家婆迁移（M4，占位）
└─ ../db/
   ├─ schema.sql            建表脚本（20 张表）
   ├─ seed.sql              初始化数据（admin/admin123）
   ├─ samples/              导入样例（gjp-sample.json 按管家婆真实字段造）
   └─ migrations/           增量迁移（002_doc.sql = 单据模块、003_doc_line_docno.sql）
```

## 快速开始

```bash
# 1. 建库（MySQL 8.0+）
mysql -u root -p < ../db/schema.sql
mysql -u root -p < ../db/seed.sql

# 已有库时只跑增量迁移（本机 mysql 客户端不在 PATH，用 node 脚本跑，按顺序执行）
cd server
node scripts/apply-sql.js ../../db/migrations/002_doc.sql
node scripts/apply-sql.js ../../db/migrations/003_doc_line_docno.sql
cd ..

# 2. 装依赖
npm run install:all

# 3. 起后端（7001）
npm run dev:server

# 4. 起前端（5173，已配 /api 代理）
npm run dev:web

# 5. 造一批能直接看效果的演示数据（可清：node scripts/seed-demo.js --clean）
cd server && node scripts/seed-demo.js
```

打开 `http://localhost:5173/` 就是单据列表；点单号看详情，点「打印」出新窗口，`Ctrl+P` 按针式连续纸预览。

默认连接：`127.0.0.1:3306 / root / 123456 / 库名 erp`，可用环境变量覆盖：
`DB_HOST DB_PORT DB_USER DB_PASS DB_NAME JWT_SECRET PORT`（改数据库账号直接改 `src/config/config.default.ts` 的默认值，或设环境变量）。

登录：`admin / admin123`（**上线前必须改**，改密码用 `hashPassword()` 重新生成 `password_hash`）。

### 没有 MySQL 时先跑通骨架

```bash
DISABLE_DB=1 npm run dev:server
```

此时只加载路由与鉴权，不连数据库，可用于前端联调。

## 部署

三种形态按场景选：

| 场景 | 用什么 | 入口 |
|---|---|---|
| 自有服务器 / 内网 | `docker compose`（MySQL + server + nginx） | `http://<服务器IP>:8989` |
| 微信云托管（Serverless） | 根目录 `Dockerfile` + `container.config.json` | 云托管分配的公网域名 |
| 本地开发 | `npm run dev:server` + `npm run dev:web` | `http://localhost:5173` |

配置全部走环境变量：云托管注入的 `MYSQL_ADDRESS`（形如 `10.0.0.12:3306`）、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`、`PORT` 优先，没有再回退到 `DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME / PORT`，所以同一份代码两种部署都不用改配置文件。

### A. docker compose（自有服务器）

```bash
cp .env.example .env      # 按需改密码与端口
docker compose up -d --build
docker compose ps
```

`.env` 里只需要关心三项：

```
MYSQL_ROOT_PASSWORD=GXNNante2026   # MySQL root 密码，后端也用这个账号连库
WEB_PORT=8989                      # 宿主机对外端口（容器内仍是 80）
DB_NAME=erp
```

- 对外只暴露 `web`：nginx 托管 React 静态文件并把 `/api` 反代到 `server:7001`；`mysql` 与 `server` 都只在 `erp-net` 网络内，不映射宿主端口。
- 数据在命名卷 `erp-mysql-data`；`docker compose down` 保留数据，只有 `down -v` 才会删。
- **首次启动**（数据卷为空）MySQL 会按文件名顺序执行 `docker/mysql/init/` 里的脚本：先是 `erp-2026-11-19_011449-dump.sql` 数据快照，再是 `zz-wx-login.sql` 补上微信绑定字段。
- **已有数据的库升级**不要再跑初始化目录，只跑增量：

  ```bash
  docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" erp' < docker/mysql/05-wx-login.sql
  ```

- `.drone.yml` 已配置：push 到 `main` → 在宿主机 `/root/erp` 执行 `docker compose down && docker compose up -d --build`。

### B. 微信云托管（Serverless）

微信云托管是单端口、按请求计费、无流量可缩容到 0 的容器平台，因此这里不用 compose，而是**一个容器同时提供页面和接口**（后端自带静态文件中间件，见 `server/src/middleware/static.middleware.ts`）。

1. **准备数据库**（云托管 MySQL 或外部 MySQL，二者都要能被容器访问）。把 `docker/mysql/` 下的脚本按顺序执行一遍：

   ```bash
   mysql -h <host> -u <user> -p <db> < docker/mysql/01-schema.sql
   mysql -h <host> -u <user> -p <db> < docker/mysql/02-seed.sql
   mysql -h <host> -u <user> -p <db> < docker/mysql/03-002-doc.sql
   mysql -h <host> -u <user> -p <db> < docker/mysql/04-003-doc-line-docno.sql
   mysql -h <host> -u <user> -p <db> < docker/mysql/05-wx-login.sql   # 幂等，老库只跑这个
   ```

   也可以在云托管「数据库 → SQL 执行」里直接粘贴文件内容执行。

2. **新建服务**：云托管控制台 → 新建 → 上传代码（仓库根目录），`container.config.json` 已经给出端口 `8080`、`0.5` 核 / `1G`、最小 `0` 实例、最大 `4`、CPU 60% 扩容、健康检查 `/api/health`。
3. **配环境变量**（服务设置 → 环境变量）：

   | 变量 | 说明 |
   |---|---|
   | `MYSQL_ADDRESS` | `主机:端口`，云托管 MySQL 内网地址，如 `10.0.0.12:3306` |
   | `MYSQL_USERNAME` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | 数据库账号与库名 |
   | `JWT_SECRET` | 登录 token 签名，**必须改** |
   | `WX_APPID` / `WX_SECRET` | 小程序 AppID / AppSecret（微信一键登录用） |
   | `WX_BIND_TTL_MIN` | 绑定码有效期（分钟，默认 10） |
   | `DB_POOL` | 连接池大小（默认 10，云托管小规格建议 6） |
   | `CORS_ORIGINS` | 只有跨域调用 API 时才需要，逗号分隔；同源部署留空即可 |

4. 部署完成后直接访问云托管域名：页面和 `/api` 同源，不需要再配 nginx 或域名 CORS。
5. `minNum: 0` 意味着没有流量时实例数归零，冷启动约 3~8 秒；不能接受就改成 `1`（常驻但会产生费用）。

部署自检：

```bash
curl https://<你的云托管域名>/api/health
# {"success":true,"data":{"status":"UP","uptime":12,"db":{"ok":true,"mode":"typeorm"},
#  "wx":{"appidConfigured":true,"secretConfigured":true}}}
```

`db.ok=false` 说明数据库连接参数不对；`wx.*Configured=false` 说明还没配微信 AppID/Secret（此时「微信一键登录」会返回未配置提示，账号密码登录不受影响）。

## 微信绑定与一键登录

后台管理员在小程序里点一下就能登录，靠的是一次性绑定码把「微信 openid」和「系统账号」绑定起来：

1. **网页端生成绑定码**：登录网页端 → 右上角「绑定微信」→ 生成 6 位绑定码（10 分钟内有效，可复制，弹窗里带倒计时；生成后每 5 秒自动刷新绑定状态）。
2. **小程序端绑定**：小程序登录页点「微信一键登录」→ `wx.login` 拿 code → 后端换 openid → 该 openid 还没绑定，界面出现 6 位码输入框 → 填入网页端的码 → 绑定成功并直接下发 JWT 进列表。
3. **之后就是一键登录**：再进小程序点「微信一键登录」直接进列表，不再输密码。

安全与边界：

- 绑定码只存在服务端 `sys_wx_bind_code` 表，6 位、大写、去掉了 `0 O 1 I` 等易混字符；有效期默认 10 分钟，用过即作废（`status` 0 待用 → 1 已使用 / 2 已作废）。
- 同一微信只能绑一个账号（`sys_user.wx_openid` 上有唯一索引 `uk_wx_openid`，未绑定的行存 `NULL`，不互相冲突）；同一账号也只能挂一个微信，换绑要先解绑。
- 网页端「解绑微信」只是把 `wx_openid` 置空并作废未使用的绑定码，不影响账号密码登录。
- 云托管部署时 openid 由平台注入的 `X-WX-OPENID` 头直接给出，不必再调 `code2Session`；自建服务器部署则用 `wxCode` 走微信接口换取。

相关接口：

```
POST /api/auth/wx-login        { wxCode? }  → { bound:false, wxConfigured } | { bound:true, token, user }
POST /api/auth/wx-bind         { bindCode, wxCode? } → { token, user }
GET  /api/auth/wx-status       → { bound, nickname, boundAt, configured }
POST /api/auth/wx-bind-code    → { code, expireAt, ttlMinutes }
POST /api/auth/wx-unbind       → { bound:false }
```

`/api/auth/wx-login` 与 `/api/auth/wx-bind` 在鉴权白名单里（没登录才能登录），`wx-status` / `wx-bind-code` / `wx-unbind` 需要登录。

## 小程序端（微信）

`miniapp/` 是独立的 uni-app（Vue3 + Vite + TypeScript）项目，只做业务单据：列表（搜索 + 类型/状态/日期筛选 + 上拉加载）、详情、新建/编辑、审核/反审核、过账、作废、删除、打印预览与「记一次打印 / 分享单据」。

```bash
npm --prefix miniapp install --cache .tmp/npm-cache

npm --prefix miniapp run dev:mp-weixin      # 开发：产物在 miniapp/dist/dev/mp-weixin，用微信开发者工具打开
npm --prefix miniapp run build:mp-weixin    # 生产：miniapp/dist/build/mp-weixin
npm --prefix miniapp run dev:h5             # 浏览器里跑，便于快速看页面
npm --prefix miniapp run typecheck          # tsc --noEmit（.vue 模板靠构建检查）
```

两种连后端的方式，登录页会自动判断：

- **云托管模式**：`VITE_CLOUD_ENV=prod-xxxx` 写进 `miniapp/.env.production`（或登录后在本地存储 `erp_cloud_env` 里写环境 ID），请求走 `wx.cloud.callContainer`，header 带 `X-WX-SERVICE`，AppID 与云托管同主体，天然免域名备案与 CORS。
- **直连模式**：登录页填「服务器地址」（如 `https://erp.example.com`），请求走 `uni.request`；服务器必须在微信公众平台「request 合法域名」里备案，且后端要放开 CORS（`CORS_ORIGINS`）或与其同源部署。

真机调试前记得在 `miniapp/src/manifest.json` 里填自己的 `appid`（现在留空，构建产物里是 `touristappid`，只能游客模式预览）。

## 已实现（可直接用）

| 模块 | 内容 |
|---|---|
| 鉴权 | 账号密码登录（scrypt 哈希）、JWT 签发、全局鉴权中间件、401 统一响应 |
| **微信一键登录** | 网页端生成 6 位一次性绑定码 → 小程序绑定 openid → 之后点一下进系统；同账号/同微信一对一，云托管靠 `X-WX-OPENID` 免 code2Session |
| **Serverless 部署** | 根 `Dockerfile` + `container.config.json` 适配微信云托管（单端口、可缩容到 0），后端自带静态托管与 gzip |
| **小程序端** | uni-app（Vue3 + TS）：单据列表/详情/编辑/审核/过账/作废/打印预览，支持云托管与直连两种通道 |
| 统一异常 | `BizError` → 4xx 原样返回；其他 → 500 + 日志，不泄露堆栈 |
| 物料档案 | 分页查询（编码/名称/条码模糊）、新增、编辑（编码不可改）、软删除 |
| **管家婆导入** | 三张表（单据/单据详情/草稿）JSON 导入，按单据编号合并明细；物料/往来单位/单据类型缺失自动建档；先预览后执行；同名单据跳过或覆盖 |
| **业务单据** | 列表筛选、新建/编辑（多行明细）、详情、审核/反审核、作废、删除、过账、打印计数 |
| **自动补全** | 摘要 / 往来单位 / 存货 / 规格 / 颜色 / 经办人，按历史使用次数排序 |
| **金额汇总** | 明细金额由后端 `decimal.js` 计算，表头金额 = Σ明细，前端只读 |
| **打印模板** | 针式连续纸（241×140mm）销售单，含中文大写合计、欠款、签字栏 |
| **库存过账** | `StockService.post()`：单事务 + 行锁 + 唯一索引幂等 + 移动加权成本 + 负库存校验 + 调拨一出一入 + 明细缺档案时自动建档 |
| **移动端** | ≤768px 侧边栏转抽屉、明细分行卡片、表单单列、表格横向滚动、命中区加大 |
| 金额精度 | 全链路 `DECIMAL` + `decimal.js`，无 `number` 浮点运算 |
| 数据访问 | 全部走 TypeORM（Repository / QueryBuilder），不再手写 `manager.query()` SQL |

### 接口

```
GET  /api/ping
GET  /api/health              就绪探针（含数据库检查，DB 不可用返回 503）
POST /api/auth/login          { username, password }
GET  /api/auth/me
POST /api/auth/wx-login       微信一键登录（云托管读 X-WX-OPENID，自建读 wxCode）
POST /api/auth/wx-bind        用 6 位绑定码把微信绑到账号上（成功后直接下发 token）
GET  /api/auth/wx-status      当前账号的微信绑定状态
POST /api/auth/wx-bind-code   生成 6 位一次性绑定码
POST /api/auth/wx-unbind      解绑微信

GET  /api/md/items/page       ?keyword=&page=&pageSize=
POST /api/md/items/create
POST /api/md/items/update/:id
POST /api/md/items/delete/:id
GET  /api/md/warehouses       仓库下拉
GET  /api/md/units            单位
GET  /api/md/partners         ?keyword= 往来单位

GET  /api/doc/types           单据类型（销售单/采购单/调拨单…）
GET  /api/doc/page            ?keyword=&docType=&status=&dateFrom=&dateTo=&page=&pageSize=
GET  /api/doc/detail/:id      单据头 + 明细
GET  /api/doc/detail-by-no/:docNo   按单据编号取详情（管家婆导入按单号对齐）
GET  /api/doc/autocomplete    ?field=summary|partner|item|spec|color|handler&keyword=
GET  /api/doc/item-hint       ?itemName= 带出规格/颜色/单位/单价
POST /api/doc/create
POST /api/doc/update/:id
POST /api/doc/delete/:id
POST /api/doc/audit/:id       审核 / 反审核
POST /api/doc/void/:id
POST /api/doc/post/:id        过账（写入库存流水与余额）
POST /api/doc/printed/:id     打印次数 +1

POST /api/import/preview      导入预览（不写库，返回将新建/跳过/自动建档清单）
POST /api/import/execute      执行导入
GET  /api/import/help         三张表字段说明与选项说明

GET  /api/stock/balance       ?keyword=&warehouseId=&itemId=（页面已移除，接口保留）
POST /api/stock/post/:docId   过账（与 /api/doc/post 等价，保留旧入口）
```

## 管家婆数据导入

### 三张表怎么对齐

管家婆导出的三张表没有内部主键，只用**单据编号**互相引用：

| 表 | 内容 | 导入时怎么处理 |
|---|---|---|
| 单据 | 表头（日期/编号/类型/往来单位/金额/摘要/审核状态/…） | 一张单一条记录，明细另在详情表 |
| 单据详情 | 明细（仓库全名/存货全名/数量/金额/批号/行摘要/含税金额/…） | 按单据编号挂到对应表头，同号多行合并成一张单 |
| 草稿 | 只有表头，没有明细 | 导入为 `status=0` 的草稿 |

三张表可以单独导，也可以一次导：`{"单据": [...], "单据详情": [...], "草稿": [...]}`，
顶层直接给数组也行（单张对象也支持）。

几个必须知道的取舍：

1. **明细的编号对不上表头时自己补表头**。样例里 `XS-2022-12-07-00001` 只有表头、明细却是 `SD-2022-12-08-00003`，所以「明细表有单号但没有表头」时必须能用明细里的日期/类型/仓库/摘要补出一张表头，否则这批明细就丢了。
2. **历史单据只导入、不冲库存**。审核状态照抄（`已审核→1 / 未审核→0 / 作废→9`），但不自动过账——历史库存要另做期初建账，否则会把现在的库存算错。
3. **金额以明细求和为准**。有明细时表头金额 = Σ明细金额；只有表头（单据表/草稿）时才用表头金额。
4. **物料/往来单位/单据类型按名字解析**，解析不到自动建档（可在选项里关掉）。自动建档的物料编码形如 `AUTO-xxxxxxx`，往来单位 `GJP-P-xxxxxxx`，不认识的单据类型默认 `stock_dir=0 / need_post=0`（不许过账，避免误改库存）。
5. **幂等**：按单据编号判重。`mode=skip` 跳过已存在，`mode=replace` 覆盖（已过账的单据不会被覆盖）。

### 三种用法

```bash
# ① 命令行（推荐用来导历史数据，看得见进度、失败能重跑）
cd server
node scripts/import-gjp.js path/to/gjp.json --dry      # 只预览
node scripts/import-gjp.js path/to/gjp.json            # 预览 + 导入
node scripts/import-gjp.js path/to/gjp.json --replace  # 覆盖已存在
node scripts/import-gjp.js path/to/gjp.json --no-drafts --no-auto-items
```

```bash
# ② 界面：登录后左侧「管家婆导入」
粘贴 JSON 或上传 .json → 预览（看会新建/跳过哪些、要自动建档哪些） → 执行导入
```

```bash
# ③ 直接调接口
curl -X POST http://127.0.0.1:7001/api/import/preview \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"payload": {...}, "mode": "skip"}'
```

## 单据模块设计要点

1. **单号**：`{前缀}-{YYYY-MM-DD}-{5位流水}`，如 `XS-2026-05-02-00004`。流水由 `sys_doc_seq` 表用 `INSERT ... ON DUPLICATE KEY UPDATE current = current + 1` 原子递增，并发安全。
2. **明细整体替换**：编辑保存时先 `DELETE` 全部明细再批量 `INSERT`，比逐行 diff 简单且不会漏行；金额一律由服务端重算，不信任前端传来的值。
3. **方向由字典决定**：`sys_doc_type.stock_dir`（+1 入库 / -1 出库 / 0 不过账）决定过账方向，`doc_type_name` 关联字典。**不能用 `ledger_type` join**——销售订单(SD)和采购订单(CD)的 `ledger_type` 都是 0，会串。
4. **谁在操作**：`creator_name` / `modifier_name` / `handler` 全部取 JWT 里的当前用户名，前端不传也不允许覆盖。
5. **状态机**：`0 草稿 → 1 已审核 → 2 已过账`，`9 作废`。已过账不可改不可删；作废只在草稿/已审核阶段允许。
6. **打印**：`/doc/print/:id` 是独立路由（不带侧边栏），`@page { size: 241mm 140mm }` 匹配针式纸。打印前调 `printed` 接口累加次数，抬头信息在 `web/src/config/company.ts`。
7. **单据编号怎么关联**：关联一律走 `doc_id`（主键、走索引、改号改名都不影响），同时 `biz_doc_line.doc_no` 冗余一份单号快照——管家婆的明细表本来就带单号，导入/对账按单号对齐更方便，单号创建后不可改所以不会有脏数据。另有 `GET /api/doc/detail-by-no/:docNo` 直接按单号取详情。

## 过账实现要点（全系统地基）

1. **一个事务**：校验状态 → 写流水 → 改余额 → 回写成本 → 改单据状态，一起提交或一起回滚
2. **锁顺序固定**：先出库后入库（保证调拨先算出库成本），组内按 `(仓库, 货位, 物料, 批次)` 排序 → 防死锁
3. **幂等**：`stk_ledger` 唯一键 `(source_type, source_id, source_line_id, direction)`，脚本可无脑重跑
4. **成本**：入库取单据单价，出库取当前均价（结存金额 / 结存数量），数量归零时金额强制清零
5. **负库存**：默认拒绝；仓库 `allow_negative=1` 才放行
6. **明细没有物料档案也不再挡过账**：过账时对 `item_id <= 0` 的行按存货名称自动建档并回写 `item_id`，返回 `autoCreateItems` 告诉你新建了哪些；连名称都没有才报「第 N 行既没有物料档案也没有存货名称，无法过账」。录单阶段**不**建档（避免手滑产生垃圾档案），只在过账时补。

## 移动端适配

- ≤768px（`useIsMobile` 读 `matchMedia`）：侧边栏换成左侧抽屉，标题栏出现菜单按钮
- 单据明细表在手机上改成「一行一张卡片」（1250px 宽的表格在手机上没法填）
- 单据列表/物料列表的筛选条件占满整行、分页切 `simple` 模式
- 表单在小屏单列（`Col xs={24}`），输入框字号提到 16px（避免 iOS 聚焦自动放大）
- 表格统一 `scroll={{x}}` 横向滚动，打印预览页小屏可横向查看

## 验证状态

| 项 | 结果 |
|---|---|
| 后端类型检查（tsc --noEmit） | ✅ 通过 |
| 后端冒烟测试（jest --runInBand） | ✅ 2/2 通过（路由装配 + 401 鉴权） |
| 后端生产启动（node bootstrap.js） | ✅ `/api/ping` 200，受保护接口 401 |
| **数据库端到端（真实 MySQL 9）** | ✅ 登录 → 建物料 → 采购入库过账(10@5=50) → 销售出库过账(4) → 余额 `6 / 30` → 流水成本 `5` → 重复过账被拒 → 清理无残留 |
| **单据模块端到端** | ✅ 建单(金额 1900) → 详情 3 行/制单人=admin → 自动补全命中 → 审核 → 过账拦截 → 打印计数 → 改单(金额 900/修改人=admin) → 清理 |
| **基础档案接口** | ✅ 仓库 2 / 单位 4 / 单据类型 8 / 6 个补全字段全部 200 |
| **完整业务流过账** | ✅ 采购单过账 → `10 / 50` → 销售单过账 → `6 / 30`；流水方向 `+1 / -1`，出库成本取均价 `5`（金额 `20`）；超量出库被拒、重复过账被拒 |
| **前后端字段契约** | ✅ 65 项全部一致（列表列 + 详情 21 个字段 + 明细 9 个 + 下拉/补全/库存） |
| **按单号取详情** | ✅ `/detail-by-no/XS-...` 200，明细行也带单号；不存在的单号返回 404 |
| 前端类型检查（tsc --noEmit） | ✅ 通过 |
| 前端生产构建（vite build） | ✅ 3168 modules，dist 1.37MB（需把 TEMP 指到工作区，见已知问题 5） |
| **开发服务器全链路** | ✅ `vite` 5173 代理转发到后端 7001，登录 `/api/doc/page` `/api/md/warehouses` `/api/import/*` 全部 200；各页面模块均能编译成 JS |
| **管家婆导入（后端）** | ✅ 预览：4 张单/明细 3 行/草稿 1 张；执行：新建 4 张、自动建档物料「伟东茶几G56-130」与往来单位「杭州街鸿康家具」；重复导入全部跳过 |
| **导入结果核对** | ✅ 按单号逐字段核对：表头单(0 明细/2200/陈万群/已审核/打印1)、明细补表头单(3 行/2080/单位名/明细冗余单号)、草稿(0/1200/黄春花/陈万群/销售部)、采购单(往来单位匹配/950/入库方向) |
| **过账自动建档** | ✅ 明细只写存货名的单据（3@88=264）审核后过账成功，返回 `autoCreateItems` 1 个，过账后明细回写 `itemId`、单位「个」、状态已过账 |
| **前端模块烟测** | ✅ 10 个页面/模块 + 6 条路由全部 200 且能编译（`scripts/verify-web.js`） |
| **微信绑定迁移** | ✅ MySQL 8.0.28：`05-wx-login.sql` 重复执行无副作用；删掉 wx 列/索引/绑定码表后重跑能完整补齐（老库升级路径） |
| **微信绑定闭环** | ✅ 19/19：生成码 → 未绑定登录 → 绑定 → 已绑定一键登录 → 复用码/错码/过期码/一账号一微信 全部被拒 → 解绑后回到未绑定 |
| **云托管单端口托管** | ✅ 后端直接托管 `web/dist`：`/` 与 `/doc/edit/12` 回落 index.html、`/assets/*` 强缓存+`immutable`、gzip 1381KB→446KB、缺文件返回 JSON 404 |
| **绑定界面链路** | ✅ 无头 Chrome 10/10：未登录跳登录页 → 登录 → 头部「绑定微信」→ 弹窗（未配置 WX_APPID 时给出提示）→ 生成绑定码 `3AXV78` → 用该码调 `wx-bind` 绑定成功 |
| **就绪探针** | ✅ DB 正常 `/api/health` 200；停掉 MySQL 变 503 + `status=DEGRADED`；重启 MySQL 自动恢复 200（连接池重连） |
| **小程序端构建** | ✅ `build:mp-weixin` 产物含「微信一键登录」块与 `wx.cloud.callContainer`；`build:h5` 条件编译把该块整段剔除 |
| **未验证** | ⚠️ 容器镜像未在本机构建（Docker 引擎起不来）、未接真实微信 AppID 走 `code2Session` |

复跑脚本（需后端已启动，默认 7001 端口）：

```bash
node bootstrap.js                 # 另开一个终端（NODE_ENV=production）

node scripts/seed-demo.js         # 造演示数据：2 往来单位 / 3 物料 / 3 张单据
node scripts/check-contract.js    # 前后端字段契约检查（页面读的字段逐个核对）
node scripts/verify-md.js         # 基础档案接口冒烟
node scripts/doc-e2e.js           # 单据模块端到端（建/改/审核/打印/补全）
node scripts/flow-e2e.js          # 采购→销售完整业务流 + 过账方向 + 余额
node scripts/verify-import.js     # 导入结果逐字段核对（先跑 import-gjp.js）
node scripts/verify-auto-item.js  # 明细无物料档案时过账自动建档
node scripts/verify-proxy-import.js # 经前端 5173 代理走导入接口
node scripts/verify-web.js        # 前端页面模块与路由烟测
node scripts/e2e-check.js         # 库存过账端到端
node scripts/seed-demo.js --clean # 清掉演示数据
```

导入相关脚本：

```bash
node scripts/import-gjp.js ../../db/samples/gjp-sample.json --dry  # 预览样例文件
node scripts/import-gjp.js ../../db/samples/gjp-sample.json        # 正式导入 4 张样例单
```

`db/samples/gjp-sample.json` 按管家婆三张表的真实字段造了 4 张单（含「明细表有单号但表头缺失」和「草稿只有表头」两种情况），可以直接拿来验证导入逻辑。

`seed-demo.js` / `check-contract.js` / `flow-e2e.js` 之外，脚本都自带数据清理，只删除自己打 tag 的行；`check-contract.js` 是只读的。

> `check-contract.js` 存在的理由：类型检查只保证 TS 内部自洽，杀不掉「后端少返回一个字段、页面渲染成空白但脚本照样报 ok」这类 bug（`detail()` 曾用 `SELECT d.*` 返回 snake_case 就是这么漏过去的）。它拿真实接口数据逐字段核对页面实际读的名字。

## 已知问题

1. **实体注册曾用通配符，已修复**：原先 `entities` 用 `__dirname + 通配符` 匹配，在 dev（mwtsc 编译到临时目录）下匹配不到文件，运行时报 `No metadata for "SysUser" was found.`。现在改为在 `src/config/config.default.ts` 里显式导入 11 个实体类，dev/prod 都稳定；以后新增实体记得加进 `ENTITIES` 数组。
2. **`@midwayjs/logger` 版本不匹配**：当前发布的 4.1.x 是旧架构，被 `@midwayjs/bootstrap` 4.2 注入后会让框架启动失败（`reading 'debug'`）。已在 `bootstrap.js` 里置空 `loggerFactory`，改用 core 内置控制台日志。等官方发布匹配版本，删掉那行配置即可恢复文件日志。
3. `typeorm` 当前 latest 是 1.x（`0.3.x` 变成 `legacy` 标签），本骨架按 1.x 编写。若遇到 API 差异，对应的都是 `findOne/insert` 这些基础方法，改动面很小。
4. **各表 nullable 列不一致**：`md_partner` 有 `deleted_at`，但 `md_warehouse` / `md_unit` 只有 `status`。写查询时别照抄过滤条件，否则报 `Unknown column 'deleted_at'`。
5. **esbuild 在受限环境下构建失败**：`spawn EPERM`（起不了子进程）或 `remove ...\Temp\esbuild-xxx: Access is denied`（删不掉临时文件）。把 `TEMP`/`TMP` 指到工作区目录即可：

   ```powershell
   $env:TEMP = "$PWD\..\.tmp\build-temp"; $env:TMP = $env:TEMP
   npm run build
   ```

   正常权限的机器上直接 `npm run build` 即可，不需要这一步。
6. 实体只映射了**核心字段**，`schema.sql` 里还有少量未映射的列（如 `brand`），按需补。
7. **唯一索引 + 默认空串会冲突**：`biz_doc.source_doc_no` 原来 `NOT NULL DEFAULT ''` 且带唯一索引，导致第二张单据报 `Duplicate entry '' for key 'uk_source'`。已改为 `NULL DEFAULT NULL`（MySQL 唯一索引不约束 NULL）。**以后建唯一索引的列，要么允许 NULL，要么真的唯一。**
8. **不要用 PowerShell 批量正则改含中文的源码**：`(Get-Content -Raw) -replace ... | Set-Content -Encoding UTF8` 会把 UTF-8 无 BOM 文件按 ANSI(936) 读出再写成乱码，还会吞掉行尾换行，产生成片的 `TS1128` 语法错误。改源码用编辑器/工具，实在被写坏了可以用 GBK 反向编码还原：`ReadAllText(UTF8)` → `GetEncoding(936).GetBytes()` → `WriteAllBytes`。
9. **typeorm 1.x 的 `select` 只接受对象**：`select: ['id','code']` 会报 `TS2322 Type 'string[]' is not assignable to type 'FindOptionsSelect'`，必须写成 `select: { id: true, code: true }`。
10. **`manager.query()` 的返回形状不统一**：写语句返回 `ResultSetHeader` 对象（取 `insertId`），查询返回行数组。`const [x] = await manager.query(...)` 对写语句会报 `is not iterable`。全部改 TypeORM 的 `save/insert/update/increment` 后这类坑就消失了。
11. **静态托管的 404 别交给路由**：路由未命中在 Midway 里是抛 `NotFoundError`，早先的 error 中间件把所有非 `BizError` 都当 500，导致「缺个 js 文件」变成 500。现在 error 中间件先看 `err.status`，4xx 原样返回（`NOT_FOUND` / `BAD_REQUEST`），只有 5xx 才记日志。
12. **云托管只有 80/8080 一个端口**：页面与 API 必须同源，所以后端要托管 `web/dist`（`WEB_DIST` 指目录、`STATIC_DISABLE=1` 关掉）。别在里面再起 nginx 进程，容器只允许一个主进程。
13. **`/api/health` 的状态码是真探针**：DB 不可用时返回 503，`Dockerfile` 的 `HEALTHCHECK` 与云托管探针都靠它判断；`/api/ping` 只证明进程活着，别混用。
14. **小程序真机需要自己的 AppID**：`miniapp/src/manifest.json` 里 `appid` 现在是空的，构建产物是 `touristappid`（游客模式）。另外云托管模式下 `VITE_CLOUD_ENV` 必须是云托管环境 ID，填错会报 `cloud.callContainer:fail`。

## 下一步（按优先级）

1. 补 `sys_config` 表，把打印抬头（公司名/地址/收款账户）从 `company.ts` 挪到数据库，支持界面配置
2. 往来单位档案的 CRUD 页面（现在只有接口，表里是 `seed-demo.js` / 导入灌的数据）
3. 采购入库 / 调拨单的前端录入页（后端已支持全部类型，目前新建单据默认只出销售单）
4. 写 `StockService` 单测（一进一出余额归零、调拨成本一致、重复过账被拒）
5. **期初建账**：把导入的历史单据 + 现存库存冻到一个时间点，生成 `opening_stock` 快照后才能真正切换使用
6. `tools/etl` 实装完整 ETL（ODS → STG → 校验 → MAP → LOAD → RECON），当前只用「导入接口」覆盖了 LOAD 这一层

## 已移除

- 「即时库存」页面按需求删除（`web/src/pages/StockBalancePage.tsx` 及路由/菜单）。
  后端 `GET /api/stock/balance` 仍保留，需要查库存直接调接口或另做报表页。
