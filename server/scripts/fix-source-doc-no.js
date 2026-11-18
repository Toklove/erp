const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '123456',
    database: 'erp',
    multipleStatements: true,
  });

  await c.query('DELETE FROM biz_doc_line');
  await c.query('DELETE FROM biz_doc');
  await c.query("DELETE FROM md_item WHERE code LIKE 'T%'");

  // source_doc_no 的唯一索引要允许多个 NULL（MySQL 唯一索引不约束 NULL）
  await c.query(
    "ALTER TABLE biz_doc MODIFY source_doc_no VARCHAR(64) NULL DEFAULT NULL COMMENT '外部来源单号（幂等）'"
  );

  const [rows] = await c.query('SELECT COUNT(*) AS n FROM biz_doc');
  console.log('biz_doc rows:', rows[0].n);
  await c.end();
})();
