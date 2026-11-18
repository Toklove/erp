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
  const abs = Math.abs(n);
  // 四舍五入到分
  const cents = Math.round(abs * 100);
  const yuan = Math.floor(cents / 100);
  const jiao = Math.floor((cents % 100) / 10);
  const fen = cents % 10;

  let intPart = '';
  if (yuan === 0) {
    intPart = '';
  } else {
    let groupIndex = 0;
    let rest = yuan;
    const groups: string[] = [];
    while (rest > 0) {
      const g = rest % 10000;
      rest = Math.floor(rest / 10000);
      if (g > 0) {
        groups.unshift(fourToCn(g) + BIG_UNITS[groupIndex]);
      } else if (groups.length) {
        // 整组为零且后面还有数字，补一个零
        groups.unshift('零');
        groups.shift();
      }
      groupIndex++;
    }
    intPart = groups.join('').replace(/零+/g, '零').replace(/^零/, '');
  }

  let result = '';
  if (intPart) result += intPart + '元';

  if (jiao === 0 && fen === 0) {
    if (!intPart) return negative ? '零元整' : '零元整';
    return (negative ? '负' : '') + result + '整';
  }

  const jiaoCn = jiao === 0 ? '零' : DIGITS[jiao] + '角';
  const fenCn = fen === 0 ? '' : DIGITS[fen] + '分';
  const body = `${intPart}元${jiaoCn}${fenCn}`.replace(/零分$/, '整');
  return (negative ? '负' : '') + body;
}

/** 金额显示：保留 2 位，千分位 */
export function fmtMoney(v: number | string | null | undefined): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
