/** 通过前端开发服务器(5173)的 /api 代理走一遍导入接口，确认前端调用链路可用 */
const BASE = process.env.WEB || 'http://127.0.0.1:5173';
const fs = require('node:fs');
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
  console.log('登录 ok（经 5173 代理）');

  const help = await api('/api/import/help', token);
  console.log('help 三张表字段说明：', Object.keys(help.format).join(' / '));
  console.log('note:', help.note);

  const payload = JSON.parse(fs.readFileSync('../../db/samples/gjp-sample.json', 'utf8'));
  const p = await api('/api/import/preview', token, { payload });
  console.log(`preview: 单据 ${p.docsTotal}（新建 ${p.docsNew} / 已存在 ${p.docsSkipExisting}）明细 ${p.linesTotal} 样例 ${p.samples.length}`);

  const bal = await api('/api/stock/balance?keyword=', token);
  console.log('库存接口仍可用（页面已移除）：', Array.isArray(bal) ? `${bal.length} 条` : bal);
  console.log('\n全部通过');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
