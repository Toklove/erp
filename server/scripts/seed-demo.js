/**
 * 演示数据：造一批能直接看效果的往来单位 / 物料 / 单据，并走完审核+过账。
 *
 * 用法：
 *   node scripts/seed-demo.js            # 造数据（按编码去重，可重复执行）
 *   node scripts/seed-demo.js --clean    # 清掉本脚本造的数据
 *
 * 造出来的东西都带 DEMO 前缀，清理脚本只删这些，不碰你自己的数据。
 */
const mysql = require('mysql2/promise');

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://127.0.0.1:7001';
const CLEAN = process.argv.includes('--clean');
const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '123456', database: 'erp' };

const PARTNERS = [
  // partnerType: 1客户 2供应商 3兼有
  { code: 'DEMO-S01', name: '南宁年青家家居有限公司', type: 2, contact: '杨霞', phone: '15578802888', address: '南宁市西乡塘区安吉大道56号' },
  { code: 'DEMO-C01', name: '南宁安特家具直营店', type: 1, contact: '黄丽萍', phone: '13877001122', address: '南宁市青秀区民族大道128号' },
];

const ITEMS = [
  { code: 'DEMO-I01', name: '财-101#大床', spec: '1.8*2米', unitId: 1, refCost: 450 },
  { code: 'DEMO-I02', name: '南-床板', spec: '1.5*2米', unitId: 1, refCost: 100 },
  { code: 'DEMO-I03', name: '星空灰床头柜', spec: '500*400*550', unitId: 1, refCost: 220 },
];

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

async function clean() {
  const db = await mysql.createConnection(DB);
  const [docs] = await db.query('SELECT id FROM biz_doc WHERE summary LIKE ?', ['DEMO%']);
  const ids = docs.map(d => d.id);
  if (ids.length) {
    await db.query('DELETE FROM stk_ledger WHERE source_id IN (?)', [ids]);
    await db.query('DELETE FROM biz_doc_line WHERE doc_id IN (?)', [ids]);
    await db.query('DELETE FROM biz_doc WHERE id IN (?)', [ids]);
  }
  const [items] = await db.query('SELECT id FROM md_item WHERE code LIKE ?', ['DEMO-%']);
  const itemIds = items.map(i => i.id);
  if (itemIds.length) {
    await db.query('DELETE FROM stk_balance WHERE item_id IN (?)', [itemIds]);
    await db.query('DELETE FROM stk_ledger WHERE item_id IN (?)', [itemIds]);
    await db.query('DELETE FROM md_item WHERE id IN (?)', [itemIds]);
  }
  await db.query('DELETE FROM md_partner WHERE code LIKE ?', ['DEMO-%']);
  await db.query('DELETE FROM stk_balance WHERE qty = 0 AND cost_amount = 0');
  await db.end();
  console.log(`清理完成：单据 ${ids.length} 张，物料 ${itemIds.length} 个，往来单位已删`);
}

(async () => {
  if (CLEAN) return clean();

  const db = await mysql.createConnection(DB);
  const [wh] = await db.query('SELECT id, name FROM md_warehouse ORDER BY id LIMIT 1');
  const warehouse = wh[0];
  if (!warehouse) throw new Error('库里没有仓库，先跑 ../db/seed.sql');

  const { token } = await post('/api/auth/login', '', { username: 'admin', password: 'admin123' });
  console.log('登录 ok | 仓库 =', warehouse.name);

  // ---- 往来单位（表里没有对应接口，直接写库）----
  for (const p of PARTNERS) {
    const [exist] = await db.query('SELECT id FROM md_partner WHERE code = ?', [p.code]);
    if (exist.length) {
      console.log('往来单位已存在，跳过:', p.name);
      continue;
    }
    await db.query(
      `INSERT INTO md_partner (code, name, partner_type, contact, phone, address, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [p.code, p.name, p.type, p.contact, p.phone, p.address]
    );
    console.log('往来单位:', p.name);
  }

  // ---- 物料 ----
  const items = {};
  for (const it of ITEMS) {
    const page = await api(`/api/md/items/page?keyword=${encodeURIComponent(it.code)}&page=1&pageSize=50`, token);
    const found = (page.rows || []).find(r => r.code === it.code);
    if (found) {
      items[it.code] = found;
      console.log('物料已存在，跳过:', it.name);
      continue;
    }
    const created = await post('/api/md/items/create', token, {
      code: it.code,
      name: it.name,
      spec: it.spec,
      baseUnitId: it.unitId,
      refCost: it.refCost,
    });
    items[it.code] = created;
    console.log('物料:', it.name, 'id =', created.id);
  }

  // ---- 采购入库单（已审核 + 已过账）----
  const cg = await post('/api/doc/create', token, {
    docTypeCode: 'CG',
    bizDate: '2026-05-08',
    partnerName: PARTNERS[0].name,
    contactPhone: PARTNERS[0].phone,
    contactAddress: PARTNERS[0].address,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: 'DEMO 期初采购入库',
    handler: '黄丽萍',
    department: '采购部',
    lines: [
      { itemId: items['DEMO-I01'].id, itemName: '财-101#大床', itemSpec: '1.8*2米', itemColor: '原木色', unitName: '张', qty: 10, price: 450, warehouseId: warehouse.id, remark: '含运费' },
      { itemId: items['DEMO-I02'].id, itemName: '南-床板', itemSpec: '1.5*2米', itemColor: '原木色', unitName: '付', qty: 20, price: 100, warehouseId: warehouse.id },
      { itemId: items['DEMO-I03'].id, itemName: '星空灰床头柜', itemSpec: '500*400*550', itemColor: '星空灰', unitName: '个', qty: 15, price: 220, warehouseId: warehouse.id },
    ],
  });
  await post('/api/doc/audit/' + cg.id, token);
  await post('/api/doc/post/' + cg.id, token);
  console.log('采购单', cg.docNo, '金额', cg.totalAmount, '已审核过账');

  // ---- 销售出库单（已审核 + 已过账）----
  const xs = await post('/api/doc/create', token, {
    docTypeCode: 'XS',
    bizDate: '2026-05-09',
    partnerName: PARTNERS[1].name,
    contactPhone: PARTNERS[1].phone,
    contactAddress: PARTNERS[1].address,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: 'DEMO 【杨霞，1.8*2米】',
    handler: '黄丽萍',
    department: '销售部',
    paidAmount: 500,
    lines: [
      { itemId: items['DEMO-I01'].id, itemName: '财-101#大床', itemSpec: '1.8*2米', itemColor: '原木色', unitName: '张', qty: 2, price: 550, warehouseId: warehouse.id, remark: '送货上门' },
      { itemId: items['DEMO-I03'].id, itemName: '星空灰床头柜', itemSpec: '500*400*550', itemColor: '星空灰', unitName: '个', qty: 2, price: 300, warehouseId: warehouse.id },
    ],
  });
  await post('/api/doc/audit/' + xs.id, token);
  await post('/api/doc/post/' + xs.id, token);
  console.log('销售单', xs.docNo, '金额', xs.totalAmount, '已审核过账');

  // ---- 一张草稿采购订单，方便试编辑/删除 ----
  const cd = await post('/api/doc/create', token, {
    docTypeCode: 'CD',
    bizDate: '2026-05-12',
    partnerName: PARTNERS[0].name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: 'DEMO 待确认的采购订单（草稿）',
    handler: 'admin',
    lines: [
      { itemId: items['DEMO-I02'].id, itemName: '南-床板', itemSpec: '1.5*2米', unitName: '付', qty: 30, price: 95, warehouseId: warehouse.id },
    ],
  });
  console.log('采购订单（草稿）', cd.docNo);

  const bal = await api('/api/stock/balance', token);
  console.log('\n当前库存：');
  for (const b of bal) {
    const avg = Number(b.qty) > 0 ? (Number(b.costAmount) / Number(b.qty)).toFixed(2) : '0.00';
    console.log(`  ${b.warehouseName} | ${b.itemName || b.itemId}  数量 ${b.qty}  金额 ${b.costAmount}  均价 ${avg}`);
  }

  await db.end();
  console.log('\n演示数据就绪。清掉用：node scripts/seed-demo.js --clean');
  process.exit(0);
})().catch(e => {
  console.error('SEED FAILED:', e.message);
  process.exit(1);
});
