/**
 * 完整业务流端到端：走单据接口建单 → 审核 → 过账 → 校验库存与成本。
 *
 * 与 doc-e2e.js 的区别：那个验证的是单据 CRUD 本身（过账故意失败），
 * 这个验证的是「单据 + 过账 + 库存」联动，尤其是 sys_doc_type.stock_dir
 * 决定入库/出库方向这条链路。
 *
 * 用法：node scripts/flow-e2e.js [baseUrl]
 * 自带清理，只删除自己打 tag 的数据。
 */
const mysql = require('mysql2/promise');

const BASE = process.argv[2] || 'http://127.0.0.1:7097';
const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'erp' };
const TAG = 'FLOW' + Date.now();

const docIds = [];
const itemIds = [];

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
    throw new Error(`${path} -> ${res.status} ${body.message || JSON.stringify(body)}`);
  }
  return body.data;
}
const post = (p, t, d) => api(p, t, { method: 'POST', body: JSON.stringify(d || {}) });

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg);
}

async function cleanup() {
  const db = await mysql.createConnection(DB);
  if (docIds.length) {
    await db.query('DELETE FROM stk_ledger WHERE source_id IN (?)', [docIds]);
    await db.query('DELETE FROM biz_doc_line WHERE doc_id IN (?)', [docIds]);
    await db.query('DELETE FROM biz_doc WHERE id IN (?)', [docIds]);
  }
  if (itemIds.length) {
    await db.query('DELETE FROM stk_balance WHERE item_id IN (?)', [itemIds]);
    await db.query('DELETE FROM stk_ledger WHERE item_id IN (?)', [itemIds]);
    await db.query('DELETE FROM md_item WHERE id IN (?)', [itemIds]);
  }
  const [left] = await db.query('SELECT COUNT(*) AS n FROM biz_doc WHERE doc_no LIKE ?', [TAG + '%']);
  await db.end();
  return Number(left[0].n);
}

(async () => {
  const db = await mysql.createConnection(DB);
  const [wh] = await db.query('SELECT id, name FROM md_warehouse ORDER BY id LIMIT 1');
  const warehouse = wh[0];
  assert(warehouse, '库里没有仓库，先跑 seed.sql');

  const { token } = await post('/api/auth/login', '', { username: 'admin', password: 'admin123' });
  console.log('1. 登录 ok | 仓库 =', warehouse.name);

  // ---- 建物料 ----
  const item = await post('/api/md/items/create', token, {
    code: TAG,
    name: TAG + '测试柜',
    spec: '1200*600',
    baseUnitId: 1,
    refCost: 5,
  });
  itemIds.push(item.id);
  console.log('2. 物料 id =', item.id);

  // ---- 采购入库：10 @ 5 = 50 ----
  const cg = await post('/api/doc/create', token, {
    docTypeCode: 'CG',
    bizDate: '2026-05-10',
    partnerName: TAG + '供应商',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: TAG + ' 采购入库',
    lines: [
      {
        itemId: item.id,
        itemName: TAG + '测试柜',
        itemSpec: '1200*600',
        unitName: '个',
        qty: 10,
        price: 5,
        warehouseId: warehouse.id,
      },
    ],
  });
  docIds.push(cg.id);
  assert(Number(cg.totalAmount) === 50, `采购单金额应为 50，实际 ${cg.totalAmount}`);
  console.log('3. 采购单', cg.docNo, '金额', cg.totalAmount);

  await post('/api/doc/audit/' + cg.id, token);
  const postIn = await post('/api/doc/post/' + cg.id, token);
  console.log('4. 采购过账 ok | 流水条数 =', postIn.ledgerCount);

  const bal1 = await api('/api/stock/balance?keyword=' + TAG, token);
  assert(bal1.length === 1, `入库后应有 1 条余额，实际 ${bal1.length}`);
  assert(Number(bal1[0].qty) === 10, `入库后数量应为 10，实际 ${bal1[0].qty}`);
  assert(Number(bal1[0].costAmount) === 50, `入库后金额应为 50，实际 ${bal1[0].costAmount}`);
  assert(Number(bal1[0].avgCost) === 5 || Number(bal1[0].costAmount) / Number(bal1[0].qty) === 5, `均价应为 5`);
  console.log('5. 入库后余额: 数量', bal1[0].qty, '金额', bal1[0].costAmount);

  // ---- 销售出库：4 @ 8 = 32（成本仍是 5，收入不影响库存金额）----
  const xs = await post('/api/doc/create', token, {
    docTypeCode: 'XS',
    bizDate: '2026-05-11',
    partnerName: TAG + '客户',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: TAG + ' 销售出库',
    lines: [
      {
        itemId: item.id,
        itemName: TAG + '测试柜',
        itemSpec: '1200*600',
        unitName: '个',
        qty: 4,
        price: 8,
        warehouseId: warehouse.id,
      },
    ],
  });
  docIds.push(xs.id);
  assert(Number(xs.totalAmount) === 32, `销售单金额应为 32，实际 ${xs.totalAmount}`);
  await post('/api/doc/audit/' + xs.id, token);
  const postOut = await post('/api/doc/post/' + xs.id, token);
  console.log('6. 销售单', xs.docNo, '过账 ok | 流水条数 =', postOut.ledgerCount);

  const bal2 = await api('/api/stock/balance?keyword=' + TAG, token);
  assert(Number(bal2[0].qty) === 6, `出库后数量应为 6，实际 ${bal2[0].qty}`);
  assert(Number(bal2[0].costAmount) === 30, `出库后金额应为 30，实际 ${bal2[0].costAmount}`);
  console.log('7. 出库后余额: 数量', bal2[0].qty, '金额', bal2[0].costAmount);

  // ---- 流水方向核对：入库 +1、出库 -1，出库单价应为 5 ----
  const [ledgers] = await db.query(
    'SELECT direction, qty, cost_price, cost_amount FROM stk_ledger WHERE source_id IN (?) ORDER BY id',
    [docIds]
  );
  assert(ledgers.length === 2, `应有 2 条流水，实际 ${ledgers.length}`);
  const [inLed, outLed] = ledgers;
  assert(Number(inLed.direction) === 1, `入库流水方向应为 1，实际 ${inLed.direction}`);
  assert(Number(outLed.direction) === -1, `出库流水方向应为 -1，实际 ${outLed.direction}`);
  assert(Number(outLed.cost_price) === 5, `出库成本应为 5，实际 ${outLed.cost_price}`);
  assert(Number(outLed.cost_amount) === 20, `出库成本金额应为 20，实际 ${outLed.cost_amount}`);
  console.log('8. 流水:', JSON.stringify(ledgers));

  // ---- 超量出库应被拒 ----
  const xs2 = await post('/api/doc/create', token, {
    docTypeCode: 'XS',
    bizDate: '2026-05-12',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    partnerName: TAG + '客户',
    lines: [
      { itemId: item.id, itemName: TAG + '测试柜', unitName: '个', qty: 99, price: 8, warehouseId: warehouse.id },
    ],
  });
  docIds.push(xs2.id);
  await post('/api/doc/audit/' + xs2.id, token);
  let rejected = false;
  try {
    await post('/api/doc/post/' + xs2.id, token);
  } catch (e) {
    rejected = true;
    console.log('9. 超量出库被拒（预期）:', String(e.message).slice(0, 60));
  }
  assert(rejected, '库存不足时过账必须被拒绝');

  // ---- 已过账单据不可重复过账 ----
  let dupRejected = false;
  try {
    await post('/api/doc/post/' + cg.id, token);
  } catch (e) {
    dupRejected = true;
    console.log('10. 重复过账被拒（预期）:', String(e.message).slice(0, 60));
  }
  assert(dupRejected, '重复过账必须被拒绝');

  const leftover = await cleanup();
  console.log('11. 清理完成，残留单据 =', leftover);
  await db.end();
  process.exit(0);
})().catch(async e => {
  console.error('FLOW E2E FAILED:', e.message);
  try {
    const leftover = await cleanup();
    console.log('清理完成，残留单据 =', leftover);
  } catch (ce) {
    console.error('清理失败:', ce.message);
  }
  process.exit(1);
});
