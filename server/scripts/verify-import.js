/** 导入结果核对：按单号取详情，逐字段断言 */
const BASE = process.env.BASE || 'http://127.0.0.1:7001';
let fails = 0;
function eq(a, b, label) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fails++; console.log(`  FAIL ${label}: 实际=${JSON.stringify(a)} 期望=${JSON.stringify(b)}`); }
  else console.log(`  ok   ${label} = ${JSON.stringify(a)}`);
}
async function api(path, token, body) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(`${path} -> ${res.status} ${j.message || ''}`);
  return j.data;
}
(async () => {
  const { token } = await api('/api/auth/login', null, { username: 'admin', password: 'admin123' });

  console.log('XS-2022-12-07-00001（只有表头，来自单据表）');
  const xs = await api('/api/doc/detail-by-no/XS-2022-12-07-00001', token);
  eq(xs.docNo, 'XS-2022-12-07-00001', 'docNo');
  eq(xs.docTypeName, '销售单', 'docTypeName');
  eq(xs.docTypeCode, 'XS', 'docTypeCode');
  eq(xs.bizDate, '2022-12-07', 'bizDate');
  eq(xs.partnerName, '杭州街鸿康家具', 'partnerName');
  eq(Number(xs.totalAmount), 2200, 'totalAmount');
  eq(xs.creatorName, '陈万群', 'creatorName');
  eq(Number(xs.status), 1, 'status 已审核');
  eq(Number(xs.printCount), 1, 'printCount');
  eq(xs.lines.length, 0, '明细 0 行');

  console.log('SD-2022-12-08-00003（明细表补出表头，3 行）');
  const sd = await api('/api/doc/detail-by-no/SD-2022-12-08-00003', token);
  eq(sd.docTypeName, '销售订单', 'docTypeName');
  eq(sd.docTypeCode, 'SD', 'docTypeCode');
  eq(sd.bizDate, '2022-12-08', 'bizDate');
  eq(sd.lines.length, 3, '明细 3 行');
  eq(Number(sd.totalAmount), 2080, 'totalAmount=900+630+550');
  eq(sd.lines.map(l => l.itemName), ['伟东茶几G56-130', '星空灰床头柜', '财-101#大床'], '明细存货名');
  eq(sd.lines.map(l => Number(l.qty)), [2, 3, 1], '明细数量');
  eq(sd.lines.map(l => Number(l.amount)), [900, 630, 550], '明细金额');
  eq(sd.lines.map(l => l.docNo), ['SD-2022-12-08-00003', 'SD-2022-12-08-00003', 'SD-2022-12-08-00003'], '明细冗余单号');
  eq(sd.lines.map(l => l.unitName), ['个', '个', '张'], '单位名');
  eq(sd.lines.every(l => Number(l.itemId) > 0), true, '每行都关联了物料档案');

  console.log('XS-2022-12-09-00009（草稿表 → status=0）');
  const dr = await api('/api/doc/detail-by-no/XS-2022-12-09-00009', token);
  eq(Number(dr.status), 0, 'status 草稿');
  eq(Number(dr.totalAmount), 1200, 'totalAmount');
  eq(dr.creatorName, '黄春花', 'creatorName');
  eq(dr.handler, '陈万群', 'handler');
  eq(dr.department, '销售部', 'department');

  console.log('CG-2022-12-08-00002（采购单，往来单位自动匹配到演示单位）');
  const cg = await api('/api/doc/detail-by-no/CG-2022-12-08-00002', token);
  eq(cg.partnerName, '南宁年青家家居有限公司', 'partnerName');
  eq(Number(cg.totalAmount), 950, 'totalAmount');
  eq(cg.stockDir, 1, 'stockDir 入库');

  console.log('重复执行同一份文件 -> 应全部跳过');
  const payload = JSON.parse(require('node:fs').readFileSync('../../db/samples/gjp-sample.json', 'utf8'));
  const again = await api('/api/import/preview', token, { payload });
  eq(again.docsSkipExisting, 4, '全部已存在');
  eq(again.docsNew, 0, '新建 0');

  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
