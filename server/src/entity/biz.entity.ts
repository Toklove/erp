import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 业务单据头 */
@Entity('biz_doc')
@Index('uk_doc_no', ['docNo'], { unique: true })
@Index('uk_source', ['sourceDocNo'], { unique: true })
export class BizDoc {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'doc_no', length: 64 })
  docNo: string;

  @Column({ name: 'doc_type', type: 'smallint' })
  docType: number;

  @Column({ name: 'doc_type_name', length: 32, default: '' })
  docTypeName: string;

  @Column({ name: 'biz_date', type: 'date' })
  bizDate: string;

  @Column({ name: 'partner_id', type: 'bigint', default: 0 })
  partnerId: number;

  @Column({ name: 'partner_name', length: 128, default: '' })
  partnerName: string;

  @Column({ name: 'contact_phone', length: 32, default: '' })
  contactPhone: string;

  @Column({ name: 'contact_address', length: 255, default: '' })
  contactAddress: string;

  @Column({ name: 'warehouse_id', type: 'bigint', default: 0 })
  warehouseId: number;

  @Column({ name: 'warehouse_name', length: 64, default: '' })
  warehouseName: string;

  @Column({ name: 'to_warehouse_id', type: 'bigint', default: 0 })
  toWarehouseId: number;

  @Column({ type: 'tinyint', default: 0, comment: '0草稿 1已审核 2已过账 9作废' })
  status: number;

  @Column({ name: 'total_qty', type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalQty: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalAmount: string;

  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 18,
    scale: 4,
    default: 0,
  })
  discountAmount: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  taxAmount: string;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  paidAmount: string;

  @Column({ name: 'source_doc_no', type: 'varchar', length: 64, nullable: true, default: null, comment: '外部来源单号（幂等）' })
  sourceDocNo: string | null;

  @Column({ length: 255, default: '' })
  summary: string;

  @Column({ length: 64, default: '', comment: '经办人（用户名）' })
  handler: string;

  @Column({ name: 'creator_name', length: 64, default: '', comment: '制单人（用户名）' })
  creatorName: string;

  @Column({ name: 'modifier_name', length: 64, default: '', comment: '修改人（用户名）' })
  modifierName: string;

  @Column({ length: 64, default: '' })
  department: string;

  @Column({ name: 'print_count', type: 'int', default: 0 })
  printCount: number;

  @Column({ type: 'json', nullable: true })
  ext: Record<string, unknown>;

  @Column({ length: 255, default: '' })
  remark: string;

  @Column({ name: 'audited_at', type: 'datetime', nullable: true })
  auditedAt: Date;

  @Column({ name: 'audited_by', type: 'bigint', default: 0 })
  auditedBy: number;

  @Column({ name: 'posted_at', type: 'datetime', nullable: true })
  postedAt: Date;

  @Column({ name: 'posted_by', type: 'bigint', default: 0 })
  postedBy: number;

  @Column({ type: 'int', default: 0, comment: '乐观锁' })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'bigint', default: 0 })
  createdBy: number;

  @Column({ name: 'updated_by', type: 'bigint', default: 0 })
  updatedBy: number;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}

/** 业务单据明细 */
@Entity('biz_doc_line')
@Index('uk_doc_line', ['docId', 'lineNo'], { unique: true })
export class BizDocLine {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'doc_id', type: 'bigint' })
  docId: number;

  /** 冗余快照：管家婆明细表自带单号，按单号对齐/导出更方便；关联仍以 doc_id 为准 */
  @Column({ name: 'doc_no', length: 64, default: '' })
  docNo: string;

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Column({ name: 'item_id', type: 'bigint', default: 0 })
  itemId: number;

  @Column({ name: 'item_name', length: 128, default: '' })
  itemName: string;

  @Column({ name: 'item_spec', length: 255, default: '' })
  itemSpec: string;

  @Column({ name: 'item_color', length: 64, default: '' })
  itemColor: string;

  @Column({ name: 'unit_id', type: 'bigint', default: 0 })
  unitId: number;

  @Column({ name: 'unit_name', length: 32, default: '' })
  unitName: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0, comment: '录入单位数量' })
  qty: string;

  @Column({ name: 'base_qty', type: 'decimal', precision: 18, scale: 4, default: 0 })
  baseQty: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  price: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  amount: string;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 4, default: 0 })
  taxRate: string;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  taxAmount: string;

  @Column({ name: 'warehouse_id', type: 'bigint', default: 0 })
  warehouseId: number;

  @Column({ name: 'location_id', type: 'bigint', default: 0 })
  locationId: number;

  @Column({ name: 'batch_no', length: 64, default: '' })
  batchNo: string;

  @Column({ name: 'cost_price', type: 'decimal', precision: 18, scale: 6, default: 0 })
  costPrice: string;

  @Column({ name: 'cost_amount', type: 'decimal', precision: 18, scale: 4, default: 0 })
  costAmount: string;

  @Column({ type: 'json', nullable: true })
  ext: Record<string, unknown>;

  @Column({ length: 255, default: '' })
  remark: string;

  @Column({ length: 255, default: '', comment: '行摘要' })
  summary: string;
}

/** 单据类型配置 */
@Entity('sys_doc_type')
export class SysDocType {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 16 })
  code: string;

  @Column({ length: 32 })
  name: string;

  @Column({ length: 16 })
  prefix: string;

  @Column({ name: 'stock_dir', type: 'tinyint', default: 0 })
  stockDir: number;

  @Column({ name: 'ledger_type', type: 'smallint', default: 0, comment: '对应库存流水单据类型码' })
  ledgerType: number;

  @Column({ name: 'need_post', type: 'tinyint', default: 1 })
  needPost: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;
}
