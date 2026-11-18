/**
 * 清理测试脚本留下的痕迹。
 *
 * verify-auto-item.js 会建一张已过账的 QTRK 单并自动建档一个物料；
 * 直接删单据会留下库存流水和余额，所以这里按「反冲」的方式清理：
 *   余额 -= 流水方向 × 流水数量/金额  →  删流水  →  删明细  →  删单据  →  删自动建档的物料
 *
 * 用法: node scripts/cleanup-test.js
 */
const mysql = require('mysql2/promise');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '123456',
  database: process.env.DB_NAME || 'erp',
};

(async () => {
  const conn = await mysql.createConnection(cfg);
  try {
    const [docs] = await conn.query(
      "SELECT id, doc_no, status FROM biz_doc WHERE summary = '过账自动建档验证'"
    );
    console.log('待清理单据:', docs.length, docs.map(d => d.doc_no).join(', '));

    for (const d of docs) {
      const [ledgers] = await conn.query(
        'SELECT id, warehouse_id, location_id, item_id, batch_no, direction, qty, cost_amount FROM stk_ledger WHERE source_id = ?',
        [d.id]
      );
      for (const l of ledgers) {
        const sign = Number(l.direction) === -1 ? -1 : 1;
        await conn.query(
          `UPDATE stk_balance SET qty = qty - ?, cost_amount = cost_amount - ?
             WHERE warehouse_id = ? AND location_id = ? AND item_id = ? AND batch_no = ?`,
          [Number(l.qty) * sign, Number(l.cost_amount) * sign, l.warehouse_id, l.location_id, l.item_id, l.batch_no ?? '']
        );
      }
      if (ledgers.length) {
        await conn.query('DELETE FROM stk_ledger WHERE source_id = ?', [d.id]);
        console.log(`  ${d.doc_no}: 已反冲 ${ledgers.length} 条流水`);
      }
      await conn.query('DELETE FROM biz_doc_line WHERE doc_id = ?', [d.id]);
      await conn.query('DELETE FROM biz_doc WHERE id = ?', [d.id]);
    }

    const [items] = await conn.query("SELECT id, code, name FROM md_item WHERE name LIKE '自动建档测试柜-%'");
    if (items.length) {
      // 只删没有非零余额、没有流水引用的物料，避免误删
      for (const it of items) {
        // 反冲后余额可能归零但行还在，先把零行删掉
        await conn.query('DELETE FROM stk_balance WHERE item_id = ? AND qty = 0 AND cost_amount = 0', [it.id]);
        const [bal] = await conn.query(
          'SELECT COUNT(*) AS c FROM stk_balance WHERE item_id = ? AND qty <> 0',
          [it.id]
        );
        const [use] = await conn.query('SELECT COUNT(*) AS c FROM biz_doc_line WHERE item_id = ?', [it.id]);
        const [led] = await conn.query('SELECT COUNT(*) AS c FROM stk_ledger WHERE item_id = ?', [it.id]);
        if (Number(bal[0].c) === 0 && Number(use[0].c) === 0 && Number(led[0].c) === 0) {
          await conn.query('DELETE FROM md_item WHERE id = ?', [it.id]);
          console.log('  已删物料', it.code, it.name);
        } else {
          console.log('  保留物料（仍有余额或流水引用）', it.code, it.name);
        }
      }
    }

    const [left] = await conn.query(
      'SELECT COUNT(*) AS c FROM biz_doc_line WHERE item_name LIKE ?',
      ['自动建档测试柜-%']
    );
    console.log('清理完成，剩余相关明细行:', left[0].c);
  } finally {
    await conn.end();
  }
})().catch(e => {
  console.error('清理失败:', e.message);
  process.exit(1);
});
