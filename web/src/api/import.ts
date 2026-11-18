import { http } from './client';

/** 管家婆三张表的原始数据（结构见 /api/import/help） */
export type GjpPayload = unknown;

export interface ImportOptions {
  mode?: 'skip' | 'replace';
  autoCreateItems?: boolean;
  autoCreatePartners?: boolean;
  autoCreateDocTypes?: boolean;
  includeDrafts?: boolean;
}

export interface ImportSample {
  docNo: string;
  docTypeName: string;
  bizDate: string;
  partnerName: string;
  lineCount: number;
  amount: string;
  action: 'create' | 'replace' | 'skip';
}

export interface ImportPreview {
  mode: 'skip' | 'replace';
  docsTotal: number;
  docsNew: number;
  docsSkipExisting: number;
  docsSkipError: number;
  linesTotal: number;
  draftsTotal: number;
  itemsMatched: string[];
  itemsToCreate: string[];
  partnersMatched: string[];
  partnersToCreate: string[];
  warehousesMatched: string[];
  warehousesMissing: string[];
  docTypesMatched: string[];
  docTypesToCreate: string[];
  samples: ImportSample[];
  errors: Array<{ index: number; docNo: string; message: string }>;
}

export interface ImportResult {
  created: number;
  replaced: number;
  skipped: number;
  failed: number;
  lines: number;
  createdItems: string[];
  createdPartners: string[];
  createdDocTypes: string[];
  errors: Array<{ docNo: string; message: string }>;
}

export interface ImportHelp {
  format: Record<string, string>;
  options: Record<string, string>;
  note: string;
}

export const importApi = {
  help: () => http.get<ImportHelp>('/api/import/help'),
  preview: (payload: GjpPayload, opts: ImportOptions) =>
    http.post<ImportPreview>('/api/import/preview', { payload, ...opts }),
  execute: (payload: GjpPayload, opts: ImportOptions) =>
    http.post<ImportResult>('/api/import/execute', { payload, ...opts }),
};
