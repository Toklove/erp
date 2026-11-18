/**
 * 管家婆三表导入 CLI。
 *
 * 为什么不走 Web 接口：历史数据量大、一次性执行，CLI 看得见进度、失败能重跑，
 * 也不至于把一个「可能跑 10 分钟」的任务挂在 HTTP 超时上。
 *
 * 用法：
 *   node scripts/import-gjp.js ../../db/samples/gjp-sample.json            # 先预览再导入
 *   node scripts/import-gjp.js <file> --dry                                # 只预览，不写库
 *   node scripts/import-gjp.js <file> --replace                            # 按单号覆盖已存在单据
 *   node scripts/import-gjp.js <file> --no-drafts                          # 不导入草稿表
 *   node scripts/import-gjp.js <file> --no-auto-items                      # 不为未知存货自动建档
 *   node scripts/import-gjp.js <file> --base http://127.0.0.1:7001
 *
 * 环境变量：GJP_BASE（默认 http://127.0.0.1:7001）、ADMIN_USER/ADMIN_PASS（默认 admin/admin123）
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const flags = new Set(args.filter(a => a.startsWith('--')));
const baseArg = args.find(a => a.startsWith('--base=') || a === '--base');
const BASE =
  (baseArg && baseArg.includes('=') ? baseArg.split('=')[1] : null) ||
  process.env.GJP_BASE ||
  'http://127.0.0.1:7001';

if (!file) {
  console.error('用法: node scripts/import-gjp.js <管家婆导出.json> [--dry] [--replace] [--no-drafts] [--no-auto-items]');
  process.exit(1);
}

const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
if (!fs.existsSync(abs)) {
  console.error('文件不存在:', abs);
  process.exit(1);
}

async function api(pathname, token, body) {
  const res = await fetch(BASE + pathname, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${pathname} -> ${res.status} ${json.message || ''}`);
  }
  return json.data;
}

function printPreview(p) {
  console.log('--- 预览 ---');
  console.log(`模式 ${p.mode} | 单据 ${p.docsTotal} 张（新建 ${p.docsNew} / 已存在跳过 ${p.docsSkipExisting} / 解析失败 ${p.docsSkipError}）`);
  console.log(`明细 ${p.linesTotal} 行 | 草稿 ${p.draftsTotal} 张`);
  const list = (label, arr) => console.log(`${label}：${arr.length ? arr.join('、') : '（无）'}`);
  list('物料已匹配', p.itemsMatched);
  list('物料将自动建档', p.itemsToCreate);
  list('往来单位已匹配', p.partnersMatched);
  list('往来单位将自动建档', p.partnersToCreate);
  list('仓库', p.warehousesMatched);
  list('仓库缺失', p.warehousesMissing);
  list('单据类型已匹配', p.docTypesMatched);
  list('单据类型将自动建档', p.docTypesToCreate);
  if (p.samples.length) {
    console.log('样例：');
    for (const s of p.samples) {
      console.log(`  ${s.action.padEnd(7)} ${s.docNo}  ${s.docTypeName || '?'}  ${s.bizDate || '?'}  ${s.partnerName || ''}  ${s.lineCount} 行  金额 ${s.amount}`);
    }
  }
  if (p.errors.length) {
    console.log(`解析告警 ${p.errors.length} 条：`);
    for (const e of p.errors) console.log(`  第 ${e.index + 1} 行 ${e.docNo}: ${e.message}`);
  }
}

function printResult(r) {
  console.log('--- 结果 ---');
  console.log(`新建 ${r.created} 张 | 覆盖 ${r.replaced} 张 | 跳过 ${r.skipped} 张 | 失败 ${r.failed} 张 | 明细 ${r.lines} 行`);
  if (r.createdItems.length) console.log('自动建档物料：' + r.createdItems.join('、'));
  if (r.createdPartners.length) console.log('自动建档往来单位：' + r.createdPartners.join('、'));
  if (r.createdDocTypes.length) console.log('自动建档单据类型：' + r.createdDocTypes.join('、'));
  if (r.errors.length) {
    console.log(`失败/告警 ${r.errors.length} 条：`);
    for (const e of r.errors) console.log(`  ${e.docNo}: ${e.message}`);
  }
}

(async () => {
  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const { token } = await api('/api/auth/login', null, {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASS || 'admin123',
  });
  console.log('目标服务', BASE, '| 登录 ok | 文件', abs);

  const options = {
    mode: flags.has('--replace') ? 'replace' : 'skip',
    includeDrafts: !flags.has('--no-drafts'),
    autoCreateItems: !flags.has('--no-auto-items'),
  };

  const preview = await api('/api/import/preview', token, { payload, ...options });
  printPreview(preview);

  if (flags.has('--dry')) {
    console.log('(--dry 只预览，未写入数据库)');
    return;
  }

  const result = await api('/api/import/execute', token, { payload, ...options });
  printResult(result);
  if (result.failed) process.exitCode = 1;
})().catch(e => {
  console.error('导入失败:', e.message);
  process.exit(1);
});
