/**
 * 一次性清理早期测试留下的垃圾数据：
 *  - md_item 编码为 '0' / '1' 的无引用物料（早期 e2e 手滑造的）
 *  - 单号 XS-2026-11-18-00001 的残留测试单据（明细 item_id 全 0，无库存流水）
 *
 * 用法: node scripts/tidy-db.js
 */
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'erp',
  });
  try {
    // 1) 无引用物料
    const [items] = await c.query("SELECT id, code, name FROM md_item WHERE code IN ('0','1')");
    for (const it of items) {
      const [l] = await c.query('SELECT COUNT(*) AS c FROM biz_doc_line WHERE item_id = ?', [it.id]);
      const [lb] = await c.query('SELECT COUNT(*) AS c FROM stk_ledger WHERE item_id = ?', [it.id]);
      const [bb] = await c.query('SELECT COUNT(*) AS c FROM stk_balance WHERE item_id = ? AND qty <> 0', [it.id]);
      if (Number(l[0].c) || Number(lb[0].c) || Number(bb[0].c)) {
        console.log('跳过物料（仍被引用）', it.code);
        continue;
      }
      await c.query('DELETE FROM stk_balance WHERE item_id = ?', [it.id]);
      await c.query('DELETE FROM md_item WHERE id = ?', [it.id]);
      console.log('删除物料', it.id, `code=${it.code}`, `name=${it.name}`);
    }

    // 2) 残留测试单据
    const [docs] = await c.query("SELECT id, doc_no FROM biz_doc WHERE doc_no = 'XS-2026-11-18-00001'");
    for (const d of docs) {
      const [lg] = await c.query('SELECT COUNT(*) AS c FROM stk_ledger WHERE source_id = ?', [d.id]);
      if (Number(lg[0].c)) {
        console.log('跳过单据（已有库存流水，需先反冲）', d.doc_no);
        continue;
      }
      await c.query('DELETE FROM biz_doc_line WHERE doc_id = ?', [d.id]);
      await c.query('DELETE FROM biz_doc WHERE id = ?', [d.id]);
      console.log('删除单据', d.doc_no);
    }
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
