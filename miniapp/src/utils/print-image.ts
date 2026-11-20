import type { DocHead } from '../api/doc';
import { COMPANY } from '../config/company';
import { fmtMoney, toChineseAmount } from './format';

/**
 * 把一张单据画成「和 Web 端打印页一模一样」的图片。
 *
 * 为什么要在小程序里自己画一遍：
 * 小程序没有 DOM、没有 window.print()，也不能把 view 截成图。要让小程序里
 * 看到、保存下来的单据和电脑端打印出来的完全一致，只能按同一份版式用
 * canvas 重画，再导出 png（保存到相册后可打印，或直接发给打印店）。
 *
 * 所有尺寸都从 web/src/index.css 的 .print-sheet 换算：
 *   纸张宽 225mm，1in = 25.4mm = 96px  =>  850.39px
 *   padding 6mm 8mm                    =>  22.68px / 30.24px
 *   字号 12px、行高 1.5、标题 21px、表格 9 列 7/25/13/9/7/9/10/11/9 %
 * 改 Web 端打印样式时，这里的常量要跟着改。
 */

const IN_MM = 96 / 25.4;

/** 纸张宽度（CSS px），与 web 端 .print-sheet 的 225mm 一致 */
export const SHEET_WIDTH_PX = 225 * IN_MM;
/** 纸张最小高度 */
const SHEET_MIN_HEIGHT = 130 * IN_MM;

const PAD_X = 8 * IN_MM;
const PAD_Y = 6 * IN_MM;
const CONTENT_W = SHEET_WIDTH_PX - PAD_X * 2;

const BASE_FONT = 12;
const LINE_145 = BASE_FONT * 1.45; // 表格行高
const LINE_17 = BASE_FONT * 1.7; // 表头信息行高
/** 表头信息每行的实际占位：行盒 20.4 + 值区底部 1px 点线 */
const META_ROW_H = LINE_17 + 1;
const LINE_18 = BASE_FONT * 1.8; // 合计区行高
const LINE_2 = BASE_FONT * 2; // 签字行行高

const TITLE_SIZE = 21;
const TITLE_SPACING = 3;

const CELL_PAD_X = 3;
const CELL_PAD_Y = 2;
const COLS = [7, 25, 13, 9, 7, 9, 10, 11, 9];
const HEADERS = ['行号', '存货名称', '规格', '颜色', '单位', '数量', '单价', '金额', '备注'];
/** 需要居中 / 右对齐的列下标（与 web 端 td.center / td.num 对应） */
const CENTER_COLS = [0, 4];
const RIGHT_COLS = [5, 6, 7];

const QR_SIZE = 100;
const GAP = 12;
/** 二维码是行内图片，行盒会在图片下留出基线以下的空隙（实测 7.6px） */
const IMG_LINE_GAP = 7.6;
const FONT_FAMILY = 'SimSun, 宋体, Songti SC, serif';

type Ctx = any;

export interface PrintImageResult {
  /** 临时文件路径，可直接给 image / saveImageToPhotosAlbum 用 */
  path: string;
  /** 导出图片的像素宽高 */
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ */
/* 基础绘图工具                                                       */
/* ------------------------------------------------------------------ */

function setFont(ctx: Ctx, size: number, bold = false): void {
  const spec = `${bold ? 'bold ' : ''}${size}px "${FONT_FAMILY}"`;
  if ('font' in ctx) {
    try {
      ctx.font = spec;
      return;
    } catch {
      /* 老基础库不支持 font 属性，退回 setFontSize */
    }
  }
  if (typeof ctx.setFontSize === 'function') ctx.setFontSize(size);
}

/** measureText 在个别老基础库上返回 undefined，按字宽估算兜底 */
function textWidth(ctx: Ctx, text: string, size: number): number {
  if (!text) return 0;
  try {
    const m = ctx.measureText(text);
    if (m && typeof m.width === 'number' && Number.isFinite(m.width) && m.width > 0) return m.width;
  } catch {
    /* ignore */
  }
  let w = 0;
  for (const ch of text) w += /[\x00-\xff]/.test(ch) ? size * 0.55 : size;
  return w;
}

function fillRect(ctx: Ctx, x: number, y: number, w: number, h: number, color = '#000'): void {
  if (w <= 0 || h <= 0) return;
  ctx.setFillStyle(color);
  ctx.fillRect(x, y, w, h);
}

function strokeLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, width = 1): void {
  ctx.setStrokeStyle('#000');
  ctx.setLineWidth(width);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 表头信息里的点线下划线（等价 CSS border-bottom: 1px dotted #666） */
function dottedLine(ctx: Ctx, x1: number, y: number, x2: number): void {
  if (x2 <= x1) return;
  ctx.setStrokeStyle('#666');
  ctx.setLineWidth(1);
  const canDash = typeof ctx.setLineDash === 'function';
  try {
    if (canDash) ctx.setLineDash([1, 1.5]);
  } catch {
    /* ignore */
  }
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  if (canDash) {
    try {
      ctx.setLineDash([]);
    } catch {
      /* ignore */
    }
  }
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {},
): void {
  if (!text) return;
  setFont(ctx, size, Boolean(opts.bold));
  if (typeof ctx.setTextBaseline === 'function') ctx.setTextBaseline('top');
  if (typeof ctx.setTextAlign === 'function') ctx.setTextAlign(opts.align || 'left');
  ctx.setFillStyle('#000');
  ctx.fillText(text, x, y);
}

/** 标题带 letter-spacing，canvas 没这个属性，只能逐字画 */
function drawSpacedText(ctx: Ctx, text: string, centerX: number, y: number, size: number, spacing: number): void {
  if (!text) return;
  setFont(ctx, size, true);
  if (typeof ctx.setTextBaseline === 'function') ctx.setTextBaseline('top');
  if (typeof ctx.setTextAlign === 'function') ctx.setTextAlign('left');
  ctx.setFillStyle('#000');
  const chars = Array.from(text);
  const widths = chars.map((c) => textWidth(ctx, c, size));
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = centerX - total / 2;
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + spacing;
  }
}

/* ------------------------------------------------------------------ */
/* 版式计算                                                           */
/* ------------------------------------------------------------------ */

interface CellText {
  /** 换行后的每一行文字 */
  lines: string[];
  align: 'left' | 'center' | 'right';
}

interface TableRow {
  top: number;
  height: number;
  cells: CellText[];
}

interface SheetLayout {
  height: number;
  titleY: number;
  ruleY: number;
  metaY: number;
  tableTop: number;
  rows: TableRow[];
  footY: number;
  colX: number[];
  colW: number[];
}

/** 与 web 端 tbody 的取值方式完全一致（没有名称的行整行留空） */
function rowValues(line: any, index: number): string[] {
  const has = Boolean(line && String(line.itemName || '').trim());
  return [
    has ? String(index + 1) : '',
    has ? String(line.itemName || '') : '',
    has ? String(line.itemSpec || '') : '',
    has ? String(line.itemColor || '') : '',
    has ? String(line.unitName || '') : '',
    has ? Number(line.qty || 0).toFixed(2) : '',
    has ? fmtMoney(line.price) : '',
    has ? fmtMoney(line.amount) : '',
    has ? String(line.remark || '') : '',
  ];
}

/** 等价 CSS word-break: break-all，逐字换行 */
function wrapCell(ctx: Ctx, text: string, maxWidth: number): string[] {
  if (!text) return [''];
  setFont(ctx, BASE_FONT);
  const out: string[] = [];
  let cur = '';
  for (const ch of text) {
    const next = cur + ch;
    if (cur && textWidth(ctx, next, BASE_FONT) > maxWidth) {
      out.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  out.push(cur);
  return out;
}

function measureSheet(ctx: Ctx, doc: DocHead): SheetLayout {
  const titleH = TITLE_SIZE * 1.5 + 4; // 行盒 + padding-bottom
  const ruleH = 5 + 6; // 双线 5 + margin-bottom 6
  // 右列 4 行：行盒 20.4 + 值区底部那条 1px 点线（CSS 里 border-bottom 会把行盒撑到 21.4）
  const metaH = 4 * META_ROW_H;

  const titleY = PAD_Y;
  const ruleY = titleY + titleH;
  const metaY = ruleY + ruleH;

  const colW = COLS.map((p) => (CONTENT_W * p) / 100);
  const colX: number[] = [];
  let acc = PAD_X;
  for (let i = 0; i < COLS.length; i += 1) {
    colX.push(acc);
    acc += colW[i];
  }
  colX.push(PAD_X + CONTENT_W);

  const rows: TableRow[] = [];
  // .print-meta 的 margin-bottom(4) 与 .print-table 的 margin-top(2) 会折叠成 4
  let top = metaY + metaH + 4;

  const pushRow = (values: string[], isHead: boolean) => {
    const cells: CellText[] = values.map((v, k) => {
      const innerW = colW[k] - CELL_PAD_X * 2 - 1;
      const lines = isHead ? [v] : wrapCell(ctx, v, innerW);
      const align: 'left' | 'center' | 'right' = isHead
        ? 'center'
        : CENTER_COLS.indexOf(k) >= 0
          ? 'center'
          : RIGHT_COLS.indexOf(k) >= 0
            ? 'right'
            : 'left';
      return { lines: lines.length ? lines : [''], align };
    });
    const maxLines = cells.reduce((m, c) => Math.max(m, c.lines.length), 1);
    const height = maxLines * LINE_145 + CELL_PAD_Y * 2 + 1;
    rows.push({ top, height, cells });
    top += height;
  };

  pushRow(HEADERS, true);
  const lines = doc.lines || [];
  lines.forEach((l, i) => pushRow(rowValues(l, i), false));

  const tableTop = rows.length ? rows[0].top : top;
  const tableBottom = top;

  // 页脚：二维码 100 高（含行内基线空隙）与右侧四行文字取大者，再加地址行与签字行
  const footH = QR_SIZE + IMG_LINE_GAP + 4 + LINE_18 + 10 + LINE_2;
  // 纸张最小 130mm；内容撑高时页脚紧接表格（CSS 的 space-between 在没有余量时就是紧贴）
  const height = Math.max(SHEET_MIN_HEIGHT, tableBottom + footH + PAD_Y);
  const footY = height - PAD_Y - footH;

  return { height, titleY, ruleY, metaY, tableTop, rows, footY, colX, colW };
}

/* ------------------------------------------------------------------ */
/* 绘制                                                               */
/* ------------------------------------------------------------------ */

function imagePath(src: string): Promise<string> {
  return new Promise((resolve) => {
    uni.getImageInfo({
      src,
      success: (res: any) => resolve(res?.path || src),
      fail: () => resolve(''),
    });
  });
}

function metaValue(doc: DocHead, key: string): string {
  const v = (doc as any)[key];
  return v === null || v === undefined ? '' : String(v);
}

function drawMeta(
  ctx: Ctx,
  layout: SheetLayout,
  x: number,
  width: number,
  rows: [string, string][],
): void {
  const labelW = rows.reduce((m, r) => Math.max(m, textWidth(ctx, r[0], BASE_FONT)), 0);
  rows.forEach((r, i) => {
    const y = layout.metaY + i * META_ROW_H;
    const textTop = y + (LINE_17 - BASE_FONT * 1.2) / 2;
    drawText(ctx, r[0], x, textTop, BASE_FONT);
    if (r[1]) drawText(ctx, r[1], x + labelW + 2, textTop, BASE_FONT);
    // 点线从值区开始，一直画到本列右边界（等价 CSS 的 border-bottom）
    dottedLine(ctx, x + labelW + 2, y + LINE_17 - 1, x + width);
  });
}

function drawTable(ctx: Ctx, layout: SheetLayout): void {
  const { rows, colX } = layout;
  if (!rows.length) return;

  const tableTop = rows[0].top;
  const last = rows[rows.length - 1];
  const tableBottom = last.top + last.height;

  // 竖线：整张表共用同一套列边界
  for (let k = 0; k < colX.length; k += 1) {
    fillRect(ctx, Math.round(colX[k]), Math.round(tableTop), 1, Math.round(tableBottom - tableTop));
  }
  // 横线：表头上下 + 每行底部
  fillRect(ctx, Math.round(colX[0]), Math.round(tableTop), Math.round(CONTENT_W), 1);
  for (const row of rows) {
    fillRect(ctx, Math.round(colX[0]), Math.round(row.top + row.height - 1), Math.round(CONTENT_W), 1);
  }

  // 文字
  rows.forEach((row, ri) => {
    const isHead = ri === 0;
    row.cells.forEach((cell, k) => {
      const innerLeft = colX[k] + CELL_PAD_X;
      const innerRight = colX[k + 1] - CELL_PAD_X;
      const x = cell.align === 'center' ? (colX[k] + colX[k + 1]) / 2 : cell.align === 'right' ? innerRight : innerLeft;
      cell.lines.forEach((text, li) => {
        if (!text) return;
        const y = row.top + CELL_PAD_Y + li * LINE_145 + (LINE_145 - BASE_FONT * 1.2) / 2;
        drawText(ctx, text, x, y, BASE_FONT, { bold: isHead, align: cell.align });
      });
    });
  });
}

function drawFooter(ctx: Ctx, doc: DocHead, layout: SheetLayout, qr1: any, qr2: any): void {
  const pageTotal = (doc.lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
  const paid = Number(doc.paidAmount || 0);

  const qrY = layout.footY;
  if (qr1) ctx.drawImage(qr1, PAD_X, qrY, QR_SIZE, QR_SIZE);
  if (qr2) ctx.drawImage(qr2, PAD_X + QR_SIZE, qrY, QR_SIZE, QR_SIZE);

  const textX = PAD_X + QR_SIZE * 2 + GAP;
  const lines: [string, string][] = [
    ['合计：', toChineseAmount(pageTotal)],
    ['页小计：', fmtMoney(pageTotal)],
    ['欠款金额：', fmtMoney(pageTotal - paid)],
    ['备注：', String(doc.remark || '')],
  ];
  lines.forEach(([label, value], i) => {
    const y = qrY + i * LINE_18 + (LINE_18 - BASE_FONT * 1.2) / 2;
    drawText(ctx, label, textX, y, BASE_FONT);
    const lw = textWidth(ctx, label, BASE_FONT);
    drawText(ctx, value, textX + lw, y, BASE_FONT, { bold: true });
  });

  // 收款账户 / 地址
  const lineY = qrY + QR_SIZE + IMG_LINE_GAP + 4;
  const y2 = lineY + (LINE_18 - BASE_FONT * 1.2) / 2;
  drawText(ctx, `收款账户：${COMPANY.bankAccount || '＿＿＿＿＿＿＿＿＿＿＿＿'}`, PAD_X, y2, BASE_FONT);
  drawText(ctx, `地址：${COMPANY.address}`, PAD_X + CONTENT_W, y2, BASE_FONT, { align: 'right' });

  // 签字行
  const signY = lineY + LINE_18 + 10 + (LINE_2 - BASE_FONT * 1.2) / 2;
  const colThird = CONTENT_W / 3;
  drawText(ctx, `制单人：${metaValue(doc, 'creatorName')}`, PAD_X, signY, BASE_FONT);
  drawText(ctx, `经手人：${metaValue(doc, 'handler')}`, PAD_X + colThird, signY, BASE_FONT);
  drawText(ctx, '客户签字：＿＿＿＿＿＿＿＿', PAD_X + colThird * 2, signY, BASE_FONT);
}

async function drawSheet(ctx: Ctx, doc: DocHead, layout: SheetLayout, qr1: any, qr2: any): Promise<void> {
  // 白底（否则导出会带透明背景）
  fillRect(ctx, 0, 0, SHEET_WIDTH_PX, layout.height, '#ffffff');

  const title = `${COMPANY.name}${doc.docTypeName || '销售单'}`;
  drawSpacedText(
    ctx,
    title,
    SHEET_WIDTH_PX / 2,
    layout.titleY + (TITLE_SIZE * 1.5 - TITLE_SIZE * 1.2) / 2,
    TITLE_SIZE,
    TITLE_SPACING,
  );

  // 标题下的双线
  fillRect(ctx, PAD_X, layout.ruleY, CONTENT_W, 2);
  fillRect(ctx, PAD_X, layout.ruleY + 4, CONTENT_W, 1);

  const metaColW = (CONTENT_W - GAP) / 2;
  drawMeta(ctx, layout, PAD_X, metaColW, [
    ['发货仓库：', metaValue(doc, 'warehouseName')],
    ['客户名称：', metaValue(doc, 'partnerName')],
    ['联系地址：', metaValue(doc, 'contactAddress')],
  ]);
  drawMeta(ctx, layout, PAD_X + metaColW + GAP, metaColW, [
    ['录单日期：', metaValue(doc, 'bizDate')],
    ['单据编号：', metaValue(doc, 'docNo')],
    ['联系电话：', metaValue(doc, 'contactPhone')],
    ['摘　　要：', metaValue(doc, 'summary')],
  ]);

  drawTable(ctx, layout);

  drawFooter(ctx, doc, layout, qr1, qr2);
}

/* ------------------------------------------------------------------ */
/* 画布适配                                                           */
/* ------------------------------------------------------------------ */

/** 微信小程序里才有全局 wx；H5 走旧版接口 */
function getWx(): any {
  return (globalThis as any).wx || null;
}

function canUse2dCanvas(): boolean {
  const wx = getWx();
  return !!(wx && typeof wx.canvasToTempFilePath === 'function' && wx.getSystemInfoSync);
}

/** 2D 上下文的字体只认通用族，把 "bold 21px 宋体..." 消毒成可用的写法 */
function sanitizeFont(spec: string): string {
  const bold = /\bbold\b/.test(spec) ? 'bold ' : '';
  const m = /(\d+(?:\.\d+)?)px/.exec(spec);
  const size = m ? Number(m[1]) : BASE_FONT;
  return `${bold}${size}px sans-serif`;
}

/**
 * 把标准 Canvas2D 上下文包成旧版 wx CanvasContext 的形状。
 * 这样上面所有绘图代码（setFillStyle / fillText / measureText ...）两种画布共用。
 */
function adapt2d(raw: Ctx): Ctx {
  const adapter: any = {
    setFillStyle(color: string) {
      raw.fillStyle = color;
    },
    setStrokeStyle(color: string) {
      raw.strokeStyle = color;
    },
    setLineWidth(width: number) {
      raw.lineWidth = width;
    },
    setFontSize(size: number) {
      raw.font = `${size}px sans-serif`;
    },
    setTextAlign(align: string) {
      raw.textAlign = align;
    },
    setTextBaseline(baseline: string) {
      raw.textBaseline = baseline;
    },
    setLineDash(dash: number[]) {
      raw.setLineDash(dash);
    },
    beginPath() {
      raw.beginPath();
    },
    moveTo(x: number, y: number) {
      raw.moveTo(x, y);
    },
    lineTo(x: number, y: number) {
      raw.lineTo(x, y);
    },
    stroke() {
      raw.stroke();
    },
    fillRect(x: number, y: number, w: number, h: number) {
      raw.fillRect(x, y, w, h);
    },
    fillText(text: string, x: number, y: number) {
      raw.fillText(text, x, y);
    },
    measureText(text: string) {
      try {
        return raw.measureText(text);
      } catch {
        return null;
      }
    },
    drawImage(img: any, x: number, y: number, w: number, h: number) {
      if (!img) return;
      raw.drawImage(img, x, y, w, h);
    },
    scale(x: number, y: number) {
      raw.scale(x, y);
    },
    save() {
      raw.save();
    },
    restore() {
      raw.restore();
    },
  };

  // setFont() 里用 'font' in ctx 探测能力，这里补一个可写属性
  Object.defineProperty(adapter, 'font', {
    get: () => raw.font,
    set: (value: string) => {
      raw.font = sanitizeFont(value);
    },
    configurable: true,
    enumerable: true,
  });

  return adapter;
}

/** 任何一步都不能让页面永久停在「正在生成」，超时就报错交给页面显示重试 */
function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** 取 2D canvas 节点（1.5s 拿不到就当旧版接口处理） */
function queryCanvasNode(canvasId: string): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (node: any) => {
      if (settled) return;
      settled = true;
      resolve(node || null);
    };
    setTimeout(() => done(null), 1500);
    try {
      const query: any = uni.createSelectorQuery();
      query
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((res: any[]) => done(res && res[0] ? res[0].node : null));
    } catch {
      done(null);
    }
  });
}

/** 2D canvas 的图片必须用 canvas.createImage() 加载，加载失败不影响其它内容 */
function loadImage(canvas: any, src: string): Promise<any> {
  return new Promise((resolve) => {
    if (!canvas || typeof canvas.createImage !== 'function') {
      resolve(null);
      return;
    }
    let settled = false;
    const done = (img: any) => {
      if (settled) return;
      settled = true;
      resolve(img);
    };
    try {
      const img = canvas.createImage();
      img.onload = () => done(img);
      img.onerror = () => done(null);
      img.src = src;
    } catch {
      done(null);
    }
    setTimeout(() => done(null), 3000);
  });
}

function export2dImage(canvas: any, width: number, height: number): Promise<string> {
  const wx = getWx();
  return new Promise<string>((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'png',
      success: (res: any) => resolve(res.tempFilePath),
      fail: (err: any) => reject(new Error(err?.errMsg || '导出图片失败')),
    });
  });
}

/* ------------------------------------------------------------------ */
/* 两条渲染通道                                                       */
/* ------------------------------------------------------------------ */

/** 新版 2D canvas：真机（微信 ≥2.9.0）推荐用法，不依赖离屏渲染的 draw 回调 */
async function render2dImage(
  canvas: any,
  doc: DocHead,
  canvasW: number,
  canvasH: number,
): Promise<PrintImageResult> {
  const rawFirst = canvas.getContext('2d');
  if (!rawFirst) throw new Error('画布初始化失败，请重试');
  const sizeCtx = adapt2d(rawFirst);
  const layout = measureSheet(sizeCtx, doc);

  const scale = Math.max(0.6, Math.min(1.5, canvasW / SHEET_WIDTH_PX, canvasH / layout.height));
  const width = Math.round(SHEET_WIDTH_PX * scale);
  const height = Math.round(layout.height * scale);

  // 改尺寸会重置上下文状态，所以先定尺寸再取一次上下文
  canvas.width = width;
  canvas.height = height;
  const ctx = adapt2d(canvas.getContext('2d'));
  ctx.scale(scale, scale);

  const [qr1, qr2] = await Promise.all([
    loadImage(canvas, '/static/qr.png'),
    loadImage(canvas, '/static/qr2.png'),
  ]);
  await drawSheet(ctx, doc, layout, qr1, qr2);

  const path = await withTimeout(export2dImage(canvas, width, height), 15000, '导出图片超时，请重试');
  return { path, width, height };
}

/** 旧版 createCanvasContext（H5 与老基础库） */
async function renderLegacyImage(
  canvasId: string,
  doc: DocHead,
  canvasW: number,
  canvasH: number,
): Promise<PrintImageResult> {
  const ctx: Ctx = uni.createCanvasContext(canvasId);
  const layout = measureSheet(ctx, doc);

  const scale = Math.max(0.6, Math.min(1.5, canvasW / SHEET_WIDTH_PX, canvasH / layout.height));
  const width = Math.round(SHEET_WIDTH_PX * scale);
  const height = Math.round(layout.height * scale);

  const [qr1, qr2] = await Promise.all([imagePath('/static/qr.png'), imagePath('/static/qr2.png')]);
  ctx.scale(scale, scale);
  await drawSheet(ctx, doc, layout, qr1, qr2);

  // 老接口的 draw 回调在离屏画布上可能不触发，最多等 2 秒就继续导出
  await withTimeout(
    new Promise<void>((resolve) => {
      ctx.draw(false, () => resolve());
    }),
    2000,
    'draw timeout',
  ).catch(() => undefined);

  const path = await withTimeout(
    new Promise<string>((resolve, reject) => {
      uni.canvasToTempFilePath({
        canvasId,
        x: 0,
        y: 0,
        width,
        height,
        destWidth: width,
        destHeight: height,
        fileType: 'png',
        success: (res: any) => resolve(res.tempFilePath),
        fail: (err: any) => reject(new Error(err?.errMsg || '导出图片失败')),
      } as any);
    }),
    15000,
    '导出图片超时，请重试',
  );

  return { path, width, height };
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                           */
/* ------------------------------------------------------------------ */

/**
 * 把单据画到指定 canvas 上并导出图片。
 *
 * @param canvasId 页面里 `<canvas id="print-canvas">` 的 id（小程序端用 type="2d"）
 * @param canvasW  画布可用宽（像素）
 * @param canvasH  画布可用高（像素）
 */
export async function renderDocImage(
  canvasId: string,
  doc: DocHead,
  canvasW: number,
  canvasH: number,
): Promise<PrintImageResult> {
  if (canUse2dCanvas()) {
    const node = await queryCanvasNode(canvasId);
    if (node && typeof node.getContext === 'function') {
      return render2dImage(node, doc, canvasW, canvasH);
    }
  }
  return renderLegacyImage(canvasId, doc, canvasW, canvasH);
}