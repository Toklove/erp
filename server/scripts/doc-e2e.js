/**
 * 单据模块端到端自检（临时脚本，无论成败都会清理自己的数据）
 * 覆盖：建单 → 自动汇总金额 → 明细 → 自动补全 → 审核 → 过账 → 打印计数 → 列表
 */
const mysql = require('mysql2/promise');

const BASE = process.env.BASE || 'http://127.0.0.1:7097';
const DB = { host: '127.0.0.1', user: 'root', password: '123456', database: 'erp' };
const TAG = 'T' + Date.now();

const createdDocIds = [];
const createdItemIds = [];

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

const post = (p, t, d) => api(p, t, { method: 'POST', body: JSON.stringify(d || {}) });

function assert(cond, msg) {
  if (!cond) throw new Error('断言失败: ' + msg);
}

async function cleanup() {
  const db = await mysql.createConnection(DB);
  if (createdDocIds.length) {
    await db.query('DELETE FROM biz_doc_line WHERE doc_id IN (?)', [createdDocIds]);
    await db.query('DELETE FROM biz_doc WHERE id IN (?)', [createdDocIds]);
  }
  if (createdItemIds.length) {
    await db.query('DELETE FROM md_item WHERE id IN (?)', [createdItemIds]);
  }
  await db.end();
}

(async () => {
  const db = await mysql.createConnection(DB);
  const [wh] = await db.query('SELECT id, name FROM md_warehouse ORDER BY id LIMIT 1');
  const warehouse = wh[0];

  const { token } = await post('/api/auth/login', '', { username: 'admin', password: 'admin123' });
  console.log('1. 登录 ok');

  const itemA = await post('/api/md/items/create', token, {
    code: TAG + 'A', name: TAG + '财-101#大床', spec: '1.8*2米', baseUnitId: 1, refCost: 450,
  });
  createdItemIds.push(itemA.id);
  const itemB = await post('/api/md/items/create', token, {
    code: TAG + 'B', name: TAG + '南-床板', spec: '1.5*2米', baseUnitId: 1, refCost: 100,
  });
  createdItemIds.push(itemB.id);
  console.log('2. 物料:', itemA.id, itemB.id);

  const created = await post('/api/doc/create', token, {
    docTypeCode: 'XS',
    bizDate: '2026-05-02',
    partnerName: TAG + '年青家家居',
    contactPhone: '15578802888',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: TAG + ' 【杨霞，1.5*2米】',
    handler: '黄丽萍',
    paidAmount: 0,
    lines: [
      { itemId: itemA.id, itemName: TAG + '财-101#大床', itemSpec: '1.8*2米', itemColor: '星空灰', unitName: '张', qty: 3, price: 450, warehouseId: warehouse.id },
      { itemId: itemA.id, itemName: TAG + '财-101#大床', itemSpec: '1.5*2米', itemColor: '星空灰', unitName: '张', qty: 1, price: 450, warehouseId: warehouse.id },
      { itemId: itemB.id, itemName: TAG + '南-床板', itemSpec: '1.5*2米', itemColor: '15h', unitName: '付', qty: 1, price: 100, warehouseId: warehouse.id },
    ],
  });
  createdDocIds.push(created.id);
  console.log('3. 建单 ok, 单号 =', created.docNo, '金额 =', created.totalAmount, '(期望 1900.0000)');

  const detail = await api('/api/doc/detail/' + created.id, token);
  console.log('4. 详情: 行数 =', detail.lines.length, '| 制单人 =', detail.creatorName, '| 状态 =', detail.status);
  // 前端读的是 camelCase，这里必须断言，否则接口返回 snake_case 时页面会整片空白而脚本照样"通过"
  assert(detail.creatorName === 'admin', `详情 creatorName 应为 admin，实际 ${detail.creatorName}`);
  assert(detail.docNo === created.docNo, `详情 docNo 不一致: ${detail.docNo} vs ${created.docNo}`);
  assert(detail.docTypeCode === 'XS', `详情 docTypeCode 应为 XS，实际 ${detail.docTypeCode}`);
  assert(detail.partnerName === TAG + '年青家家居', `详情 partnerName 异常: ${detail.partnerName}`);
  assert(detail.warehouseName === warehouse.name, `详情 warehouseName 异常: ${detail.warehouseName}`);
  assert(detail.bizDate === '2026-05-02', `详情 bizDate 异常: ${detail.bizDate}`);
  assert(Number(detail.totalAmount) === 1900, `详情 totalAmount 应为 1900，实际 ${detail.totalAmount}`);
  assert(Number(detail.printCount) === 0, `初始 printCount 应为 0，实际 ${detail.printCount}`);
  assert(detail.lines.length === 3, `明细应为 3 行，实际 ${detail.lines.length}`);
  console.log('   行1:', detail.lines[0].itemName, detail.lines[0].itemSpec, detail.lines[0].qty, detail.lines[0].price, detail.lines[0].amount);

  const acPartner = await api(`/api/doc/autocomplete?field=partner&keyword=${encodeURIComponent(TAG)}`, token);
  const acSummary = await api(`/api/doc/autocomplete?field=summary&keyword=${encodeURIComponent(TAG)}`, token);
  const acColor = await api(`/api/doc/autocomplete?field=color&keyword=${encodeURIComponent('星空')}`, token);
  console.log('5. 补全: 往来单位', JSON.stringify(acPartner), '| 摘要条数', acSummary.length, '| 颜色', JSON.stringify(acColor));

  const audit = await post('/api/doc/audit/' + created.id, token);
  console.log('6. 审核后状态 =', audit.status);

  try {
    await post('/api/doc/post/' + created.id, token);
    console.log('7. 过账成功（预期应因库存不足失败！）');
  } catch (e) {
    console.log('7. 过账被拒（预期，库存不足）:', String(e.message).slice(0, 80));
  }

  const printed = await post('/api/doc/printed/' + created.id, token);
  console.log('8. 打印次数 =', printed.printCount);

  const list = await api(`/api/doc/page?keyword=${encodeURIComponent(TAG)}&page=1&pageSize=10`, token);
  console.log('9. 列表命中 =', list.total, '| 首行单号 =', list.rows[0] && list.rows[0].docNo);

  const upd = await post('/api/doc/update/' + created.id, token, {
    docTypeCode: 'XS',
    bizDate: '2026-05-03',
    partnerName: TAG + '年青家家居',
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    summary: TAG + ' 改后摘要',
    lines: [
      { itemId: itemA.id, itemName: TAG + '财-101#大床', itemSpec: '1.8*2米', itemColor: '星空灰', unitName: '张', qty: 2, price: 450, warehouseId: warehouse.id },
    ],
  });
  console.log('10. 改单后金额 =', upd.totalAmount, '(期望 900.0000)');
  assert(Number(upd.totalAmount) === 900, `改单后金额应为 900，实际 ${upd.totalAmount}`);
  const detail2 = await api('/api/doc/detail/' + created.id, token);
  console.log('    明细行数 =', detail2.lines.length, '| 修改人 =', detail2.modifierName);
  assert(detail2.lines.length === 1, `改单后明细应为 1 行，实际 ${detail2.lines.length}`);
  assert(detail2.modifierName === 'admin', `修改人应为 admin，实际 ${detail2.modifierName}`);
  assert(Number(detail2.totalAmount) === 900, `改单后头金额应为 900，实际 ${detail2.totalAmount}`);
  assert(detail2.bizDate === '2026-05-03', `改单后日期异常: ${detail2.bizDate}`);
  assert(detail2.summary === TAG + ' 改后摘要', `改单后摘要异常: ${detail2.summary}`);

  await cleanup();
  console.log('11. 清理完成');
  await db.end();
  process.exit(0);
})().catch(async e => {
  console.error('E2E FAILED:', e.message);
  try {
    await cleanup();
    console.log('清理完成');
  } catch (ce) {
    console.error('清理失败:', ce.message);
  }
  // 必须显式退出：异常路径上外层 mysql 连接没关，进程会一直挂着不返回
  process.exit(1);
});
