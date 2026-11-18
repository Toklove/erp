/**
 * 前端-后端字段契约检查。
 *
 * 为什么需要它：typecheck 只保证 TS 类型内部自洽，杀不掉「后端少返回一个字段、
 * 页面渲染成空白但脚本照样报 ok」这类 bug（detail 用 SELECT d.* 返回 snake_case
 * 就是这么漏过去的）。这里拿真实接口数据，逐个核对每个页面实际读的字段。
 *
 * 用法：node scripts/check-contract.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:7001';

let pass = 0;
const fails = [];

function has(obj, path, label) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || !(p in cur)) {
      fails.push(`${label}: 缺少字段 ${path}`);
      return;
    }
    cur = cur[p];
  }
  pass++;
}

async function api(path, token, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(`${path} -> ${res.status} ${body.message}`);
  return body.data;
}

(async () => {
  const { token } = await api('/api/auth/login', '', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });

  // ---------- DocListPage 的表格列 ----------
  const pageData = await api('/api/doc/page?page=1&pageSize=10', token);
  if (!pageData.rows || !pageData.rows.length) {
    console.log('库里没有单据，先跑 node scripts/seed-demo.js');
    process.exit(1);
  }
  const listRow = pageData.rows[0];
  for (const f of [
    'id', 'docNo', 'bizDate', 'docTypeName', 'partnerName', 'warehouseName',
    'totalQty', 'totalAmount', 'status', 'handler', 'creatorName', 'printCount',
  ]) {
    has(listRow, f, 'DocListPage');
  }
  console.log('列表首行：', JSON.stringify(listRow));

  // ---------- DocViewPage / DocEditPage / DocPrintPage 的头部 ----------
  const detail = await api('/api/doc/detail/' + listRow.id, token);
  for (const f of [
    'docNo', 'docType', 'docTypeName', 'docTypeCode', 'bizDate', 'partnerName',
    'contactPhone', 'contactAddress', 'warehouseId', 'warehouseName', 'status',
    'totalQty', 'totalAmount', 'paidAmount', 'summary', 'handler', 'department',
    'creatorName', 'modifierName', 'printCount', 'remark',
  ]) {
    has(detail, f, 'DocDetail');
  }
  if (!Array.isArray(detail.lines) || !detail.lines.length) {
    fails.push('DocDetail: lines 为空');
  } else {
    for (const f of [
      'lineNo', 'itemName', 'itemSpec', 'itemColor', 'unitName', 'qty', 'price', 'amount', 'remark',
    ]) {
      has(detail.lines[0], f, 'DocLine');
    }
  }
  // 打印页直接用 bizDate 渲染，若后端没 DATE_FORMAT 这里会是 ISO 串
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(detail.bizDate))) {
    fails.push(`DocPrintPage: bizDate 格式不对 -> ${detail.bizDate}`);
  }

  // ---------- 下拉 / 基础档案 ----------
  const types = await api('/api/doc/types', token);
  if (!Array.isArray(types) || !types.length) fails.push('DocListPage: /api/doc/types 为空');
  else for (const f of ['code', 'name', 'prefix', 'stockDir', 'needPost']) has(types[0], f, 'DocType');

  const whs = await api('/api/md/warehouses', token);
  if (!Array.isArray(whs) || !whs.length) fails.push('DocEditPage: 仓库下拉为空');
  else for (const f of ['id', 'name']) has(whs[0], f, 'Warehouse');

  const units = await api('/api/md/units', token);
  if (!Array.isArray(units) || !units.length) fails.push('DocEditPage: 单位下拉为空');
  else for (const f of ['id', 'name']) has(units[0], f, 'Unit');

  const partners = await api('/api/md/partners?keyword=' + encodeURIComponent('南宁'), token);
  if (!Array.isArray(partners)) fails.push('DocEditPage: partners 不是数组');
  else if (partners.length) for (const f of ['name', 'phone', 'address']) has(partners[0], f, 'Partner');

  // ---------- 自动补全（DocEditPage 的 AutoCompleteInput） ----------
  for (const [field, kw] of [
    ['summary', 'DEMO'], ['partner', '南宁'], ['item', '床'], ['spec', '米'], ['color', '灰'], ['handler', '黄'],
  ]) {
    const r = await api(`/api/doc/autocomplete?field=${field}&keyword=${encodeURIComponent(kw)}`, token);
    if (!Array.isArray(r)) fails.push(`AutoComplete(${field}): 返回不是数组`);
    else if (r.length) has(r[0], 'value', `AutoComplete(${field})`);
  }

  // ---------- 库存页 ----------
  const bal = await api('/api/stock/balance', token);
  if (!Array.isArray(bal)) fails.push('StockBalancePage: 不是数组');
  else if (bal.length) for (const f of ['warehouseName', 'itemCode', 'itemName', 'qty', 'costAmount']) has(bal[0], f, 'Balance');

  console.log(`\n契约检查：通过 ${pass} 项，失败 ${fails.length} 项`);
  if (fails.length) {
    for (const f of fails) console.log('  ✗', f);
    process.exit(1);
  }
  console.log('全部字段前后端一致 ✅');
  process.exit(0);
})().catch(e => {
  console.error('检查脚本失败:', e.message);
  process.exit(1);
});
