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
    const [d] = await c.query(
      'SELECT doc_no, doc_type_name, status, total_amount, summary FROM biz_doc WHERE deleted_at IS NULL ORDER BY id'
    );
    console.log('单据', d.length);
    for (const r of d) {
      console.log(' ', r.doc_no, '|', r.doc_type_name, '| status', r.status, '|', r.total_amount, '|', String(r.summary || '').slice(0, 22));
    }
    const [i] = await c.query('SELECT code, name FROM md_item WHERE deleted_at IS NULL ORDER BY id');
    console.log('物料', i.length, i.map(x => x.code).join(','));
    const [b] = await c.query('SELECT item_id, qty, cost_amount FROM stk_balance');
    console.log('余额行', b.length, JSON.stringify(b.map(x => [x.item_id, String(x.qty), String(x.cost_amount)])));
    const [p] = await c.query('SELECT code, name FROM md_partner WHERE deleted_at IS NULL ORDER BY id');
    console.log('往来单位', p.length, p.map(x => x.code).join(','));
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
