/**
 * 端到端自检（临时脚本，跑完即删）：
 * 登录 → 建物料 → 造采购入库单 → 过账 → 查余额 → 造销售出库单 → 过账 → 查余额 → 清理
 */
const mysql = require('mysql2/promise');

const BASE = 'http://127.0.0.1:7098';
const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'erp' };

const TAG = 'E2E' + Date.now();

async function api(path, token, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

(async () => {
  const db = await mysql.createConnection(DB);
  const [wh] = await db.query('select id from md_warehouse order by id limit 1');
  const warehouseId = wh[0].id;

  // 1. 登录
  const login = await api('/api/auth/login', '', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  console.log('1. login ok, token len =', login.token.length);
  const token = login.token;

  // 2. 建物料
  const item = await api('/api/md/items/create', token, {
    method: 'POST',
    body: JSON.stringify({ code: TAG, name: '自检物料', spec: 'TEST', baseUnitId: 1, refCost: 5 }),
  });
  console.log('2. item created id =', item.id, 'code =', item.code);

  // 3. 采购入库单（10 个，单价 5）
  const [docIn] = await db.query(
    `INSERT INTO biz_doc (doc_no, doc_type, biz_date, warehouse_id, status, source_doc_no, total_qty, total_amount)
     VALUES (?, 101, CURDATE(), ?, 1, ?, 10, 50)`,
    [TAG + '-IN', warehouseId, TAG + '-IN']
  );
  const docInId = docIn.insertId;
  await db.query(
    `INSERT INTO biz_doc_line (doc_id, line_no, item_id, unit_id, qty, base_qty, price, amount, warehouse_id)
     VALUES (?, 1, ?, 1, 10, 10, 5, 50, ?)`,
    [docInId, item.id, warehouseId]
  );
  console.log('3. inbound doc', docInId);

  // 4. 过账
  const postIn = await api('/api/stock/post/' + docInId, token, { method: 'POST' });
  console.log('4. posted inbound, ledgers =', postIn.ledgerCount);

  // 5. 查余额
  const bal1 = await api('/api/stock/balance?keyword=' + TAG, token);
  console.log('5. balance:', JSON.stringify(bal1.map(b => ({ qty: b.qty, cost: b.costAmount }))));

  // 6. 销售出库 4 个
  const [docOut] = await db.query(
    `INSERT INTO biz_doc (doc_no, doc_type, biz_date, warehouse_id, status, source_doc_no, total_qty, total_amount)
     VALUES (?, 201, CURDATE(), ?, 1, ?, 4, 40)`,
    [TAG + '-OUT', warehouseId, TAG + '-OUT']
  );
  const docOutId = docOut.insertId;
  await db.query(
    `INSERT INTO biz_doc_line (doc_id, line_no, item_id, unit_id, qty, base_qty, price, amount, warehouse_id)
     VALUES (?, 1, ?, 1, 4, 4, 10, 40, ?)`,
    [docOutId, item.id, warehouseId]
  );
  await api('/api/stock/post/' + docOutId, token, { method: 'POST' });
  const bal2 = await api('/api/stock/balance?keyword=' + TAG, token);
  console.log('6. after outbound:', JSON.stringify(bal2.map(b => ({ qty: b.qty, cost: b.costAmount }))));

  // 7. 流水核对
  const [ledger] = await db.query(
    'select direction, qty, cost_price, cost_amount from stk_ledger where source_id in (?,?) order by id',
    [docInId, docOutId]
  );
  console.log('7. ledger:', JSON.stringify(ledger));

  // 8. 重复过账应被拒
  try {
    await api('/api/stock/post/' + docInId, token, { method: 'POST' });
    console.log('8. DUPLICATE POST ALLOWED (BUG!)');
  } catch (e) {
    console.log('8. duplicate post rejected ok:', String(e.message).slice(0, 80));
  }

  // 9. 清理
  await db.query('delete from stk_ledger where source_id in (?,?)', [docInId, docOutId]);
  await db.query('delete from stk_balance where item_id = ?', [item.id]);
  await db.query('delete from biz_doc_line where doc_id in (?,?)', [docInId, docOutId]);
  await db.query('delete from biz_doc where id in (?,?)', [docInId, docOutId]);
  await db.query('delete from md_item where id = ?', [item.id]);
  const [left] = await db.query('select count(*) n from stk_balance where item_id = ?', [item.id]);
  console.log('9. cleaned, leftover balance rows =', left[0].n);
  await db.end();
})().catch(async e => {
  console.error('E2E FAILED:', e.message);
  process.exitCode = 1;
});
