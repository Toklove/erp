# ETL / 管家婆数据迁移（M4 里程碑，当前仅占位）

这一层刻意**独立于 server**：迁移是离线批处理，不是在线接口。

## 计划结构

```
tools/etl/
├─ src/
│  ├─ extract/     从管家婆 SQL Server 导出（bcp / mssql 驱动）
│  ├─ transform/   清洗、编码映射（复杂规则用 TS，简单映射用 SQL）
│  ├─ load/        写 staging → 写主库（ON DUPLICATE KEY UPDATE 保证幂等）
│  ├─ recon/       对账：总量 / 明细 / 余额
│  └─ cli.ts       命令行入口：extract | transform | load | recon | all
├─ sql/
│  ├─ 01_stage.sql       staging 建表（字段全 VARCHAR，先落地不解释）
│  └─ 02_transform.sql   旧编码 → 新 ID 的转换 SQL
└─ data/                 CSV 中转文件（不提交 git）
```

## 流程

```
管家婆 SQL Server
   │  bcp / SSMS 导出 UTF-8 CSV
   ▼
MySQL  gjp_stage.*        原样落地，字段全字符串
   │  SQL 清洗 + etl_code_map 映射
   ▼
MySQL  erp.*              正式表，靠唯一键幂等
   │  对账 SQL
   ▼
差异报告 → 修正 → 重跑（可重复执行，不产生重复数据）
```

## 铁律

1. staging 不解释数据类型，脏数据先落地，转换阶段再处理
2. 每一步都能单独重跑；失败不阻塞全量，错误进 `etl_error`
3. 对账脚本与 ETL 一起进版本库，它是上线验收凭证
4. 期初金额一律取管家婆「结存金额」，不要自己重算成本

## 待实现

- [ ] staging 建表 SQL 生成器（按源表结构批量生成）
- [ ] extract：CSV 导入 + 断点续跑
- [ ] transform：物料 / 往来单位 / 仓库 / 期初
- [ ] recon：三种对账输出 CSV
