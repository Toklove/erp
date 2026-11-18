/**
 * 基础档案接口冒烟：登录后校验 /api/md/warehouses、/units、/partners。
 * 用法：node scripts/verify-md.js [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:7097';

async function req(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

(async () => {
  let failed = 0;
  const check = (name, cond, extra) => {
    if (cond) {
      console.log(`  ok   ${name}`);
    } else {
      failed++;
      console.log(`  FAIL ${name} ${extra ? JSON.stringify(extra) : ''}`);
    }
  };

  console.log('[1] 登录');
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  check('login 200', login.status === 200, login.json);
  const token = login.json?.data?.token;
  check('token 存在', !!token);
  if (!token) process.exit(1);

  console.log('[2] 仓库');
  const wh = await req('GET', '/api/md/warehouses', null, token);
  check('warehouses 200', wh.status === 200, wh.json);
  check('warehouses 是数组', Array.isArray(wh.json?.data), wh.json);
  console.log(`       仓库数 ${wh.json?.data?.length ?? 0}，首条 ${JSON.stringify(wh.json?.data?.[0] ?? null)}`);

  console.log('[3] 单位');
  const un = await req('GET', '/api/md/units', null, token);
  check('units 200', un.status === 200, un.json);
  console.log(`       单位数 ${un.json?.data?.length ?? 0}，首条 ${JSON.stringify(un.json?.data?.[0] ?? null)}`);

  console.log('[4] 往来单位');
  const pt = await req('GET', '/api/md/partners?keyword=', null, token);
  check('partners 200', pt.status === 200, pt.json);
  console.log(`       往来单位数 ${pt.json?.data?.length ?? 0}`);

  console.log('[5] 单据类型');
  const ty = await req('GET', '/api/doc/types', null, token);
  check('types 200', ty.status === 200, ty.json);
  check('types 非空', (ty.json?.data?.length ?? 0) >= 8, ty.json);

  console.log('[6] 自动补全字段');
  for (const f of ['summary', 'partner', 'item', 'handler', 'color']) {
    const r = await req('GET', `/api/doc/autocomplete?field=${f}&keyword=`, null, token);
    check(`autocomplete(${f}) 200`, r.status === 200, r.json);
  }

  console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
