/** 金额与单据状态的小工具（与 web/src/utils/cn-money.ts 保持一致） */

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const SMALL_UNITS = ['', '拾', '佰', '仟'];
const BIG_UNITS = ['', '万', '亿', '万亿'];

/** 四位以内的整数转大写，如 2200 -> 贰仟贰佰 */
function fourToCn(num: number): string {
  let s = '';
  let zero = false;
  for (let i = 3; i >= 0; i--) {
    const d = Math.floor(num / 10 ** i) % 10;
    if (d === 0) {
      zero = true;
    } else {
      if (zero && s) s += DIGITS[0];
      zero = false;
      s += DIGITS[d] + SMALL_UNITS[i];
    }
  }
  return s;
}

/** 人民币金额转中文大写，如 2200 -> 贰仟贰佰元整 */
export function toChineseAmount(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '零元整';

  const negative = n < 0;
  const cents = Math.round(Math.abs(n) * 100);
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;
  const sign = negative ? '负' : '';

  // 整数部分：按四位分组（万 / 亿）
  let intPart = '';
  if (yuan > 0) {
    const groups: string[] = [];
    let rest = yuan;
    let groupIndex = 0;
    while (rest > 0) {
      const g = rest % 10000;
      rest = Math.floor(rest / 10000);
      if (g > 0) {
        groups.unshift(fourToCn(g) + BIG_UNITS[groupIndex]);
      } else if (groups.length > 0) {
        // 中间整组为零：补一个「零」，如 100000001 -> 壹亿零壹
        groups.unshift('零');
      }
      groupIndex += 1;
    }
    intPart = groups.join('').replace(/零+/g, '零').replace(/^零|零$/g, '');
  }

  const intCn = intPart ? `${intPart}元` : '';

  if (jiao === 0 && fen === 0) {
    return `${sign}${intCn || '零元'}整`;
  }

  let decimal = '';
  if (intPart && jiao === 0 && fen > 0) decimal += '零';
  if (jiao > 0) decimal += `${DIGITS[jiao]}角`;
  if (fen > 0) decimal += `${DIGITS[fen]}分`;

  return `${sign}${intCn}${decimal}`;
}

/** 金额显示：保留 2 位，千分位 */
export function fmtMoney(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0.00';
  const fixed = Math.abs(n).toFixed(2);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/(\d)(?=(\d{3})+$)/g, '$1,');
  return `${n < 0 ? '-' : ''}${grouped}.${dec}`;
}

/** 数量显示：保留 2 位（后端是 decimal，可能是字符串） */
export function fmtQty(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export interface StatusMeta {
  key: 'draft' | 'audited' | 'posted' | 'void';
  text: string;
}

const STATUS_MAP: Record<number, StatusMeta> = {
  0: { key: 'draft', text: '草稿' },
  1: { key: 'audited', text: '已审核' },
  2: { key: 'posted', text: '已过账' },
  9: { key: 'void', text: '已作废' },
};

export function statusOf(status: number | string | null | undefined): StatusMeta {
  return STATUS_MAP[Number(status ?? 0)] || { key: 'draft', text: String(status) };
}

/** 状态筛选项（与 web 端 DocListPage 的 STATUS 一致） */
export const STATUS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '草稿' },
  { value: 1, label: '已审核' },
  { value: 2, label: '已过账' },
  { value: 9, label: '已作废' },
];

/** 今天，格式 YYYY-MM-DD */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 金额行小计：四舍五入到 4 位，避免浮点误差累积 */
export function amountOf(qty: number, price: number): number {
  return Math.round((Number(qty) || 0) * (Number(price) || 0) * 10000) / 10000;
}
