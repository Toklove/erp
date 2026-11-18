const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'erp',
  });
  try {
    const [items] = await c.query(
      "SELECT id, code, name, status FROM md_item WHERE code IN ('0','1')"
    );
    for (const it of items) {
      const [l] = await c.query('SELECT COUNT(*) AS c FROM biz_doc_line WHERE item_id = ?', [it.id]);
      const [lb] = await c.query('SELECT COUNT(*) AS c FROM stk_ledger WHERE item_id = ?', [it.id]);
      const [bb] = await c.query('SELECT COUNT(*) AS c FROM stk_balance WHERE item_id = ?', [it.id]);
      console.log('item', it.id, it.code, it.name, '| lines', l[0].c, '| ledger', lb[0].c, '| balance', bb[0].c);
    }

    const [doc] = await c.query("SELECT id, doc_no, status FROM biz_doc WHERE doc_no = 'XS-2026-11-18-00001'");
    if (doc.length) {
      const id = doc[0].id;
      const [lg] = await c.query('SELECT COUNT(*) AS c FROM stk_ledger WHERE source_id = ?', [id]);
      const [ln] = await c.query('SELECT COUNT(*) AS c FROM biz_doc_line WHERE doc_id = ?', [id]);
      console.log('doc', id, doc[0].doc_no, 'status', doc[0].status, '| ledger', lg[0].c, '| lines', ln[0].c);
      const [rows] = await c.query('SELECT line_no, item_id, item_name, qty, amount FROM biz_doc_line WHERE doc_id = ? ORDER BY line_no', [id]);
      console.log(JSON.stringify(rows));
    }
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e.message); process.exit(1); });
