-- =============================================================
-- 003：单据明细冗余「单据编号」
--
-- 为什么冗余：
--   1. 管家婆的单据详情表自带「单据编号」列，导入/反查时按单号对齐比拿 doc_id 方便得多；
--   2. 「查看某个单号的全部明细」「按单号导出对账单」这类查询不用回表 join；
--   3. 单号创建后不可修改（只有单据内容可改），冗余不会有一致性风险。
--
-- 关联仍以 doc_id 为准（主键关联、走索引、改名/改号都不影响），
-- doc_no 只是给人看和给导入用的快照。
-- =============================================================

ALTER TABLE biz_doc_line
  ADD COLUMN doc_no VARCHAR(64) NOT NULL DEFAULT '' COMMENT '单据编号（冗余快照）' AFTER doc_id;

-- 回填历史数据
UPDATE biz_doc_line l
  JOIN biz_doc d ON d.id = l.doc_id
   SET l.doc_no = d.doc_no
 WHERE l.doc_no = '';

ALTER TABLE biz_doc_line
  ADD KEY idx_line_doc_no (doc_no);
