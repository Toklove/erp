import { Inject, Provide } from '@midwayjs/core';
import { InjectDataSource, InjectEntityModel } from '@midwayjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { amount, dec, price, qty } from '../common/money';
import { DocStatus } from '../shared/enums';
import { BizDoc, BizDocLine } from '../entity/biz.entity';
import { MdPartner } from '../entity/md.entity';
import { DocService, type DocInput, type DocLineInput } from './doc.service';
import { createMdCache, MasterDataService, MdCache, prefixOf } from './master-data.service';

/**
 * 管家婆数据导入。
 *
 * 现实约束：管家婆导出的三张表彼此只用「单据编号」关联，没有内部 id；
 * 单据表只有表头和金额，明细在「单据详情」表里，草稿表只有表头没有明细。
 * 所以导入不是「一行行塞进三张表」，而是：
 *   1) 先按单号把明细挂到表头上（同单号的多行合并成一张单据）
 *   2) 明细有单号但表头没有的，用明细里的日期/类型/仓库/摘要补一张表头
 *   3) 草稿表单独作为 status=0 的草稿导入
 *   4) 物料/往来单位/仓库/单据类型按名字解析，解析不到自动建档（可关闭）
 *   5) 历史单据默认只导入不冲库存（审核状态照抄，不自动过账）
 *
 * 幂等：按单据编号判重，mode=skip 跳过、mode=replace 覆盖（已过账的不覆盖）。
 */

export type ImportMode = 'skip' | 'replace';

export interface ImportOptions {
  mode?: ImportMode;
  /** 解析不到物料时自动建档，默认 true */
  autoCreateItems?: boolean;
  /** 解析不到往来单位时自动建档，默认 true */
  autoCreatePartners?: boolean;
  /** 解析不到单据类型时自动建档，默认 true */
  autoCreateDocTypes?: boolean;
  /** 是否连草稿表一起导入，默认 true */
  includeDrafts?: boolean;
  /** 明细行号重复时是否覆盖，默认 true */
  operatorId?: number;
  username?: string;
}

/** 归一化后的一张单据 */
export interface NormalizedDoc {
  docNo: string;
  docTypeName: string;
  docTypePrefix: string;
  bizDate: string;
  partnerName: string;
  warehouseName: string;
  summary: string;
  handler: string;
  creatorName: string;
  modifierName: string;
  department: string;
  status: number;
  printCount: number;
  auditedAt: Date | null;
  /** 表头金额（明细存在时以明细求和为准，这里仅作兜底与对账） */
  headAmount: string;
  source: 'doc' | 'draft' | 'line';
  lines: NormalizedLine[];
  raw: Record<string, unknown>;
}

export interface NormalizedLine {
  lineNo: number;
  itemName: string;
  itemSpec: string;
  itemColor: string;
  unitName: string;
  warehouseName: string;
  qty: string;
  price: string;
  amount: string;
  taxAmount: string;
  batchNo: string;
  summary: string;
  remark: string;
  raw: Record<string, unknown>;
}

export interface ImportPreview {
  mode: ImportMode;
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
  samples: Array<{
    docNo: string;
    docTypeName: string;
    bizDate: string;
    partnerName: string;
    lineCount: number;
    amount: string;
    action: 'create' | 'replace' | 'skip';
  }>;
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

const CN_DOC_FIELDS = {
  rowNo: '行号',
  date: '日期',
  docNo: '单据编号',
  docType: '单据类型',
  partner: '往来单位',
  amount: '金额',
  summary: '摘要',
  auditStatus: '审核状态',
  handler: '经办人',
  creator: '制单人',
  department: '部门',
  departmentFull: '部门全名',
  printCount: '打印次数',
  savedAt: '保存时间',
  auditedAt: '审核时间',
  modifier: '修改人',
  modifiedAt: '修改时间',
} as const;

const CN_LINE_FIELDS = {
  rowNo: '行号',
  date: '日期',
  docType: '单据类型',
  docNo: '单据编号',
  warehouse: '仓库全名',
  item: '存货全名',
  qty: '数量',
  amount: '金额',
  docSummary: '单据摘要',
  batchNo: '批号',
  expiry: '到期日期',
  lineSummary: '行摘要',
  partnerCode: '对方编码',
  partnerItemName: '对方存货名称',
  partnerSpec: '对方规格型号',
  creator: '制单人',
  baseUnit: '基本单位',
  auxQty1: '辅1数量',
  auditStatus: '审核状态',
  auxQty2: '辅2数量',
  taxInclusive: '含税金额',
  auxQty: '辅助数量',
  subUnitQty: '副单位数量',
} as const;

@Provide()
export class ImportService {
  @InjectDataSource()
  dataSource: DataSource;

  @InjectEntityModel(BizDoc)
  docRepo: Repository<BizDoc>;

  @Inject()
  docService: DocService;

  @Inject()
  masterData: MasterDataService;

  // ---------------------------------------------------------------
  // 解析
  // ---------------------------------------------------------------

  /**
   * 把管家婆导出的原始 JSON 归一化成待入库单据。
   * 支持三种输入形态：
   *  - { 单据: [...], 单据详情: [...], 草稿: [...] }
   *  - { docs: [...], lines: [...], drafts: [...] }
   *  - 直接一个单据对象或数组（只导表头）
   */
  normalize(payload: unknown, opts: ImportOptions = {}): NormalizedDoc[] {
    const p = (payload || {}) as Record<string, unknown>;
    const heads = firstArray(p, ['单据', '单据表', 'docs', 'doc', 'heads', 'bills']);
    const lines = firstArray(p, ['单据详情', '单据明细', '明细', 'lines', 'details', 'docLines']);
    const drafts = opts.includeDrafts === false
      ? []
      : firstArray(p, ['草稿', '草稿表', 'drafts', 'draft']);

    // 顶层直接是数组 / 单个对象
    if (!heads.length && !lines.length && !drafts.length) {
      if (Array.isArray(payload)) {
        heads.push(...(payload as unknown[]));
      } else if (isHeadLike(p)) {
        heads.push(p);
      }
    }

    const map = new Map<string, NormalizedDoc>();
    const errors: Array<{ index: number; docNo: string; message: string }> = [];
    this.errorsOfPreview = errors;

    heads.forEach((row, i) => {
      const head = this.mapHead(row, 'doc');
      if (!head.docNo) {
        errors.push({ index: i, docNo: '', message: `单据表第 ${i + 1} 行缺少「单据编号」` });
        return;
      }
      const prev = map.get(head.docNo);
      if (prev) {
        // 同单号出现两次：合并明细，表头保留第一条
        prev.lines.push(...head.lines);
        if (!prev.summary && head.summary) prev.summary = head.summary;
        return;
      }
      map.set(head.docNo, head);
    });

    drafts.forEach((row, i) => {
      const head = this.mapHead(row, 'draft');
      if (!head.docNo) {
        errors.push({ index: i, docNo: '', message: `草稿表第 ${i + 1} 行缺少「单据编号」` });
        return;
      }
      if (!map.has(head.docNo)) map.set(head.docNo, head);
    });

    lines.forEach((row, i) => {
      const line = this.mapLine(row, i + 1);
      const docNo = line.docNo;
      if (!docNo) {
        errors.push({ index: i, docNo: '', message: `明细表第 ${i + 1} 行缺少「单据编号」` });
        return;
      }
      let doc = map.get(docNo);
      if (!doc) {
        // 明细有单号但表头没导：用明细里的信息补一张表头
        doc = {
          docNo,
          docTypeName: line.docTypeName,
          docTypePrefix: prefixOf(docNo),
          bizDate: line.bizDate || today(),
          partnerName: '',
          warehouseName: line.warehouseName,
          summary: line.docSummary,
          handler: '',
          creatorName: line.creatorName,
          modifierName: line.creatorName,
          department: '',
          status: line.auditStatus,
          printCount: 0,
          auditedAt: null,
          headAmount: '0',
          source: 'line',
          lines: [],
          raw: {},
        };
        map.set(docNo, doc);
      }
      if (!doc.summary && line.docSummary) doc.summary = line.docSummary;
      if (!doc.warehouseName && line.warehouseName) doc.warehouseName = line.warehouseName;
      doc.lines.push(line.line);
    });

    // 明细行号重排，保证 (doc_id, line_no) 唯一
    for (const doc of map.values()) {
      doc.lines.forEach((l, idx) => {
        l.lineNo = idx + 1;
      });
    }
    return [...map.values()];
  }

  /** 上一轮 normalize 的解析错误，供 preview / execute 一起用 */
  private errorsOfPreview: Array<{ index: number; docNo: string; message: string }> = [];

  private mapHead(row: unknown, source: 'doc' | 'draft'): NormalizedDoc {
    const r = (row || {}) as Record<string, unknown>;
    const docNo = str(pick(r, CN_DOC_FIELDS.docNo, 'docNo', 'doc_no'));
    const docTypeName = str(pick(r, CN_DOC_FIELDS.docType, 'docTypeName', 'docType', 'doc_type'));
    return {
      docNo,
      docTypeName,
      docTypePrefix: prefixOf(docNo),
      bizDate: toDateStr(pick(r, CN_DOC_FIELDS.date, 'bizDate', 'biz_date', 'date')),
      partnerName: str(pick(r, CN_DOC_FIELDS.partner, 'partnerName', 'partner', 'partner_name')),
      warehouseName: str(pick(r, '仓库全名', 'warehouseName', 'warehouse')),
      summary: str(pick(r, CN_DOC_FIELDS.summary, 'summary')),
      handler: str(pick(r, CN_DOC_FIELDS.handler, 'handler')),
      creatorName: str(pick(r, CN_DOC_FIELDS.creator, 'creatorName', 'creator')),
      modifierName: str(pick(r, CN_DOC_FIELDS.modifier, 'modifierName', 'modifier')),
      department: str(pick(r, CN_DOC_FIELDS.departmentFull, CN_DOC_FIELDS.department, 'department')),
      status: auditStatusOf(pick(r, CN_DOC_FIELDS.auditStatus, 'auditStatus', 'status'), source),
      printCount: num(pick(r, CN_DOC_FIELDS.printCount, 'printCount', 'print_count')),
      auditedAt: toDateTime(pick(r, CN_DOC_FIELDS.auditedAt, 'auditedAt', 'audit_time')),
      headAmount: amountOf(pick(r, CN_DOC_FIELDS.amount, 'amount', 'totalAmount')),
      source,
      lines: [],
      raw: r,
    };
  }

  private mapLine(row: unknown, fallbackNo: number) {
    const r = (row || {}) as Record<string, unknown>;
    const docNo = str(pick(r, CN_LINE_FIELDS.docNo, 'docNo', 'doc_no'));
    const docTypeName = str(pick(r, CN_LINE_FIELDS.docType, 'docTypeName', 'docType'));
    const q = qty(dec(num(pick(r, CN_LINE_FIELDS.qty, 'qty', '数量'))));
    const amt = amount(dec(num(pick(r, CN_LINE_FIELDS.amount, 'amount', '金额'))));
    const unitPrice =
      dec(q).isZero() ? '0.000000' : price(dec(amt).div(dec(q)));

    const line: NormalizedLine = {
      lineNo: num(pick(r, CN_LINE_FIELDS.rowNo, 'lineNo', 'line_no')) || fallbackNo,
      itemName: str(pick(r, CN_LINE_FIELDS.item, 'itemName', 'item', '存货名称')).slice(0, 128),
      itemSpec: str(pick(r, CN_LINE_FIELDS.partnerSpec, 'itemSpec', 'spec', '规格')).slice(0, 255),
      itemColor: str(pick(r, '颜色', 'itemColor', 'color')).slice(0, 64),
      unitName: str(pick(r, CN_LINE_FIELDS.baseUnit, 'unitName', 'unit', '单位')).slice(0, 32),
      warehouseName: str(pick(r, CN_LINE_FIELDS.warehouse, 'warehouseName', 'warehouse')),
      qty: q,
      price: unitPrice,
      amount: amt,
      taxAmount: amount(dec(num(pick(r, CN_LINE_FIELDS.taxInclusive, 'taxAmount', '含税金额')) || amt)),
      batchNo: str(pick(r, CN_LINE_FIELDS.batchNo, 'batchNo')).slice(0, 64),
      summary: str(pick(r, CN_LINE_FIELDS.lineSummary, 'lineSummary', '行摘要')).slice(0, 255),
      remark: str(pick(r, '备注', 'remark')).slice(0, 255),
      raw: r,
    };

    return {
      docNo,
      docTypeName,
      bizDate: toDateStr(pick(r, CN_LINE_FIELDS.date, 'bizDate', 'date')),
      warehouseName: line.warehouseName,
      docSummary: str(pick(r, CN_LINE_FIELDS.docSummary, 'docSummary', '单据摘要')).slice(0, 255),
      creatorName: str(pick(r, CN_LINE_FIELDS.creator, 'creatorName', 'creator')),
      auditStatus: auditStatusOf(pick(r, CN_LINE_FIELDS.auditStatus, 'auditStatus', 'status'), 'line'),
      line,
    };
  }

  // ---------------------------------------------------------------
  // 预览（不写库）
  // ---------------------------------------------------------------

  async preview(payload: unknown, opts: ImportOptions = {}): Promise<ImportPreview> {
    const docs = this.normalize(payload, opts);
    const mode: ImportMode = opts.mode === 'replace' ? 'replace' : 'skip';
    const autoItems = opts.autoCreateItems !== false;
    const autoPartners = opts.autoCreatePartners !== false;
    const autoTypes = opts.autoCreateDocTypes !== false;

    const cache = createMdCache();
    const existing = await this.docService.existingDocNos(docs.map(d => d.docNo));
    const existingStatus = await this.statusOfDocs([...existing]);

    const itemsMatched = new Set<string>();
    const itemsToCreate = new Set<string>();
    const partnersMatched = new Set<string>();
    const partnersToCreate = new Set<string>();
    const warehousesMatched = new Set<string>();
    const warehousesMissing = new Set<string>();
    const docTypesMatched = new Set<string>();
    const docTypesToCreate = new Set<string>();

    let docsNew = 0;
    let docsSkipExisting = 0;
    const samples: ImportPreview['samples'] = [];

    for (const doc of docs) {
      // 单据类型
      const type = await this.masterData
        .resolveDocType(
          { name: doc.docTypeName, prefix: doc.docTypePrefix },
          { autoCreate: false },
          cache
        )
        .catch(() => null);
      if (type) docTypesMatched.add(`${type.name}(${type.code})`);
      else if (autoTypes) docTypesToCreate.add(doc.docTypeName || doc.docTypePrefix || '未知类型');

      // 往来单位
      if (doc.partnerName) {
        const p = await this.masterData.findPartner(doc.partnerName, cache);
        if (p) partnersMatched.add(p.name);
        else if (autoPartners) partnersToCreate.add(doc.partnerName);
      }

      // 仓库
      if (doc.warehouseName) {
        const w = await this.masterData.resolveWarehouse(doc.warehouseName, cache);
        if (w) warehousesMatched.add(`${w.name}(${w.code})`);
        else warehousesMissing.add(doc.warehouseName);
      }

      // 物料
      for (const line of doc.lines) {
        if (!line.itemName) continue;
        const item = await this.masterData.findItem(line.itemName, cache);
        if (item) itemsMatched.add(item.name);
        else if (autoItems) itemsToCreate.add(line.itemName);
      }

      // 判重
      let action: 'create' | 'replace' | 'skip' = 'create';
      if (existing.has(doc.docNo)) {
        const st = existingStatus.get(doc.docNo);
        if (mode === 'replace' && st !== DocStatus.POSTED) action = 'replace';
        else action = 'skip';
        if (action === 'skip') docsSkipExisting++;
      }
      if (action !== 'skip') docsNew++;

      if (samples.length < 20) {
        samples.push({
          docNo: doc.docNo,
          docTypeName: doc.docTypeName,
          bizDate: doc.bizDate,
          partnerName: doc.partnerName,
          lineCount: doc.lines.length,
          amount: doc.lines.length
            ? doc.lines.reduce((s, l) => s.plus(dec(l.amount)), dec(0)).toFixed(4)
            : doc.headAmount,
          action,
        });
      }
    }

    return {
      mode,
      docsTotal: docs.length,
      docsNew,
      docsSkipExisting,
      docsSkipError: this.errorsOfPreview.length,
      linesTotal: docs.reduce((s, d) => s + d.lines.length, 0),
      draftsTotal: docs.filter(d => d.source === 'draft').length,
      itemsMatched: [...itemsMatched].sort(),
      itemsToCreate: [...itemsToCreate].sort(),
      partnersMatched: [...partnersMatched].sort(),
      partnersToCreate: [...partnersToCreate].sort(),
      warehousesMatched: [...warehousesMatched].sort(),
      warehousesMissing: [...warehousesMissing].sort(),
      docTypesMatched: [...docTypesMatched].sort(),
      docTypesToCreate: [...docTypesToCreate].sort(),
      samples,
      errors: this.errorsOfPreview.slice(0, 50),
    };
  }

  // ---------------------------------------------------------------
  // 执行
  // ---------------------------------------------------------------

  async execute(payload: unknown, opts: ImportOptions = {}): Promise<ImportResult> {
    const docs = this.normalize(payload, opts);
    const mode: ImportMode = opts.mode === 'replace' ? 'replace' : 'skip';
    const username = opts.username || 'import';
    const operatorId = Number(opts.operatorId) || 0;
    const op = { uid: operatorId, username };

    const cache = createMdCache();
    const result: ImportResult = {
      created: 0,
      replaced: 0,
      skipped: 0,
      failed: 0,
      lines: 0,
      createdItems: [],
      createdPartners: [],
      createdDocTypes: [],
      errors: this.errorsOfPreview.map(e => ({ docNo: e.docNo || `第 ${e.index + 1} 行`, message: e.message })),
    };

    for (const doc of docs) {
      try {
        const existing = await this.docRepo.findOne({ where: { docNo: doc.docNo } });
        if (existing) {
          if (mode !== 'replace') {
            result.skipped++;
            continue;
          }
          if (existing.status === DocStatus.POSTED) {
            result.skipped++;
            result.errors.push({ docNo: doc.docNo, message: '已过账单据不覆盖，已跳过' });
            continue;
          }
          await this.dataSource.transaction(async m => {
            await m.delete(BizDocLine, { docId: existing.id });
            await m.delete(BizDoc, existing.id);
          });
        }

        const created = { items: [] as string[], partners: [] as string[], docTypes: [] as string[] };

        await this.dataSource.transaction(async manager => {
          const input = await this.toDocInput(manager, doc, opts, cache, created);
          await this.docService.createInTx(manager, input, op, {
            allowEmptyLines: true,
            docNo: doc.docNo,
            status: doc.status,
            creatorName: doc.creatorName || username,
            modifierName: doc.modifierName || doc.creatorName || username,
            totalAmount: doc.lines.length ? undefined : doc.headAmount,
            printCount: doc.printCount,
            auditedAt: doc.auditedAt,
            operatorId,
            cache,
            ext: { gjp: doc.raw },
          });
        });

        result.createdItems.push(...created.items);
        result.createdPartners.push(...created.partners);
        result.createdDocTypes.push(...created.docTypes);

        if (existing) result.replaced++;
        else result.created++;
        result.lines += doc.lines.length;
      } catch (e) {
        result.failed++;
        result.errors.push({ docNo: doc.docNo, message: (e as Error).message });
      }
    }

    result.createdItems = [...new Set(result.createdItems)];
    result.createdPartners = [...new Set(result.createdPartners)];
    result.createdDocTypes = [...new Set(result.createdDocTypes)];
    return result;
  }

  /** 把归一化单据转成 DocService 的入参（同时把物料/单位/往来单位解析成 id） */
  private async toDocInput(
    _manager: EntityManager,
    doc: NormalizedDoc,
    opts: ImportOptions,
    cache: MdCache,
    created: { items: string[]; partners: string[]; docTypes: string[] }
  ): Promise<DocInput> {
    const hasType = await this.masterData
      .resolveDocType({ name: doc.docTypeName, prefix: doc.docTypePrefix }, { autoCreate: false }, cache)
      .catch(() => null);
    const type = hasType
      ? hasType
      : await this.masterData.resolveDocType(
          { name: doc.docTypeName, prefix: doc.docTypePrefix },
          { autoCreate: opts.autoCreateDocTypes !== false },
          cache
        );
    if (!hasType) created.docTypes.push(type.name);

    const warehouse = await this.masterData.resolveWarehouse(doc.warehouseName, cache);
    const partnerType = Number(type.stockDir) < 0 ? 1 : Number(type.stockDir) > 0 ? 2 : 3;
    const partnerHit = doc.partnerName
      ? await this.masterData.resolvePartner(
          doc.partnerName,
          { autoCreate: opts.autoCreatePartners !== false, partnerType },
          cache
        )
      : { partner: null as MdPartner | null, created: false };
    if (partnerHit.created && partnerHit.partner) created.partners.push(partnerHit.partner.name);

    const lines: DocLineInput[] = [];
    for (const line of doc.lines) {
      const unit = await this.masterData.resolveUnit(line.unitName, cache);
      let itemId = 0;
      let unitId = unit?.id || 0;
      if (line.itemName) {
        const found = await this.masterData.resolveItem(
          line.itemName,
          {
            autoCreate: opts.autoCreateItems !== false,
            spec: line.itemSpec,
            unitName: line.unitName,
            operatorId: opts.operatorId || 0,
          },
          cache
        );
        if (found.item) {
          itemId = found.item.id;
          unitId = unitId || found.item.baseUnitId || 0;
          if (found.created) created.items.push(found.item.name);
        }
      }
      lines.push({
        itemId,
        itemName: line.itemName,
        itemSpec: line.itemSpec,
        itemColor: line.itemColor,
        unitId,
        unitName: line.unitName || unit?.name || '',
        qty: line.qty,
        price: line.price,
        amount: line.amount,
        warehouseId: warehouse?.id || 0,
        batchNo: line.batchNo,
        remark: line.remark,
        summary: line.summary,
      });
    }

    return {
      docTypeCode: type.code,
      docTypeName: type.name,
      docTypePrefix: type.prefix,
      bizDate: doc.bizDate || today(),
      partnerId: partnerHit.partner?.id || 0,
      partnerName: doc.partnerName,
      contactPhone: partnerHit.partner?.phone || '',
      contactAddress: partnerHit.partner?.address || '',
      warehouseId: warehouse?.id || 0,
      warehouseName: warehouse?.name || doc.warehouseName,
      summary: doc.summary,
      handler: doc.handler,
      department: doc.department,
      remark: '',
      paidAmount: 0,
      lines,
    };
  }

  // -----------------------------------------------------------
  // 判重辅助
  // -----------------------------------------------------------

  private async statusOfDocs(nos: string[]): Promise<Map<string, number>> {
    if (!nos.length) return new Map();
    const rows = await this.docRepo.find({
      where: nos.map(docNo => ({ docNo })),
      select: { id: true, docNo: true, status: true },
    });
    return new Map(rows.map(r => [r.docNo, Number(r.status)]));
  }
}

// ---------------------------------------------------------------
// 纯函数工具
// ---------------------------------------------------------------

function firstArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
  }
  return [];
}

function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u3000/g, ' ').trim();
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function amountOf(v: unknown): string {
  return amount(dec(num(v)));
}

/** 「2022-12-07 00:00:00」「2022-12-08T00:00:00」「2022/12/07」→ 2022-12-07 */
function toDateStr(v: unknown): string {
  if (!v) return '';
  const s = String(v).trim();
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function toDateTime(v: unknown): Date | null {
  if (!v) return null;
  const s = String(v).trim().replace('T', ' ');
  const d = new Date(s.replace(/-/g, '/'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 管家婆的审核状态是中文；草稿表没有这个字段，按草稿处理 */
function auditStatusOf(v: unknown, source: 'doc' | 'draft' | 'line'): number {
  const s = str(v);
  if (!s) return source === 'draft' ? DocStatus.DRAFT : DocStatus.AUDITED;
  if (s.includes('已审核') || s === '审核' || s === '1' || s === 'true') return DocStatus.AUDITED;
  if (s.includes('未审核') || s.includes('待审核') || s === '0' || s === 'false') return DocStatus.DRAFT;
  if (s.includes('作废')) return DocStatus.VOID;
  return DocStatus.AUDITED;
}

function isHeadLike(v: unknown): boolean {
  const r = (v || {}) as Record<string, unknown>;
  return Boolean(r[CN_DOC_FIELDS.docNo] || r.docNo);
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

