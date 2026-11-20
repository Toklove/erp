-- ============================================================
-- 仓库 ERP 核心库结构（MySQL 8.0 / InnoDB / utf8mb4）
-- 说明：可作为初版基线，执行前请先 review。
-- 约定：
--   1) 金额 DECIMAL(18,4)，单价 DECIMAL(18,6)，数量 DECIMAL(18,4)
--   2) 所有业务表带审计字段，业务单据只软删（deleted_at）
--   3) 唯一索引承担幂等职责（外部单号 / 来源行）
--   4) 迁移期建议不建物理外键，完整性由应用层 + 校验脚本保证
-- ============================================================

CREATE DATABASE IF NOT EXISTS erp
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE erp;

-- ------------------------------------------------------------
-- 1. 主数据
-- ------------------------------------------------------------

CREATE TABLE md_unit (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(32)  NOT NULL COMMENT '单位编码',
  name          VARCHAR(32)  NOT NULL COMMENT '单位名称',
  decimals      TINYINT      NOT NULL DEFAULT 2 COMMENT '数量精度',
  sort          INT          NOT NULL DEFAULT 0,
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='计量单位';

CREATE TABLE md_category (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  path          VARCHAR(255) NOT NULL DEFAULT '' COMMENT '物化路径 /1/2/3',
  sort          INT          NOT NULL DEFAULT 0,
  status        TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_parent (parent_id)
) ENGINE=InnoDB COMMENT='存货分类';

CREATE TABLE md_warehouse (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(32)  NOT NULL,
  name           VARCHAR(64)  NOT NULL,
  allow_negative TINYINT      NOT NULL DEFAULT 0 COMMENT '是否允许负库存',
  use_location   TINYINT      NOT NULL DEFAULT 0 COMMENT '是否启用货位',
  sort           INT          NOT NULL DEFAULT 0,
  status         TINYINT      NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='仓库';

CREATE TABLE md_location (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id  BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  status        TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wh_code (warehouse_id, code)
) ENGINE=InnoDB COMMENT='货位';

CREATE TABLE md_item (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                 VARCHAR(64)  NOT NULL COMMENT '存货编码（迁移后冻结）',
  name                 VARCHAR(128) NOT NULL,
  spec                 VARCHAR(255) NOT NULL DEFAULT '' COMMENT '规格型号',
  barcode              VARCHAR(64)  NOT NULL DEFAULT '',
  category_id          BIGINT UNSIGNED NOT NULL DEFAULT 0,
  base_unit_id         BIGINT UNSIGNED NOT NULL,
  brand                VARCHAR(64)  NOT NULL DEFAULT '',
  batch_manage         TINYINT      NOT NULL DEFAULT 0 COMMENT '批次管理',
  shelf_life_days      INT          NOT NULL DEFAULT 0 COMMENT '保质期天数',
  serial_manage        TINYINT      NOT NULL DEFAULT 0 COMMENT '序列号管理',
  default_warehouse_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ref_cost             DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '参考成本',
  tax_rate             DECIMAL(6,4)  NOT NULL DEFAULT 0,
  remark               VARCHAR(255) NOT NULL DEFAULT '',
  status               TINYINT      NOT NULL DEFAULT 1,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by           BIGINT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at           DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_barcode (barcode),
  KEY idx_category (category_id),
  KEY idx_name (name)
) ENGINE=InnoDB COMMENT='存货档案';

CREATE TABLE md_item_unit (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id    BIGINT UNSIGNED NOT NULL,
  unit_id    BIGINT UNSIGNED NOT NULL,
  rate       DECIMAL(18,6) NOT NULL DEFAULT 1 COMMENT '换算率：1 该单位 = rate 个基本单位',
  is_base    TINYINT      NOT NULL DEFAULT 0,
  barcode    VARCHAR(64)  NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_unit (item_id, unit_id),
  KEY idx_unit (unit_id)
) ENGINE=InnoDB COMMENT='存货多单位换算';

CREATE TABLE md_partner (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(32)  NOT NULL,
  name         VARCHAR(128) NOT NULL,
  partner_type TINYINT      NOT NULL DEFAULT 1 COMMENT '1客户 2供应商 3兼有',
  contact      VARCHAR(64)  NOT NULL DEFAULT '',
  phone        VARCHAR(32)  NOT NULL DEFAULT '',
  address      VARCHAR(255) NOT NULL DEFAULT '',
  tax_no       VARCHAR(64)  NOT NULL DEFAULT '',
  credit_limit DECIMAL(18,4) NOT NULL DEFAULT 0,
  settle_terms VARCHAR(64)  NOT NULL DEFAULT '',
  remark       VARCHAR(255) NOT NULL DEFAULT '',
  status       TINYINT      NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_name (name),
  KEY idx_type (partner_type)
) ENGINE=InnoDB COMMENT='往来单位（客户/供应商）';

-- ------------------------------------------------------------
-- 2. 库存（流水是唯一真相，余额是物化）
-- ------------------------------------------------------------

CREATE TABLE stk_ledger (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  biz_date       DATE         NOT NULL COMMENT '业务日期',
  warehouse_id   BIGINT UNSIGNED NOT NULL,
  location_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  item_id        BIGINT UNSIGNED NOT NULL,
  batch_no       VARCHAR(64)  NOT NULL DEFAULT '',
  direction      TINYINT      NOT NULL COMMENT '1入库 -1出库',
  qty            DECIMAL(18,4) NOT NULL COMMENT '数量（基本单位）',
  unit_id        BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '原单单位',
  src_qty        DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '原单单位数量',
  cost_price     DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '单位成本',
  cost_amount    DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '成本金额',
  source_type    VARCHAR(32)  NOT NULL COMMENT 'doc_type',
  source_id      BIGINT UNSIGNED NOT NULL,
  source_line_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  remark         VARCHAR(255) NOT NULL DEFAULT '',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  -- 调拨同一行会产生一出一入两条流水，direction 必须进唯一键
  UNIQUE KEY uk_source (source_type, source_id, source_line_id, direction),
  KEY idx_item_date (item_id, biz_date),
  KEY idx_wh_item (warehouse_id, item_id),
  KEY idx_ref (source_type, source_id)
) ENGINE=InnoDB COMMENT='库存流水（唯一真相，只增不改）';

CREATE TABLE stk_balance (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  location_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  item_id      BIGINT UNSIGNED NOT NULL,
  batch_no     VARCHAR(64)  NOT NULL DEFAULT '',
  qty          DECIMAL(18,4) NOT NULL DEFAULT 0,
  cost_amount  DECIMAL(18,4) NOT NULL DEFAULT 0,
  version      INT          NOT NULL DEFAULT 0 COMMENT '乐观锁',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_key (warehouse_id, location_id, item_id, batch_no),
  KEY idx_item (item_id)
) ENGINE=InnoDB COMMENT='库存余额（物化）';

CREATE TABLE stk_batch (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id     BIGINT UNSIGNED NOT NULL,
  batch_no    VARCHAR(64)  NOT NULL,
  mfg_date    DATE         NULL,
  exp_date    DATE         NULL,
  supplier_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  remark      VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_item_batch (item_id, batch_no),
  KEY idx_exp (exp_date)
) ENGINE=InnoDB COMMENT='批次档案';

-- ------------------------------------------------------------
-- 3. 业务单据（统一单据模型）
--    doc_type: 101采购入库 102采购退货 201销售出库 202销售退货
--              301调拨 401盘点 501其他入库 502其他出库 601期初
-- ------------------------------------------------------------

CREATE TABLE biz_doc (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doc_no        VARCHAR(64)  NOT NULL COMMENT '单号',
  doc_type      SMALLINT     NOT NULL COMMENT '单据类型',
  biz_date      DATE         NOT NULL,
  partner_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  warehouse_id  BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '主仓库（调拨为出库仓）',
  to_warehouse_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '调拨入库仓',
  status        TINYINT      NOT NULL DEFAULT 0 COMMENT '0草稿 1待审 2已过账 9作废',
  total_qty     DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_amount  DECIMAL(18,4) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,
  source_doc_no VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '外部来源单号（幂等）',
  ext           JSON         NULL COMMENT '类型差异字段',
  remark        VARCHAR(255) NOT NULL DEFAULT '',
  audited_at    DATETIME     NULL,
  audited_by    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  posted_at     DATETIME     NULL,
  posted_by     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  version       INT          NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  deleted_at    DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_no (doc_no),
  UNIQUE KEY uk_source (source_doc_no),
  KEY idx_type_date (doc_type, biz_date),
  KEY idx_partner (partner_id, biz_date)
) ENGINE=InnoDB COMMENT='业务单据头';

CREATE TABLE biz_doc_line (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doc_id        BIGINT UNSIGNED NOT NULL,
  line_no       INT          NOT NULL,
  item_id       BIGINT UNSIGNED NOT NULL,
  unit_id       BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '录入单位',
  qty           DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '录入单位数量',
  base_qty      DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '基本单位数量',
  price         DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '单价（不含税）',
  amount        DECIMAL(18,4) NOT NULL DEFAULT 0,
  tax_rate      DECIMAL(6,4)  NOT NULL DEFAULT 0,
  tax_amount    DECIMAL(18,4) NOT NULL DEFAULT 0,
  warehouse_id  BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '行仓库（覆盖头）',
  location_id   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  batch_no      VARCHAR(64)  NOT NULL DEFAULT '',
  cost_price    DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '出库成本（过账时回填）',
  cost_amount   DECIMAL(18,4) NOT NULL DEFAULT 0,
  ext           JSON         NULL,
  remark        VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_doc_line (doc_id, line_no),
  KEY idx_item (item_id),
  KEY idx_doc (doc_id)
) ENGINE=InnoDB COMMENT='业务单据明细';

-- ------------------------------------------------------------
-- 4. 期初（导入后锁定，差异一律走调整单）
-- ------------------------------------------------------------

CREATE TABLE opening_stock (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opening_date DATE         NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  location_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  item_id      BIGINT UNSIGNED NOT NULL,
  batch_no     VARCHAR(64)  NOT NULL DEFAULT '',
  qty          DECIMAL(18,4) NOT NULL DEFAULT 0,
  cost_price   DECIMAL(18,6) NOT NULL DEFAULT 0,
  cost_amount  DECIMAL(18,4) NOT NULL DEFAULT 0,
  status       TINYINT      NOT NULL DEFAULT 1 COMMENT '1生效 0作废',
  remark       VARCHAR(255) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_key (opening_date, warehouse_id, location_id, item_id, batch_no)
) ENGINE=InnoDB COMMENT='库存期初';

CREATE TABLE opening_ar_ap (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  opening_date DATE        NOT NULL,
  partner_id  BIGINT UNSIGNED NOT NULL,
  direction   TINYINT     NOT NULL COMMENT '1应收 2应付',
  amount      DECIMAL(18,4) NOT NULL DEFAULT 0,
  balance     DECIMAL(18,4) NOT NULL DEFAULT 0,
  source_doc_no VARCHAR(64) NOT NULL DEFAULT '',
  due_date    DATE        NULL,
  remark      VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_partner (partner_id, direction)
) ENGINE=InnoDB COMMENT='应收应付期初';

-- ------------------------------------------------------------
-- 5. 系统（用户 / 权限 / 字典 / 审计）
-- ------------------------------------------------------------

CREATE TABLE sys_user (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(128) NOT NULL,
  real_name     VARCHAR(64)  NOT NULL DEFAULT '',
  phone         VARCHAR(32)  NOT NULL DEFAULT '',
  status        TINYINT      NOT NULL DEFAULT 1,
  last_login_at DATETIME     NULL,
  wx_openid     VARCHAR(64)  NULL DEFAULT NULL COMMENT '微信 openid（唯一，未绑定为 NULL）',
  wx_unionid    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '微信 unionid',
  wx_nickname   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '微信昵称',
  wx_bound_at   DATETIME     NULL COMMENT '绑定微信时间',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username),
  UNIQUE KEY uk_wx_openid (wx_openid)
) ENGINE=InnoDB COMMENT='用户';

CREATE TABLE sys_wx_bind_code (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        CHAR(6)     NOT NULL COMMENT '6 位绑定码（大写，去易混字符）',
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '绑定到哪个系统用户',
  status      TINYINT     NOT NULL DEFAULT 0 COMMENT '0待用 1已使用 2已作废',
  expire_at   DATETIME    NOT NULL,
  used_at     DATETIME    NULL,
  used_openid VARCHAR(64) NOT NULL DEFAULT '',
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信绑定码（一次性，10 分钟有效）';

CREATE TABLE sys_role (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(32)  NOT NULL,
  name       VARCHAR(64)  NOT NULL,
  remark     VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='角色';

CREATE TABLE sys_user_role (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB COMMENT='用户角色';

CREATE TABLE sys_permission (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  code      VARCHAR(64)  NOT NULL COMMENT '如 stock:ledger:view',
  name      VARCHAR(64)  NOT NULL,
  type      TINYINT      NOT NULL DEFAULT 1 COMMENT '1菜单 2按钮 3接口',
  path      VARCHAR(128) NOT NULL DEFAULT '',
  sort      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='权限点';

CREATE TABLE sys_role_permission (
  role_id       BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id)
) ENGINE=InnoDB COMMENT='角色权限';

CREATE TABLE sys_dict (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dict_type VARCHAR(32)  NOT NULL,
  dict_key  VARCHAR(64)  NOT NULL,
  dict_value VARCHAR(255) NOT NULL DEFAULT '',
  sort      INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_type_key (dict_type, dict_key)
) ENGINE=InnoDB COMMENT='数据字典';

CREATE TABLE sys_op_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  username   VARCHAR(64)  NOT NULL DEFAULT '',
  module     VARCHAR(64)  NOT NULL DEFAULT '',
  action     VARCHAR(32)  NOT NULL DEFAULT '',
  target_id  VARCHAR(64)  NOT NULL DEFAULT '',
  detail     JSON         NULL,
  ip         VARCHAR(64)  NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_time (user_id, created_at),
  KEY idx_module (module, created_at)
) ENGINE=InnoDB COMMENT='操作审计日志';

-- ------------------------------------------------------------
-- 6. ETL / 迁移（staging 与原表同构，转换在 SQL + 脚本里做）
-- ------------------------------------------------------------

CREATE TABLE etl_batch (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_no     VARCHAR(64)  NOT NULL,
  source       VARCHAR(32)  NOT NULL DEFAULT 'gjp',
  phase        VARCHAR(32)  NOT NULL COMMENT 'extract/transform/load/recon',
  status       TINYINT      NOT NULL DEFAULT 0 COMMENT '0运行 1成功 2失败',
  row_count    BIGINT       NOT NULL DEFAULT 0,
  error_count  BIGINT       NOT NULL DEFAULT 0,
  message      VARCHAR(1024) NOT NULL DEFAULT '',
  started_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_batch_no (batch_no)
) ENGINE=InnoDB COMMENT='迁移批次';

CREATE TABLE etl_watermark (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_table VARCHAR(64)  NOT NULL,
  `last_value`   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '最大ID/时间戳',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_table (source_table)
) ENGINE=InnoDB COMMENT='增量水位';

CREATE TABLE etl_code_map (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  domain     VARCHAR(32)  NOT NULL COMMENT 'item/partner/warehouse/unit',
  old_code   VARCHAR(64)  NOT NULL,
  new_id     BIGINT UNSIGNED NOT NULL,
  old_name   VARCHAR(255) NOT NULL DEFAULT '',
  note       VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_domain_old (domain, old_code)
) ENGINE=InnoDB COMMENT='旧编码→新主键映射';

CREATE TABLE etl_error (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  stage        VARCHAR(32)  NOT NULL,
  source_table VARCHAR(64)  NOT NULL DEFAULT '',
  source_key   VARCHAR(128) NOT NULL DEFAULT '',
  message      VARCHAR(1024) NOT NULL DEFAULT '',
  payload      JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_batch (batch_id)
) ENGINE=InnoDB COMMENT='迁移错误明细（不阻塞全量）';
