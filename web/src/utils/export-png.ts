/**
 * 把打印用的单据 DOM 截成 PNG 并下载。
 *
 * 为什么要在离屏副本上截，而不是直接截屏幕上那个元素：
 * 手机上预览时 .print-sheet 会被 transform: scale(n) 等比缩小（见 DocPrintPage），
 * 直接截取只会得到一张缩小版、还带着 position: absolute 的定位。
 * 所以这里复制一份、清掉根节点的内联样式，让它按纸张原始 225mm 重新排版，
 * 截出来的才是真实打印尺寸的画面。
 */

/** 默认放大倍数：225mm（约 850 CSS px）放大 3 倍约等于 290dpi，够针式打印 */
const EXPORT_SCALE = 3;

/** 单边像素上限，明细特别多时按比例降倍数，避免把手机内存打爆 */
const MAX_EXPORT_SIDE = 6000;

/** Windows 文件名禁用字符（\ / : * ? " < > |），另外去掉换行和制表符 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\r\n\t]/g;

/** 拼一个安全的 PNG 文件名：销售单-XS20261119001.png */
export function pngFileName(...parts: (string | number | null | undefined)[]): string {
  const name = parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
    .join('-')
    .replace(ILLEGAL_FILENAME_CHARS, '_')
    .trim();
  return `${name || '单据'}.png`;
}

export interface ExportPngResult {
  width: number;
  height: number;
  size: number;
  fileName: string;
}

export interface ExportPngOptions {
  /** 放大倍数，默认 3（约 290dpi），会受 MAX_EXPORT_SIDE 限制自动下调 */
  scale?: number;
  /** 画布底色，默认白（纸张是白的，透明底打印会变黑） */
  backgroundColor?: string;
}

/** 等副本里的图片加载完，否则截出来二维码是空白 */
function waitForImages(root: HTMLElement): Promise<void> {
  const pending = Array.from(root.querySelectorAll('img')).map((img) =>
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        }),
  );
  return Promise.all(pending).then(() => undefined);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('生成 PNG 失败：canvas 转 blob 返回空'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 在部分浏览器上会让下载中断，留点时间再回收
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 把元素渲染成 PNG 并触发下载。
 *
 * @param source 要导出的元素（通常是 .print-sheet）
 * @param fileName 下载的文件名，建议用 pngFileName() 生成，会补上 .png
 */
export async function exportElementToPng(
  source: HTMLElement,
  fileName: string,
  options: ExportPngOptions = {},
): Promise<ExportPngResult> {
  // 离屏舞台：移出可视区但仍正常参与布局，html2canvas 需要真实尺寸
  const stage = document.createElement('div');
  stage.className = 'png-export-stage';
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('style'); // 去掉预览缩放用的 transform / position
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    // 字体和图片就绪后再截，否则可能出现宋体回退、二维码空白
    await document.fonts?.ready;
    await waitForImages(clone);

    const width = Math.ceil(clone.offsetWidth);
    const height = Math.ceil(clone.offsetHeight);
    if (width <= 0 || height <= 0) throw new Error('单据内容为空，无法导出');

    const requested = options.scale ?? EXPORT_SCALE;
    const scale = Math.min(requested, Math.max(1, MAX_EXPORT_SIDE / Math.max(width, height)));

    // 按需加载：html2canvas 体积不小，不放进首页 chunk
    const { default: html2canvas } = await import('html2canvas-pro');
    const canvas = await html2canvas(clone, {
      scale,
      backgroundColor: options.backgroundColor ?? '#ffffff',
      useCORS: true,
      logging: false,
      // 让克隆 iframe 按纸张宽度排版，避免把移动端的媒体查询带进来
      windowWidth: Math.max(width, 1024),
      windowHeight: Math.max(height, 768),
    });

    const blob = await canvasToBlob(canvas);
    const name = fileName.toLowerCase().endsWith('.png') ? fileName : pngFileName(fileName);
    downloadBlob(blob, name);
    return { width: canvas.width, height: canvas.height, size: blob.size, fileName: name };
  } finally {
    stage.remove();
  }
}
