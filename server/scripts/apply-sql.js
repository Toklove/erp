/**
 * 执行 SQL 文件（迁移用）。本机 mysql 客户端不在 PATH，统一用这个跑。
 *
 * 用法：node scripts/apply-sql.js ../../db/migrations/003_doc_line_docno.sql
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '123456',
  database: process.env.DB_NAME || 'erp',
  multipleStatements: true,
};

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error('用法: node scripts/apply-sql.js <sql文件>');
    process.exit(1);
  }
  const full = path.resolve(process.cwd(), file);
  const sql = fs.readFileSync(full, 'utf8');
  const db = await mysql.createConnection(DB);
  try {
    await db.query(sql);
    console.log(`执行成功: ${file}`);
  } finally {
    await db.end();
  }
  process.exit(0);
})().catch(e => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
