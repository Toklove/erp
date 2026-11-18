-- ============================================================
-- 002 单据业务字段扩展
-- 目标：让 biz_doc / biz_doc_line 能承载管家婆式单据
--       （摘要、经办人、制单人、颜色、单价、打印次数等）
-- 说明：ALTER 前请先确认 biz_doc / biz_doc_line 为空或已备份。
-- ============================================================

USE erp;

-- ---------- 单据类型配置（替代硬编码枚举，加类型不用改代码）----------
CREATE TABLE IF NOT EXISTS sys_doc_type (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(16)  NOT NULL COMMENT '类型代码，如 XS',
  name         VARCHAR(32)  NOT NULL COMMENT '类型名称，如 销售单',
  prefix       VARCHAR(16)  NOT NULL COMMENT '单号前缀，如 XS',
  stock_dir    TINYINT      NOT NULL DEFAULT 0 COMMENT '1入库 -1出库 0不动库存',
  ledger_type  SMALLINT     NOT NULL DEFAULT 0 COMMENT '对应库存流水单据类型码',
  need_post    TINYINT      NOT NULL DEFAULT 1 COMMENT '是否需要过账动库存',
  sort         INT          NOT NULL DEFAULT 0,
  status       TINYINT      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB COMMENT='单据类型配置';

INSERT INTO sys_doc_type (code, name, prefix, stock_dir, need_post, sort, status)
VALUES
  ('XS', '销售单',   'XS', -1, 1, 10, 1),
  ('SD', '销售订单', 'SD',  0, 0, 20, 1),
  ('CG', '采购单',   'CG',  1, 1, 30, 1),
  ('CD', '采购订单', 'CD',  0, 0, 40, 1),
  ('DB', '调拨单',   'DB',  0, 1, 50, 1),
  ('PD', '盘点单',   'PD',  0, 1, 60, 1),
  ('QTRK', '其他入库单', 'QTRK', 1, 1, 70, 1),
  ('QTCK', '其他出库单', 'QTCK', -1, 1, 80, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), prefix = VALUES(prefix),
  stock_dir = VALUES(stock_dir), need_post = VALUES(need_post);

-- ---------- 单号流水（按 前缀 + 日期 原子递增）----------
CREATE TABLE IF NOT EXISTS sys_doc_seq (
  prefix   VARCHAR(16) NOT NULL,
  seq_date DATE        NOT NULL,
  current  INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, seq_date)
) ENGINE=InnoDB COMMENT='单据编号流水';

-- ---------- biz_doc 扩展 ----------
ALTER TABLE biz_doc
  ADD COLUMN doc_type_name VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '单据类型名称（快照）' AFTER doc_type,
  ADD COLUMN partner_name  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '往来单位名称（快照）' AFTER partner_id,
  ADD COLUMN contact_phone VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '联系电话' AFTER partner_name,
  ADD COLUMN contact_address VARCHAR(255) NOT NULL DEFAULT '' COMMENT '联系地址' AFTER contact_phone,
  ADD COLUMN warehouse_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '发货仓库名称（快照）' AFTER warehouse_id,
  ADD COLUMN summary       VARCHAR(255) NOT NULL DEFAULT '' COMMENT '摘要',
  ADD COLUMN handler       VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '经办人（用户名）',
  ADD COLUMN creator_name  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '制单人（用户名）',
  ADD COLUMN modifier_name VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '修改人（用户名）',
  ADD COLUMN department    VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '部门',
  ADD COLUMN paid_amount   DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT '已收/已付金额',
  ADD COLUMN print_count   INT          NOT NULL DEFAULT 0 COMMENT '打印次数',
  ADD KEY idx_doc_no_prefix (doc_no),
  ADD KEY idx_partner_name (partner_name),
  ADD KEY idx_summary (summary);

-- 外部来源单号：唯一索引需允许多个 NULL（MySQL 唯一索引不约束 NULL）
ALTER TABLE biz_doc
  MODIFY source_doc_no VARCHAR(64) NULL DEFAULT NULL COMMENT '外部来源单号（幂等）';

-- ---------- biz_doc_line 扩展 ----------
ALTER TABLE biz_doc_line
  ADD COLUMN item_name  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '存货名称（快照）' AFTER item_id,
  ADD COLUMN item_spec  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '规格型号（快照）' AFTER item_name,
  ADD COLUMN item_color VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '颜色（快照）' AFTER item_spec,
  ADD COLUMN unit_name  VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '单位名称（快照）' AFTER unit_id,
  ADD COLUMN summary    VARCHAR(255) NOT NULL DEFAULT '' COMMENT '行摘要' AFTER remark,
  ADD KEY idx_item_name (item_name);
