import Decimal from 'decimal.js';

// 统一精度，避免各处 round 规则不一致
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const QTY_SCALE = 4;
export const AMOUNT_SCALE = 4;
export const PRICE_SCALE = 6;

type Numeric = string | number | Decimal | null | undefined;

/** 任意输入转 Decimal，非法输入抛错而不是静默变 0 */
export function dec(value: Numeric): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  const d = new Decimal(value as Decimal.Value);
  if (!d.isFinite()) throw new Error(`非法数值: ${value}`);
  return d;
}

/** 数量/金额统一保留 4 位，返回字符串（直接写库） */
export function qty(value: Numeric): string {
  return dec(value).toFixed(QTY_SCALE);
}

export function amount(value: Numeric): string {
  return dec(value).toFixed(AMOUNT_SCALE);
}

export function price(value: Numeric): string {
  return dec(value).toFixed(PRICE_SCALE);
}

/**
 * 移动加权平均单价 = 结存金额 / 结存数量
 * 数量为 0 时返回 0，由调用方决定"按参考成本"还是"报错"
 */
export function avgCost(costAmount: Numeric, qtyOnHand: Numeric): string {
  const q = dec(qtyOnHand);
  if (q.isZero()) return price(0);
  return price(dec(costAmount).div(q));
}
