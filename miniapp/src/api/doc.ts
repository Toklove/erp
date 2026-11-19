import { http } from './client';

export interface DocLine {
  id?: number;
  lineNo?: number;
  itemId?: number;
  itemName?: string;
  itemSpec?: string;
  itemColor?: string;
  unitId?: number;
  unitName?: string;
  qty?: number;
  baseQty?: number;
  price?: number;
  amount?: number;
  warehouseId?: number;
  batchNo?: string;
  remark?: string;
  summary?: string;
}

export interface DocHead {
  id?: number;
  docNo?: string;
  docTypeCode?: string;
  docTypeName?: string;
  docType?: number;
  bizDate?: string;
  partnerId?: number;
  partnerName?: string;
  contactPhone?: string;
  contactAddress?: string;
  warehouseId?: number;
  warehouseName?: string;
  toWarehouseId?: number;
  /** 0 草稿 / 1 已审核 / 2 已过账 / 9 已作废 */
  status?: number;
  totalQty?: number;
  totalAmount?: number;
  paidAmount?: number;
  summary?: string;
  handler?: string;
  creatorName?: string;
  modifierName?: string;
  department?: string;
  printCount?: number;
  remark?: string;
  auditedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  /** 详情接口额外返回：该单据类型是否影响库存（决定能否过账） */
  needPost?: number;
  lines?: DocLine[];
}

export interface DocTypeOption {
  code: string;
  name: string;
  prefix: string;
  stockDir: number;
  needPost: number;
}

export interface DocPageQuery {
  keyword?: string;
  docType?: string;
  status?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AutocompleteItem {
  value: string;
  cnt: string;
}

export interface ItemHint {
  itemName: string;
  itemSpec: string;
  itemColor: string;
  unitName: string;
  price: number | string;
}

function qs(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  });
  return parts.join('&');
}

export const docApi = {
  types: () => http.get<DocTypeOption[]>('/api/doc/types'),

  page: (q: DocPageQuery) => http.get<PageResult<DocHead>>(`/api/doc/page?${qs(q as Record<string, unknown>)}`),

  detail: (id: number) => http.get<DocHead>(`/api/doc/detail/${id}`),

  create: (body: DocHead) => http.post<{ id: number; docNo: string }>('/api/doc/create', body),

  update: (id: number, body: DocHead) => http.post<{ id: number }>(`/api/doc/update/${id}`, body),

  remove: (id: number) => http.post(`/api/doc/delete/${id}`),

  audit: (id: number) => http.post<{ status: number }>(`/api/doc/audit/${id}`),

  void: (id: number) => http.post(`/api/doc/void/${id}`),

  post: (id: number) => http.post(`/api/doc/post/${id}`),

  printed: (id: number) => http.post<{ printCount: number }>(`/api/doc/printed/${id}`),

  autocomplete: (field: string, keyword = '') =>
    http.get<AutocompleteItem[]>(
      `/api/doc/autocomplete?field=${encodeURIComponent(field)}&keyword=${encodeURIComponent(keyword)}`,
    ),

  itemHint: (name: string) => http.get<ItemHint | null>(`/api/doc/item-hint?name=${encodeURIComponent(name)}`),
};

export interface WarehouseOption {
  id: number;
  code: string;
  name: string;
}

export interface UnitOption {
  id: number;
  code: string;
  name: string;
}

export interface PartnerOption {
  id: number;
  code: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
}

export const mdApi = {
  warehouses: () => http.get<WarehouseOption[]>('/api/md/warehouses'),
  units: () => http.get<UnitOption[]>('/api/md/units'),
  partners: (keyword = '') => http.get<PartnerOption[]>(`/api/md/partners?keyword=${encodeURIComponent(keyword)}`),
};
