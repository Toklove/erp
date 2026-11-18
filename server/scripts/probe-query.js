const { DataSource } = require('typeorm');

(async () => {
  const ds = new DataSource({
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    username: 'root',
    password: '123456',
    database: 'erp',
    entities: [],
    synchronize: false,
  });
  await ds.initialize();

  const sql = `SELECT COUNT(*) AS total FROM biz_doc d WHERE d.deleted_at IS NULL AND (d.doc_no LIKE ? OR d.partner_name LIKE ? OR d.summary LIKE ?)`;
  const params = ['%T%', '%T%', '%T%'];

  const r = await ds.query(sql, params);
  console.log('typeof:', typeof r, 'isArray:', Array.isArray(r));
  console.log('JSON:', JSON.stringify(r));

  const r2 = await ds.query('SELECT id, doc_no FROM biz_doc ORDER BY id DESC LIMIT 3');
  console.log('select2 isArray:', Array.isArray(r2), 'JSON:', JSON.stringify(r2).slice(0, 300));

  const r3 = await ds.query('SELECT 1 AS x');
  console.log('select3 JSON:', JSON.stringify(r3));

  await ds.destroy();
})().catch(e => {
  console.error('ERR', e);
  process.exit(1);
});
