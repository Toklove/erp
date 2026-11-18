import { Inject, Provide } from '@midwayjs/core';
import { InjectDataSource, InjectEntityModel } from '@midwayjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { BizError } from '../common/biz-error';
import { amount, dec, qty } from '../common/money';
import { DocStatus } from '../shared/enums';
import { BizDoc, BizDocLine, SysDocType } from '../entity/biz.entity';
import { MdItem } from '../entity/md.entity';
import { SysDocSeq, SysUser } from '../entity/sys.entity';
import { createMdCache, MasterDataService, MdCache } from './master-data.service';

/** 前端提交的明细行 */
export interface DocLineInput {
  id?: number;
  lineNo?: number;
  itemId?: number;
  itemName?: string;
  itemSpec?: string;
  itemColor?: string;
  unitId?: number;
  unitName?: string;
  qty?: number | string;
  price?: number | string;
  amount?: number | string;
  warehouseId?: number;
  batchNo?: string;
  remark?: string;
  summary?: string;
}

/** 前端提交的单据 */
export interface DocInput {
  docTypeCode?: string;
  docTypeName?: string;
  docTypePrefix?: string;
  bizDate: string;
  partnerId?: number;
  partnerName?: string;
  contactPhone?: string;
  contactAddress?: string;
  warehouseId?: number;
  warehouseName?: string;
  toWarehouseId?: number;
  handler?: string;
  department?: string;
  summary?: string;
  remark?: string;
  paidAmount?: number | string;
  lines: DocLineInput[];
}

/** 导入等内部路径用的扩展选项 */
export interface DocCreateOptions {
  /** 允许 0 行明细（管家婆「草稿」表只有表头） */
  allowEmptyLines?: boolean;
  /** 保留外部单号（导入时按原单号落库，方便按单号对账） */
  docNo?: string;
  status?: number;
  creatorName?: string;
  modifierName?: string;
  /** 表头金额（明细缺失时用原表金额） */
  totalAmount?: string | number;
  paidAmount?: string | number;
  /** 打印次数（导入时保留原值） */
  printCount?: number;
  /** 原审核时间（导入时保留原值） */
  auditedAt?: Date | string | null;
  ext?: Record<string, unknown>;
  sourceDocNo?: string;
  operatorId?: number;
  /** 共用的主数据缓存，批量导入时避免逐行查库 */
  cache?: MdCache;
}

interface Operator {
  uid: number;
  username: string;
}

/** YYYY-MM-DD HH:mm:ss（本地时区），前端表格与打印直接用 */
export function fmtDateTime(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 19).replace('T', ' ');
  if (Number.isNaN(v.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(
    v.getMinutes()
  )}:${p(v.getSeconds())}`;
}

@Provide()
export class DocService {
  @InjectDataSource()
  dataSource: DataSource;

  @InjectEntityModel(BizDoc)
  docRepo: Repository<BizDoc>;

  @InjectEntityModel(BizDocLine)
  lineRepo: Repository<BizDocLine>;

  @InjectEntityModel(SysDocType)
  typeRepo: Repository<SysDocType>;

  @Inject()
  masterData: MasterDataService;

  /** 单据类型列表（前端下拉用） */
  async docTypes() {
    const list = await this.masterData.listDocTypes();
    return list.map(t => ({
      code: t.code,
      name: t.name,
      prefix: t.prefix,
      stockDir: t.stockDir,
      needPost: t.needPost,
    }));
  }

  // ---------------------------------------------------------------
  // 查询
  // ---------------------------------------------------------------

  async page(query: {
    keyword?: string;
    docType?: string;
    status?: number;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.docRepo.createQueryBuilder('d').where('d.deletedAt IS NULL');

    if (query.docType) {
      qb.andWhere('d.docTypeName = :docType', { docType: query.docType });
    }
    if (query.status !== undefined && query.status !== null && `${query.status}` !== '') {
      qb.andWhere('d.status = :status', { status: Number(query.status) });
    }
    if (query.dateFrom) {
      qb.andWhere('d.bizDate >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query.dateTo) {
      qb.andWhere('d.bizDate <= :dateTo', { dateTo: query.dateTo });
    }
    const kw = (query.keyword || '').trim();
    if (kw) {
      qb.andWhere('(d.docNo LIKE :kw OR d.partnerName LIKE :kw OR d.summary LIKE :kw)', {
        kw: `%${kw}%`,
      });
    }

    const [rows, total] = await qb
      .orderBy('d.bizDate', 'DESC')
      .addOrderBy('d.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      rows: rows.map(d => ({
        id: d.id,
        docNo: d.docNo,
        docTypeName: d.docTypeName,
        bizDate: d.bizDate,
        partnerName: d.partnerName,
        warehouseName: d.warehouseName,
        totalQty: d.totalQty,
        totalAmount: d.totalAmount,
        paidAmount: d.paidAmount,
        summary: d.summary,
        status: d.status,
        handler: d.handler,
        creatorName: d.creatorName,
        modifierName: d.modifierName,
        department: d.department,
        printCount: d.printCount,
        createdAt: fmtDateTime(d.createdAt),
        auditedAt: fmtDateTime(d.auditedAt),
        updatedAt: fmtDateTime(d.updatedAt),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** 单据详情（头 + 明细），打印和查看共用 */
  async detail(id: number) {
    const doc = await this.docRepo.findOne({ where: { id } });
    if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);

    // 单据类型配置单独取一次：避免把 sys_doc_type 做成关系
    // 也避免用 ledger_type join（SD/CD 都是 0 会歧义）
    const type = doc.docTypeName
      ? await this.typeRepo.findOne({ where: { name: doc.docTypeName } })
      : null;

    const lines = await this.lineRepo.find({ where: { docId: id }, order: { lineNo: 'ASC' } });

    return {
      id: doc.id,
      docNo: doc.docNo,
      docType: doc.docType,
      docTypeName: doc.docTypeName,
      docTypeCode: type?.code || '',
      bizDate: doc.bizDate,
      partnerId: doc.partnerId,
      partnerName: doc.partnerName,
      contactPhone: doc.contactPhone,
      contactAddress: doc.contactAddress,
      warehouseId: doc.warehouseId,
      warehouseName: doc.warehouseName,
      toWarehouseId: doc.toWarehouseId,
      status: doc.status,
      totalQty: doc.totalQty,
      totalAmount: doc.totalAmount,
      discountAmount: doc.discountAmount,
      taxAmount: doc.taxAmount,
      sourceDocNo: doc.sourceDocNo,
      ext: doc.ext,
      remark: doc.remark,
      summary: doc.summary,
      handler: doc.handler,
      department: doc.department,
      creatorName: doc.creatorName,
      modifierName: doc.modifierName,
      paidAmount: doc.paidAmount,
      printCount: doc.printCount,
      auditedAt: fmtDateTime(doc.auditedAt),
      auditedBy: doc.auditedBy,
      postedAt: fmtDateTime(doc.postedAt),
      postedBy: doc.postedBy,
      createdAt: fmtDateTime(doc.createdAt),
      updatedAt: fmtDateTime(doc.updatedAt),
      stockDir: type?.stockDir ?? 0,
      needPost: type?.needPost ?? 0,
      lines: lines.map(l => ({
        id: l.id,
        docNo: l.docNo,
        lineNo: l.lineNo,
        itemId: l.itemId,
        itemName: l.itemName,
        itemSpec: l.itemSpec,
        itemColor: l.itemColor,
        unitId: l.unitId,
        unitName: l.unitName,
        qty: l.qty,
        baseQty: l.baseQty,
        price: l.price,
        amount: l.amount,
        costPrice: l.costPrice,
        costAmount: l.costAmount,
        warehouseId: l.warehouseId,
        batchNo: l.batchNo,
        remark: l.remark,
        summary: l.summary,
      })),
    };
  }

  /**
   * 按单据编号取详情。
   * 管家婆导入时全靠单号对齐（明细表里也是单号而不是 id），所以单独给一个入口。
   */
  async detailByNo(docNo: string) {
    const no = (docNo || '').trim();
    if (!no) throw new BizError('单据编号不能为空');
    const doc = await this.docRepo.findOne({ where: { docNo: no } });
    if (!doc) throw new BizError(`单据 ${no} 不存在`, 'NOT_FOUND', 404);
    return this.detail(doc.id);
  }

  // ---------------------------------------------------------------
  // 写入
  // ---------------------------------------------------------------

  /** 生成单号：{前缀}-{YYYY-MM-DD}-{5位流水}，靠行锁保证不重复 */
  private async nextDocNo(manager: EntityManager, prefix: string, bizDate: string): Promise<string> {
    const date = (bizDate || '').slice(0, 10);
    const seqRepo = manager.getRepository(SysDocSeq);

    // orIgnore：没有这一行就插一条 current=0，有就不动
    await manager
      .createQueryBuilder()
      .insert()
      .into(SysDocSeq)
      .values({ prefix, seqDate: date, current: 0 })
      .orIgnore()
      .execute();

    const row = await seqRepo
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.prefix = :prefix AND s.seqDate = :date', { prefix, date })
      .getOne();
    if (!row) throw new BizError('单据流水生成失败，请重试');

    row.current += 1;
    await seqRepo.save(row);

    return `${prefix}-${date}-${String(row.current).padStart(5, '0')}`;
  }

  /** 外部入口：新建单据 */
  async create(input: DocInput, op: Operator, opts: DocCreateOptions = {}) {
    return this.dataSource.transaction(async manager =>
      this.createInTx(manager, input, op, opts)
    );
  }

  /** 事务内新建（导入复用，保证一张单据一个事务） */
  async createInTx(
    manager: EntityManager,
    input: DocInput,
    op: Operator,
    opts: DocCreateOptions = {}
  ) {
    const cache = opts.cache || createMdCache();
    const type = await this.resolveType(input, cache);
    const lines = await this.normalizeLines(manager, input.lines, cache, op, opts.operatorId ?? op.uid);
    if (!lines.length && !opts.allowEmptyLines) throw new BizError('单据至少要有一行明细');

    const docNo =
      opts.docNo || (await this.nextDocNo(manager, type.prefix, input.bizDate));
    const sums = this.sumLines(lines);
    const totalAmount = opts.totalAmount !== undefined ? amount(opts.totalAmount) : sums.totalAmount;
    const totalQty = lines.length ? sums.totalQty : qty(0);

    const head = manager.create(BizDoc, {
      docNo,
      docType: type.ledgerType,
      docTypeName: type.name,
      bizDate: (input.bizDate || '').slice(0, 10),
      partnerId: Number(input.partnerId) || 0,
      partnerName: (input.partnerName || '').trim(),
      contactPhone: input.contactPhone || '',
      contactAddress: input.contactAddress || '',
      warehouseId: Number(input.warehouseId) || 0,
      warehouseName: input.warehouseName || '',
      toWarehouseId: Number(input.toWarehouseId) || 0,
      status: opts.status ?? DocStatus.DRAFT,
      totalQty,
      totalAmount,
      paidAmount: amount(input.paidAmount ?? opts.paidAmount ?? 0),
      summary: (input.summary || '').trim(),
      handler: (input.handler || '').trim(),
      creatorName: opts.creatorName || op.username,
      modifierName: opts.modifierName || op.username,
      department: input.department || '',
      remark: (input.remark || '').slice(0, 255),
      sourceDocNo: opts.sourceDocNo ?? null,
      ext: (opts.ext ?? null) as Record<string, unknown> | null,
      printCount: Number(opts.printCount) || 0,
      auditedAt: opts.auditedAt ? new Date(opts.auditedAt) : null,
      auditedBy: opts.auditedAt ? (opts.operatorId ?? op.uid) : 0,
      createdBy: opts.operatorId ?? op.uid,
      updatedBy: opts.operatorId ?? op.uid,
    });

    const saved = await manager.save(BizDoc, head);
    const lineRows = lines.map(l =>
      manager.create(BizDocLine, { ...l, docId: saved.id, docNo })
    );
    if (lineRows.length) await manager.save(BizDocLine, lineRows);

    return { id: saved.id, docNo, totalAmount };
  }

  async update(id: number, input: DocInput, op: Operator) {
    return this.dataSource.transaction(async manager => {
      const doc = await manager
        .getRepository(BizDoc)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.deletedAt IS NULL', { id })
        .getOne();
      if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);
      if (doc.status === DocStatus.POSTED) throw new BizError('已过账单据不能修改，请先反过账');
      if (doc.status === DocStatus.VOID) throw new BizError('作废单据不能修改');

      const cache = createMdCache();
      const type = await this.resolveType(input, cache);
      const lines = await this.normalizeLines(manager, input.lines, cache, op, op.uid);
      if (!lines.length) throw new BizError('单据至少要有一行明细');
      const sums = this.sumLines(lines);

      doc.docType = type.ledgerType;
      doc.docTypeName = type.name;
      doc.bizDate = (input.bizDate || '').slice(0, 10);
      doc.partnerId = Number(input.partnerId) || 0;
      doc.partnerName = (input.partnerName || '').trim();
      doc.contactPhone = input.contactPhone || '';
      doc.contactAddress = input.contactAddress || '';
      doc.warehouseId = Number(input.warehouseId) || 0;
      doc.warehouseName = input.warehouseName || '';
      doc.toWarehouseId = Number(input.toWarehouseId) || 0;
      doc.totalQty = sums.totalQty;
      doc.totalAmount = sums.totalAmount;
      doc.paidAmount = amount(input.paidAmount ?? 0);
      doc.summary = (input.summary || '').trim();
      doc.handler = (input.handler || '').trim();
      doc.modifierName = op.username;
      doc.department = input.department || '';
      doc.remark = (input.remark || '').slice(0, 255);
      doc.updatedBy = op.uid;
      doc.version += 1;
      await manager.save(BizDoc, doc);

      // 明细整体替换：单据行数少，简单可靠，避免逐行 diff 出 bug
      await manager.delete(BizDocLine, { docId: id });
      const lineRows = lines.map(l =>
        manager.create(BizDocLine, { ...l, docId: id, docNo: doc.docNo })
      );
      if (lineRows.length) await manager.save(BizDocLine, lineRows);

      return { id, totalAmount: sums.totalAmount };
    });
  }

  async remove(id: number) {
    return this.dataSource.transaction(async manager => {
      const doc = await manager
        .getRepository(BizDoc)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.deletedAt IS NULL', { id })
        .getOne();
      if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);
      if (doc.status === DocStatus.POSTED) throw new BizError('已过账单据不能删除');
      await manager.softDelete(BizDoc, id);
      return { id };
    });
  }

  /** 审核 / 反审核 */
  async audit(id: number, op: Operator) {
    return this.dataSource.transaction(async manager => {
      const doc = await manager
        .getRepository(BizDoc)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.deletedAt IS NULL', { id })
        .getOne();
      if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);
      if (doc.status === DocStatus.POSTED) throw new BizError('已过账，不能反审核');

      const next = doc.status === DocStatus.AUDITED ? DocStatus.DRAFT : DocStatus.AUDITED;
      doc.status = next;
      doc.auditedAt = next === DocStatus.AUDITED ? new Date() : null;
      doc.auditedBy = next === DocStatus.AUDITED ? op.uid : 0;
      doc.modifierName = op.username;
      await manager.save(BizDoc, doc);
      return { id, status: next };
    });
  }

  /** 作废 */
  async void(id: number, op: Operator) {
    return this.dataSource.transaction(async manager => {
      const doc = await manager
        .getRepository(BizDoc)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.deletedAt IS NULL', { id })
        .getOne();
      if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);
      if (doc.status === DocStatus.POSTED) throw new BizError('已过账单据请先反过账再作废');
      doc.status = DocStatus.VOID;
      doc.modifierName = op.username;
      await manager.save(BizDoc, doc);
      return { id, status: DocStatus.VOID };
    });
  }

  /** 打印次数 +1 */
  async markPrinted(id: number) {
    await this.docRepo.increment({ id }, 'printCount', 1);
    const row = await this.docRepo.findOne({ where: { id }, select: { id: true, printCount: true } });
    return { printCount: row?.printCount ?? 0 };
  }

  // ---------------------------------------------------------------
  // 自动补全
  // ---------------------------------------------------------------

  /**
   * 历史值补全。合并历史单据与主数据两个来源，按使用次数倒序。
   * field: summary | partner | item | spec | color | handler
   */
  async autocomplete(field: string, keyword = '', limit = 10) {
    const kw = `%${(keyword || '').trim()}%`;
    const lim = Math.min(30, Math.max(1, Number(limit) || 10));
    const merge = (
      a: { value: string; cnt: number }[],
      b: { value: string; cnt: number }[] = []
    ) => {
      const map = new Map<string, number>();
      for (const r of [...a, ...b]) {
        if (!r.value) continue;
        map.set(r.value, (map.get(r.value) || 0) + Number(r.cnt || 0));
      }
      return [...map.entries()]
        .map(([value, cnt]) => ({ value, cnt }))
        .sort((x, y) => y.cnt - x.cnt || x.value.localeCompare(y.value))
        .slice(0, lim);
    };

    switch (field) {
      case 'summary': {
        const rows = await this.docRepo
          .createQueryBuilder('d')
          .select('d.summary', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('d.deletedAt IS NULL')
          .andWhere('d.summary <> :e', { e: '' })
          .andWhere('d.summary LIKE :kw', { kw })
          .groupBy('d.summary')
          .orderBy('cnt', 'DESC')
          .addOrderBy('d.summary', 'ASC')
          .limit(lim)
          .getRawMany();
        return merge(rows);
      }

      case 'partner': {
        const docRows = await this.docRepo
          .createQueryBuilder('d')
          .select('d.partnerName', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('d.deletedAt IS NULL')
          .andWhere('d.partnerName <> :e', { e: '' })
          .andWhere('d.partnerName LIKE :kw', { kw })
          .groupBy('d.partnerName')
          .getRawMany();
        const mdRows = await this.dataSource
          .getRepository('MdPartner')
          .createQueryBuilder('p')
          .select('p.name', 'value')
          .addSelect('1', 'cnt')
          .where('p.deletedAt IS NULL')
          .andWhere('p.name LIKE :kw', { kw })
          .getRawMany();
        return merge(docRows, mdRows);
      }

      case 'item': {
        const lineRows = await this.lineRepo
          .createQueryBuilder('l')
          .select('l.itemName', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('l.itemName <> :e', { e: '' })
          .andWhere('l.itemName LIKE :kw', { kw })
          .groupBy('l.itemName')
          .getRawMany();
        const mdRows = await this.dataSource
          .getRepository(MdItem)
          .createQueryBuilder('i')
          .select('i.name', 'value')
          .addSelect('1', 'cnt')
          .where('i.deletedAt IS NULL')
          .andWhere('i.name LIKE :kw', { kw })
          .getRawMany();
        return merge(lineRows, mdRows);
      }

      case 'spec': {
        const rows = await this.lineRepo
          .createQueryBuilder('l')
          .select('l.itemSpec', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('l.itemSpec <> :e', { e: '' })
          .andWhere('l.itemSpec LIKE :kw', { kw })
          .groupBy('l.itemSpec')
          .orderBy('cnt', 'DESC')
          .limit(lim)
          .getRawMany();
        return merge(rows);
      }

      case 'color': {
        const rows = await this.lineRepo
          .createQueryBuilder('l')
          .select('l.itemColor', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('l.itemColor <> :e', { e: '' })
          .andWhere('l.itemColor LIKE :kw', { kw })
          .groupBy('l.itemColor')
          .orderBy('cnt', 'DESC')
          .limit(lim)
          .getRawMany();
        return merge(rows);
      }

      case 'handler': {
        const docRows = await this.docRepo
          .createQueryBuilder('d')
          .select('d.handler', 'value')
          .addSelect('COUNT(*)', 'cnt')
          .where('d.deletedAt IS NULL')
          .andWhere('d.handler <> :e', { e: '' })
          .andWhere('d.handler LIKE :kw', { kw })
          .groupBy('d.handler')
          .getRawMany();
        const userRows = await this.dataSource
          .getRepository(SysUser)
          .createQueryBuilder('u')
          .select('u.realName', 'value')
          .addSelect('1', 'cnt')
          .where('u.status = 1')
          .andWhere('u.realName <> :e', { e: '' })
          .andWhere('u.realName LIKE :kw', { kw })
          .getRawMany();
        return merge(docRows, userRows);
      }

      default:
        throw new BizError(`不支持的补全字段: ${field}`);
    }
  }

  /** 存货选中后带出规格 / 颜色 / 单位 / 参考价 */
  async itemHint(itemName: string) {
    const name = (itemName || '').trim();
    if (!name) return null;

    const rows = await this.lineRepo
      .createQueryBuilder('l')
      .select('l.itemName', 'itemName')
      .addSelect('l.itemSpec', 'itemSpec')
      .addSelect('l.itemColor', 'itemColor')
      .addSelect('l.unitName', 'unitName')
      .addSelect('l.price', 'price')
      .addSelect('COUNT(*)', 'cnt')
      .where('l.itemName = :name', { name })
      .groupBy('l.itemName')
      .addGroupBy('l.itemSpec')
      .addGroupBy('l.itemColor')
      .addGroupBy('l.unitName')
      .addGroupBy('l.price')
      .orderBy('cnt', 'DESC')
      .limit(5)
      .getRawMany();
    if (rows.length) return rows[0];

    const md = await this.dataSource
      .getRepository(MdItem)
      .createQueryBuilder('i')
      .leftJoin('md_unit', 'u', 'u.id = i.base_unit_id')
      .select('i.name', 'itemName')
      .addSelect('i.spec', 'itemSpec')
      .addSelect("''", 'itemColor')
      .addSelect('u.name', 'unitName')
      .addSelect('i.ref_cost', 'price')
      .where('i.name = :name', { name })
      .andWhere('i.deleted_at IS NULL')
      .limit(1)
      .getRawOne();
    return md || null;
  }

  // ---------------------------------------------------------------
  // 内部工具
  // ---------------------------------------------------------------

  private async resolveType(input: DocInput, cache: MdCache): Promise<SysDocType> {
    const code = (input.docTypeCode || '').trim();
    const type = await this.masterData.resolveDocType(
      {
        code: code || undefined,
        name: input.docTypeName,
        prefix: input.docTypePrefix,
      },
      { autoCreate: false },
      cache
    );
    if (!type) throw new BizError(`单据类型不存在：${code || input.docTypeName || '未知'}`);
    return type;
  }

  /** 规范化明细：解析物料、算金额、补行号、过滤空行 */
  private async normalizeLines(
    manager: EntityManager,
    input: DocLineInput[] = [],
    cache: MdCache,
    op: Operator,
    operatorId: number
  ) {
    const picked = (input || []).filter(
      l => (l.itemName || '').trim() || Number(l.qty) > 0 || Number(l.itemId) > 0
    );

    const out: Array<Partial<BizDocLine>> = [];
    for (let idx = 0; idx < picked.length; idx++) {
      const l = picked[idx];
      const itemName = (l.itemName || '').trim();
      let itemId = Number(l.itemId) || 0;
      let unitId = Number(l.unitId) || 0;
      let unitName = (l.unitName || '').trim();

      // 手工录单只打了存货名的情况：这里只做「查找」，不建档
      // （建档发生在过账时，避免录单时手滑产生一堆垃圾档案）
      if (!itemId && itemName) {
        const found = await this.masterData.findItem(itemName, cache);
        if (found) {
          itemId = found.id;
          if (!unitId) unitId = found.baseUnitId;
          if (!unitName) {
            const u = found.baseUnitId
              ? await this.masterData.findUnitById(found.baseUnitId, cache)
              : null;
            unitName = u?.name || '';
          }
        }
      }

      if (!unitName && unitId) {
        const u = await this.masterData.findUnitById(unitId, cache);
        unitName = u?.name || '';
      }
      const q = dec(l.qty || 0);
      const p = dec(l.price || 0);
      const amt =
        l.amount !== undefined && l.amount !== null && `${l.amount}` !== ''
          ? dec(l.amount)
          : q.mul(p);

      out.push({
        lineNo: idx + 1,
        itemId,
        itemName,
        itemSpec: (l.itemSpec || '').trim().slice(0, 255),
        itemColor: (l.itemColor || '').trim().slice(0, 64),
        unitId,
        unitName: unitName.slice(0, 32),
        qty: qty(q),
        baseQty: qty(q),
        price: p.toFixed(6),
        amount: amount(amt),
        warehouseId: Number(l.warehouseId) || 0,
        batchNo: (l.batchNo || '').trim().slice(0, 64),
        remark: (l.remark || '').trim().slice(0, 255),
        summary: (l.summary || '').trim().slice(0, 255),
        taxRate: '0',
        taxAmount: '0',
        costPrice: '0',
        costAmount: '0',
      });
    }
    // manager / op 保留在签名里：明细落库走同一个事务，后续若要拆子表不必改调用方
    return out;
  }

  private sumLines(lines: Array<Partial<BizDocLine>>) {
    let totalQty = dec(0);
    let totalAmount = dec(0);
    for (const l of lines) {
      totalQty = totalQty.plus(dec(l.baseQty as string));
      totalAmount = totalAmount.plus(dec(l.amount as string));
    }
    return { totalQty: qty(totalQty), totalAmount: amount(totalAmount) };
  }

  /** 供导入复用：按单据编号批量查已存在的单号 */
  async existingDocNos(docNos: string[]): Promise<Set<string>> {
    const list = (docNos || []).filter(Boolean);
    if (!list.length) return new Set();
    const rows = await this.docRepo.find({
      where: { docNo: In(list) },
      select: { id: true, docNo: true },
      withDeleted: true,
    });
    return new Set(rows.map(r => r.docNo));
  }
}

