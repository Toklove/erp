const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '123456',
    database: 'erp',
  });

  const [cols] = await c.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='erp' AND TABLE_NAME='sys_doc_type' AND COLUMN_NAME='ledger_type'"
  );
  if (!cols.length) {
    await c.query(
      "ALTER TABLE sys_doc_type ADD COLUMN ledger_type SMALLINT NOT NULL DEFAULT 0 COMMENT '对应库存流水单据类型码' AFTER stock_dir"
    );
  }

  const map = { XS: 201, SD: 0, CG: 101, CD: 0, DB: 301, PD: 401, QTRK: 501, QTCK: 502 };
  for (const [code, v] of Object.entries(map)) {
    await c.query('UPDATE sys_doc_type SET ledger_type=? WHERE code=?', [v, code]);
  }

  const [rows] = await c.query(
    'SELECT code,name,prefix,stock_dir,ledger_type,need_post FROM sys_doc_type ORDER BY sort'
  );
  console.table(rows);
  await c.end();
})();
