/* 临时探针：打印库表清单与关键表列，用完可删 */
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'erp',
  });

  const [tables] = await conn.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'erp' ORDER BY TABLE_NAME"
  );
  console.log('TABLES:', tables.map(t => t.TABLE_NAME).join(', '));

  for (const name of ['biz_doc', 'biz_doc_line', 'md_item', 'md_unit', 'md_partner', 'sys_doc_type']) {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='erp' AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
      [name]
    );
    console.log(`\n[${name}]`);
    console.log(cols.map(c => `${c.COLUMN_NAME}:${c.COLUMN_TYPE}${c.IS_NULLABLE === 'YES' ? '?' : ''}`).join(' | '));
  }

  const [units] = await conn.query('SELECT id, code, name FROM md_unit');
  console.log('\nUNITS:', JSON.stringify(units));

  await conn.end();
})().catch(e => {
  console.error(e.message);
  process.exit(1);
});
