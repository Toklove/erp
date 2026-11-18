import { Inject, Provide } from '@midwayjs/core';
import { InjectDataSource, InjectEntityModel } from '@midwayjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BizError } from '../common/biz-error';
import { avgCost, dec, price, qty, amount } from '../common/money';
import { DocStatus, isOutbound } from '../shared/enums';
import { BizDoc, BizDocLine, SysDocType } from '../entity/biz.entity';
import { MdItem, MdWarehouse } from '../entity/md.entity';
import { StkBalance, StkLedger } from '../entity/stk.entity';
import { MasterDataService, createMdCache } from './master-data.service';

interface Action {
  line: BizDocLine;
  warehouseId: number;
  direction: 1 | -1;
}

/**
 * 库存过账。
 *
 * 铁律：
 * 1) 一张单据的过账是一个事务：改状态 + 写流水 + 改余额，原子提交
 * 2) 锁顺序固定：先出库后入库，同组内按 (仓库, 货位, 物料, 批次) 排序 → 避免死锁
 * 3) 流水唯一索引 (source_type, source_id, source_line_id, direction) 兜底幂等
 * 4) 金额全程 decimal.js，禁止 number 运算
 * 5) 明细只写了存货名、没有 item_id 的，过账时按名称解析档案，解析不到再自动建档
 *    —— 否则「第 1 行没有关联物料档案，无法过账」会一直挡着手工单和导入单
 */
@Provide()
export class StockService {
  @InjectDataSource()
  dataSource: DataSource;

  @InjectEntityModel(BizDoc)
  docRepo: Repository<BizDoc>;

  @InjectEntityModel(SysDocType)
  typeRepo: Repository<SysDocType>;

  @Inject()
  masterData: MasterDataService;

  async post(docId: number, operatorId = 0) {
    return this.dataSource.transaction(async manager => {
      const doc = await manager
        .getRepository(BizDoc)
        .createQueryBuilder('d')
        .setLock('pessimistic_write')
        .where('d.id = :id AND d.deletedAt IS NULL', { id: docId })
        .getOne();
      if (!doc) throw new BizError('单据不存在', 'NOT_FOUND', 404);
      if (doc.status === DocStatus.POSTED) throw new BizError('单据已过账，请勿重复操作');
      if (doc.status !== DocStatus.AUDITED) throw new BizError('只有已审核的单据才能过账');

      const type = doc.docTypeName
        ? await this.typeRepo.findOne({ where: { name: doc.docTypeName } })
        : null;
      if (type && Number(type.needPost) === 0) {
        throw new BizError(`单据类型「${doc.docTypeName}」不参与库存，无需过账`);
      }

      const lines = await manager.getRepository(BizDocLine).find({
        where: { docId },
        order: { lineNo: 'ASC' },
      });
      if (!lines.length) throw new BizError('单据没有明细，无法过账');

      // 关键修复：没有 item_id 的行，先按存货名解析档案，解析不到就自动建档
      await this.ensureItems(manager, lines, operatorId);

      // 调拨：有入库仓即视为调拨，一出一入
      const isTransfer = Number(doc.toWarehouseId) > 0;
      // 方向优先取单据类型配置，缺失时按旧枚举兜底
      const stockDir =
        type && type.stockDir !== null && type.stockDir !== undefined
          ? Number(type.stockDir)
          : isOutbound(Number(doc.docType))
            ? -1
            : 1;
      const outbound = stockDir < 0;

      const actions: Action[] = [];
      for (const line of lines) {
        const warehouseId = Number(line.warehouseId) || Number(doc.warehouseId);
        if (isTransfer) {
          // 调拨：先出后入，成本沿用出库仓
          actions.push({ line, warehouseId, direction: -1 });
          actions.push({ line, warehouseId: Number(doc.toWarehouseId), direction: 1 });
        } else {
          actions.push({ line, warehouseId, direction: outbound ? -1 : 1 });
        }
      }

      // 先出库（保证成本先算出），再入库；组内按业务键排序
      actions.sort((a, b) => {
        if (a.direction !== b.direction) return a.direction - b.direction; // -1 在前
        return this.sortKey(a) < this.sortKey(b) ? -1 : 1;
      });

      const lineCost = new Map<number, { costPrice: string; costAmount: string }>();

      for (const action of actions) {
        const result = await this.applyOne(manager, doc, action);
        if (action.direction === -1) lineCost.set(action.line.id, result);
      }

      // 回写出库行成本（毛利、报表都依赖它）
      for (const [lineId, cost] of lineCost) {
        await manager.update(BizDocLine, lineId, {
          costPrice: cost.costPrice,
          costAmount: cost.costAmount,
        });
      }

      doc.status = DocStatus.POSTED;
      doc.paidAmount = doc.totalAmount || '0';
      doc.postedAt = new Date();
      doc.postedBy = operatorId;
      doc.version = Number(doc.version || 0) + 1;
      await manager.save(BizDoc, doc);

      return { docId, docNo: doc.docNo, ledgerCount: actions.length, autoCreateItems: this.lastCreatedItems };
    });
  }

  /** 本次过账过程中自动建档的物料名（返回给前端提示用） */
  private lastCreatedItems: string[] = [];

  /**
   * 补齐 item_id：
   * - 有 item_id → 跳过
   * - 只有存货名 → 按名解析，解析不到自动建档，并把 item_id / unit_id 写回明细
   * - 名字也没有 → 报错并指明行号
   */
  private async ensureItems(manager: EntityManager, lines: BizDocLine[], operatorId: number) {
    this.lastCreatedItems = [];
    const cache = createMdCache();
    const fallbackUnit = await this.masterData.resolveUnit(undefined, cache);
    for (const line of lines) {
      if (Number(line.itemId) > 0) continue;
      const name = (line.itemName || '').trim();
      if (!name) {
        throw new BizError(`第 ${line.lineNo} 行既没有物料档案也没有存货名称，无法过账`);
      }
      const found = await this.masterData.resolveItem(
        name,
        { autoCreate: true, spec: line.itemSpec, unitName: line.unitName, operatorId },
        cache
      );
      if (!found.item) {
        throw new BizError(`第 ${line.lineNo} 行没有关联物料档案，无法过账`);
      }
      if (found.created) this.lastCreatedItems.push(found.item.name);

      line.itemId = found.item.id;
      if (!Number(line.unitId)) line.unitId = found.item.baseUnitId || fallbackUnit?.id || 0;
      if (!line.unitName) line.unitName = (fallbackUnit?.name || '').slice(0, 32);
      await manager.update(BizDocLine, line.id, {
        itemId: line.itemId,
        unitId: line.unitId,
        unitName: line.unitName,
      });
    }
  }

  /** 单条流水的落库：余额行加锁 → 算成本 → 写流水 → 更新余额 */
  private async applyOne(manager: EntityManager, doc: BizDoc, action: Action) {
    const { line, warehouseId, direction } = action;
    const itemId = Number(line.itemId);
    const locationId = Number(line.locationId) || 0;
    const batchNo = line.batchNo || '';
    const lineQty = dec(line.baseQty);
    if (lineQty.lte(0)) throw new BizError(`第 ${line.lineNo} 行数量必须大于 0`);

    const balanceRepo = manager.getRepository(StkBalance);

    // 保证余额行存在（并发下用 INSERT IGNORE 兜住）
    await manager
      .createQueryBuilder()
      .insert()
      .into(StkBalance)
      .values({
        warehouseId,
        locationId,
        itemId,
        batchNo,
        qty: '0',
        costAmount: '0',
        version: 0,
      })
      .orIgnore()
      .execute();

    const balance = await balanceRepo
      .createQueryBuilder('b')
      .setLock('pessimistic_write')
      .where('b.warehouseId = :warehouseId', { warehouseId })
      .andWhere('b.locationId = :locationId', { locationId })
      .andWhere('b.itemId = :itemId', { itemId })
      .andWhere('b.batchNo = :batchNo', { batchNo })
      .getOne();
    if (!balance) throw new BizError('库存余额行读取失败，请重试');

    const qtyOnHand = dec(balance.qty);
    const costOnHand = dec(balance.costAmount);

    // 移动加权平均：出库取当前均价，入库取单据单价
    let unitCost =
      direction === 1 ? dec(line.price) : qtyOnHand.isZero() ? dec(line.price) : costOnHand.div(qtyOnHand);

    if (direction === -1 && qtyOnHand.lt(lineQty)) {
      // const wh = await manager.getRepository(MdWarehouse).findOne({ where: { id: warehouseId } });
      // if (!wh || Number(wh.allowNegative) !== 1) {
      //   throw new BizError(
      //     `仓库库存不足：物料 ${line.itemName || itemId} 现存 ${qtyOnHand.toString()}，本次出库 ${lineQty.toString()}`
      //   );
      // }
      // 负库存兜底成本：用单据单价，避免 NaN
      if (unitCost.isZero()) unitCost = dec(line.price);
    }

    const costAmount = lineQty.mul(unitCost);
    const newQty = direction === 1 ? qtyOnHand.plus(lineQty) : qtyOnHand.minus(lineQty);
    let newCost = direction === 1 ? costOnHand.plus(costAmount) : costOnHand.minus(costAmount);
    if (newQty.isZero()) newCost = dec(0); // 清零，避免残留分钱

    balance.qty = qty(newQty);
    balance.costAmount = amount(newCost);
    balance.version = Number(balance.version || 0) + 1;
    await manager.save(StkBalance, balance);

    await manager.save(
      StkLedger,
      manager.create(StkLedger, {
        bizDate: doc.bizDate,
        warehouseId,
        locationId,
        itemId,
        batchNo,
        direction,
        qty: qty(lineQty),
        unitId: Number(line.unitId) || 0,
        srcQty: qty(line.qty),
        costPrice: price(unitCost),
        costAmount: amount(costAmount),
        sourceType: String(doc.docType),
        sourceId: doc.id,
        sourceLineId: line.id,
        remark: '',
        createdBy: 0,
      })
    );

    return { costPrice: price(unitCost), costAmount: amount(costAmount) };
  }

  private sortKey(a: Action): string {
    return [
      String(a.warehouseId).padStart(12, '0'),
      String(Number(a.line.locationId) || 0).padStart(12, '0'),
      String(Number(a.line.itemId)).padStart(12, '0'),
      a.line.batchNo || '',
    ].join('|');
  }

  /** 即时库存查询 */
  async balanceList(query: { warehouseId?: number; itemId?: number; keyword?: string }) {
    const qb = this.dataSource
      .getRepository(StkBalance)
      .createQueryBuilder('b')
      .leftJoin(MdWarehouse, 'w', 'w.id = b.warehouseId')
      .leftJoin(MdItem, 'i', 'i.id = b.itemId')
      .select('b.id', 'id')
      .addSelect('b.warehouseId', 'warehouseId')
      .addSelect('w.name', 'warehouseName')
      .addSelect('b.itemId', 'itemId')
      .addSelect('i.code', 'itemCode')
      .addSelect('i.name', 'itemName')
      .addSelect('b.batchNo', 'batchNo')
      .addSelect('b.qty', 'qty')
      .addSelect('b.costAmount', 'costAmount')
      .where('b.qty <> 0');

    if (query.warehouseId) qb.andWhere('b.warehouseId = :warehouseId', { warehouseId: query.warehouseId });
    if (query.itemId) qb.andWhere('b.itemId = :itemId', { itemId: query.itemId });
    if (query.keyword) {
      qb.andWhere('(i.code LIKE :kw OR i.name LIKE :kw)', { kw: `%${query.keyword}%` });
    }

    const rows = await qb.orderBy('b.itemId', 'ASC').limit(500).getRawMany();
    return rows.map(r => ({
      ...r,
      avgCost: avgCost(r.costAmount, r.qty),
    }));
  }
}
