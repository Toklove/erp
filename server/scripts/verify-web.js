/** 前端开发服务器页面模块烟测：确认各页面能被 vite 正常编译成 JS */
const BASE = process.env.WEB || 'http://127.0.0.1:5173';
const MODULES = [
  '/src/App.tsx',
  '/src/layouts/BasicLayout.tsx',
  '/src/pages/ImportPage.tsx',
  '/src/pages/DocListPage.tsx',
  '/src/pages/DocEditPage.tsx',
  '/src/pages/DocViewPage.tsx',
  '/src/pages/DocPrintPage.tsx',
  '/src/pages/ItemListPage.tsx',
  '/src/api/import.ts',
  '/src/hooks/useIsMobile.ts',
];
let fails = 0;
(async () => {
  for (const m of MODULES) {
    try {
      const res = await fetch(BASE + m);
      const text = await res.text();
      const looksJs = res.ok && !text.includes('Failed to parse') && !text.includes('Transform failed');
      if (!looksJs) {
        fails++;
        console.log(`FAIL ${m} ${res.status} ${text.slice(0, 160)}`);
      } else {
        console.log(`ok   ${m} ${res.status} ${(text.length / 1024).toFixed(1)}kB`);
      }
    } catch (e) {
      fails++;
      console.log(`FAIL ${m} ${e.message}`);
    }
  }
  for (const route of ['/', '/doc', '/doc/edit', '/import', '/md/items', '/doc/print/1']) {
    const res = await fetch(BASE + route);
    const text = await res.text();
    const ok = res.ok && text.includes('<div id="root">');
    if (!ok) { fails++; console.log(`FAIL route ${route} ${res.status}`); }
    else console.log(`ok   route ${route}`);
  }
  console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
  process.exit(fails ? 1 : 0);
})();
