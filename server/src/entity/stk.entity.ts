import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 库存流水：只增不改，库存的唯一真相 */
@Entity('stk_ledger')
@Index('uk_source', ['sourceType', 'sourceId', 'sourceLineId', 'direction'], {
  unique: true,
})
@Index('idx_item_date', ['itemId', 'bizDate'])
export class StkLedger {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'biz_date', type: 'date' })
  bizDate: string;

  @Column({ name: 'warehouse_id', type: 'bigint' })
  warehouseId: number;

  @Column({ name: 'location_id', type: 'bigint', default: 0 })
  locationId: number;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId: number;

  @Column({ name: 'batch_no', length: 64, default: '' })
  batchNo: string;

  @Column({ type: 'tinyint', comment: '1入库 -1出库' })
  direction: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, comment: '基本单位数量（正数）' })
  qty: string;

  @Column({ name: 'unit_id', type: 'bigint', default: 0 })
  unitId: number;

  @Column({ name: 'src_qty', type: 'decimal', precision: 18, scale: 4, default: 0 })
  srcQty: string;

  @Column({ name: 'cost_price', type: 'decimal', precision: 18, scale: 6, default: 0 })
  costPrice: string;

  @Column({ name: 'cost_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costAmount: string;

  @Column({ name: 'source_type', length: 32 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'bigint' })
  sourceId: number;

  @Column({ name: 'source_line_id', type: 'bigint', default: 0 })
  sourceLineId: number;

  @Column({ length: 255, default: '' })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'bigint', default: 0 })
  createdBy: number;
}

/** 库存余额：流水的物化结果，可随时由流水重建 */
@Entity('stk_balance')
@Index('uk_key', ['warehouseId', 'locationId', 'itemId', 'batchNo'], { unique: true })
export class StkBalance {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'warehouse_id', type: 'bigint' })
  warehouseId: number;

  @Column({ name: 'location_id', type: 'bigint', default: 0 })
  locationId: number;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId: number;

  @Column({ name: 'batch_no', length: 64, default: '' })
  batchNo: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  qty: string;

  @Column({ name: 'cost_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costAmount: string;

  @Column({ type: 'int', default: 0, comment: '乐观锁' })
  version: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
