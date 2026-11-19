// 用真实浏览器验证「导出 PNG」：本地起 http 服务 → CDP 驱动 Chrome →
// 把导出的画布原样取回并落盘，供肉眼比对。
// 运行：node .tmp/png-test/run.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const ROOT = path.resolve(HERE); // 统一成 Windows 反斜杠，避免 startsWith 前缀比较误判
const PROFILE = path.join(ROOT, 'profile');
const CDP_PORT = 9412;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ---- 本地 http 服务（同一来源，真实环境也是同源，避免 canvas 被污染）----
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!path.relative(ROOT, file).startsWith('..')) {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
      return;
    }
    res.writeHead(403).end('forbidden');
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const WEB_PORT = server.address().port;
const PAGE_URL = `http://127.0.0.1:${WEB_PORT}/page.html`;

// ---- 极简 CDP 客户端 ----
let wsId = 0;
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`cdp ${msg.error.message}`));
      else p.resolve(msg.result);
    };
    ws.onerror = () => reject(new Error(`websocket error ${url}`));
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          const id = ++wsId;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
        },
        close() {
          ws.close();
        },
      });
  });
}

async function getJson(url, retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* chrome 还没起来 */
    }
    await sleep(250);
  }
  throw new Error(`chrome devtools 没响应: ${url}`);
}

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${PROFILE}`,
    `--remote-debugging-port=${CDP_PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let session;
try {
  const base = `http://127.0.0.1:${CDP_PORT}`;
  await getJson(`${base}/json/version`);
  const tab = await getJson(`${base}/json/list`).then((l) => l.find((t) => t.type === 'page'));
  if (!tab) throw new Error('没有 page target');
  session = await connect(tab.webSocketDebuggerUrl);
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 1800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.navigate', { url: PAGE_URL });
  await sleep(600);
  const nav = await session.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  console.log('href:', nav.result.value, '| target:', PAGE_URL);

  const evaluate = async (expression) => {
    const r = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(
        `表达式出错: ${d.text} | ${d.exception?.description || d.exception?.value || ''} | 表达式=${expression.slice(0, 120)}`,
      );
    }
    return r.result.value;
  };

  // 等页面自己报告结果
  let title = '';
  for (let i = 0; i < 120; i++) {
    title = await evaluate('document.title');
    if (title === 'PNG_OK' || title === 'PNG_FAIL') break;
    await sleep(300);
  }

  const report = await evaluate(`document.getElementById('report').textContent`);

  if (title === 'PNG_OK') {
    const dataUrl = await evaluate(`window.__exportedDataUrl || ''`);
    if (dataUrl.startsWith('data:image/png;base64,')) {
      const b64 = dataUrl.slice('data:image/png;base64,'.length);
      const png = Buffer.from(b64, 'base64');
      writeFileSync(path.join(HERE, 'export.png'), png);
      console.log(`exported png: ${png.length} bytes -> export.png`);
      // 画面尺寸读出，用于确认导出分辨率
      const dims = await evaluate(`(() => {
        const c = window.__exportedCanvas;
        return c ? { w: c.width, h: c.height } : null;
      })()`);
      console.log('canvas dims:', JSON.stringify(dims));
    }
  }

  console.log('title:', title);
  console.log('report:', report);

  // 顺便截一张页面图（含报告 + 预览 + 导出结果）
  const shot = await session.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(HERE, 'page.png'), Buffer.from(shot.data, 'base64'));
  console.log(`page screenshot -> page.png`);
} finally {
  session?.close();
  chrome.kill('SIGKILL');
  server.close();
  const killer = spawn('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*png-test*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ]);
  killer.unref();
}
