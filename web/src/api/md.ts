import { http } from './client';

export interface Item {
  id: number;
  code: string;
  name: string;
  spec: string;
  barcode: string;
  baseUnitId: number;
  refCost: string;
  status: number;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageItems(params: { keyword?: string; page: number; pageSize: number }) {
  const qs = new URLSearchParams({
    keyword: params.keyword || '',
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  return http.get<PageResult<Item>>(`/api/md/items/page?${qs.toString()}`);
}

export function createItem(data: Partial<Item>) {
  return http.post<Item>('/api/md/items/create', data);
}

export function updateItem(id: number, data: Partial<Item>) {
  return http.post<Item>(`/api/md/items/update/${id}`, data);
}

export function deleteItem(id: number) {
  return http.post<{ id: number }>(`/api/md/items/delete/${id}`);
}

export interface BalanceRow {
  id: number;
  warehouseId: number;
  warehouseName: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  batchNo: string;
  qty: string;
  costAmount: string;
}

export function listBalance(params: { keyword?: string; warehouseId?: number }) {
  const qs = new URLSearchParams();
  if (params.keyword) qs.set('keyword', params.keyword);
  if (params.warehouseId) qs.set('warehouseId', String(params.warehouseId));
  return http.get<BalanceRow[]>(`/api/stock/balance?${qs.toString()}`);
}
