/**
 * 验证「明细只写了存货名、没有物料档案」时过账不再报错。
 * 用 QTRK（其他入库，stock_dir=+1）做，避免负库存干扰。
 */
const BASE = process.env.BASE || 'http://127.0.0.1:7001';
let fails = 0;
function ok(cond, label, extra) {
  if (cond) console.log('  ok   ' + label);
  else { fails++; console.log('  FAIL ' + label + (extra ? ' -> ' + extra : '')); }
}
async function api(path, token, body) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok && j.success !== false, data: j.data, message: j.message };
}
(async () => {
  const login = await api('/api/auth/login', null, { username: 'admin', password: 'admin123' });
  const token = login.data.token;
  const name = '自动建档测试柜-' + Date.now();

  const create = await api('/api/doc/create', token, {
    docTypeCode: 'QTRK',
    bizDate: '2022-12-10',
    warehouseId: 1,
    summary: '过账自动建档验证',
    lines: [{ itemName: name, itemSpec: '800*400*1200', unitName: '个', qty: 3, price: 88 }],
  });
  ok(create.ok, '建单成功', create.message);
  const docId = create.data.id;
  ok(Number(create.data.totalAmount) === 264, '金额 3*88=264', create.data.totalAmount);

  const detail = await api('/api/doc/detail/' + docId, token);
  ok(Number(detail.data.lines[0].itemId) === 0, '建单时明细确实没有 itemId');

  const audit = await api('/api/doc/audit/' + docId, token, {});
  ok(audit.ok, '审核成功', audit.message);

  const post = await api('/api/doc/post/' + docId, token, {});
  ok(post.ok, '过账成功（不再报「没有关联物料档案」）', post.message);
  ok(Array.isArray(post.data.autoCreateItems) && post.data.autoCreateItems.length === 1, '自动建档 1 个物料', JSON.stringify(post.data));

  const after = await api('/api/doc/detail/' + docId, token);
  ok(Number(after.data.lines[0].itemId) > 0, '过账后明细回写了 itemId', after.data.lines[0].itemId);
  ok(after.data.lines[0].unitName === '个', '单位名 = 个', after.data.lines[0].unitName);
  ok(Number(after.data.status) === 2, '状态 = 已过账');

  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
