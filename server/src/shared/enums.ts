/**
 * 前后端共享的业务枚举。
 * 前端通过 Vite alias `@shared` 指向本目录，避免两边各写一份枚举。
 */

/** 单据类型 */
export const DocType = {
  PURCHASE_IN: 101, // 采购入库
  PURCHASE_RETURN: 102, // 采购退货
  SALES_OUT: 201, // 销售出库
  SALES_RETURN: 202, // 销售退货
  TRANSFER: 301, // 调拨
  STOCKTAKE: 401, // 盘点
  OTHER_IN: 501, // 其他入库
  OTHER_OUT: 502, // 其他出库
  OPENING: 601, // 期初
} as const;

export type DocTypeValue = (typeof DocType)[keyof typeof DocType];

/** 单据状态 */
export const DocStatus = {
  DRAFT: 0, // 草稿
  AUDITED: 1, // 已审核（可过账）
  POSTED: 2, // 已过账（已动库存）
  VOID: 9, // 作废
} as const;

/** 出库方向：这些单据类型会减少库存 */
export const OUTBOUND_DOC_TYPES: number[] = [
  DocType.SALES_OUT,
  DocType.PURCHASE_RETURN,
  DocType.OTHER_OUT,
];

/** 是否出库单据 */
export function isOutbound(docType: number): boolean {
  return OUTBOUND_DOC_TYPES.includes(docType);
}

/** 库存流水方向 */
export const LedgerDirection = {
  IN: 1,
  OUT: -1,
} as const;

/** 往来单位类型 */
export const PartnerType = {
  CUSTOMER: 1,
  SUPPLIER: 2,
  BOTH: 3,
} as const;

/** 金额/数量精度：与数据库 DECIMAL 定义保持一致 */
export const PRECISION = {
  QTY: 4,
  AMOUNT: 4,
  PRICE: 6,
  RATE: 4,
} as const;
