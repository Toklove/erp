import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 主数据实体。
 * 注意：BIGINT 由 mysql2 以 number 返回（id 远小于 2^53，安全）；
 *      DECIMAL 一律以 string 返回，业务层用 decimal.js 计算，禁止 parseFloat。
 */

@Entity('md_item')
@Index('uk_code', ['code'], { unique: true })
export class MdItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 64, comment: '存货编码' })
  code: string;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 255, default: '', comment: '规格型号' })
  spec: string;

  @Column({ length: 64, default: '' })
  barcode: string;

  @Column({ name: 'category_id', type: 'bigint', default: 0 })
  categoryId: number;

  @Column({ name: 'base_unit_id', type: 'bigint', comment: '基本单位' })
  baseUnitId: number;

  @Column({ length: 64, default: '' })
  brand: string;

  @Column({ name: 'batch_manage', type: 'tinyint', default: 0, comment: '批次管理' })
  batchManage: number;

  @Column({ name: 'shelf_life_days', type: 'int', default: 0 })
  shelfLifeDays: number;

  @Column({ name: 'serial_manage', type: 'tinyint', default: 0 })
  serialManage: number;

  @Column({ name: 'default_warehouse_id', type: 'bigint', default: 0 })
  defaultWarehouseId: number;

  @Column({
    name: 'ref_cost',
    type: 'decimal',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: { to: (v: unknown) => v, from: (v: string) => v ?? '0' },
  })
  refCost: string;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 4, default: 0 })
  taxRate: string;

  @Column({ length: 255, default: '' })
  remark: string;

  @Column({ type: 'tinyint', default: 1, comment: '1启用 0停用' })
  status: number;

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

@Entity('md_unit')
export class MdUnit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 32 })
  code: string;

  @Column({ length: 32 })
  name: string;

  @Column({ type: 'tinyint', default: 2, comment: '数量精度' })
  decimals: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;
}

@Entity('md_warehouse')
export class MdWarehouse {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 32 })
  code: string;

  @Column({ length: 64 })
  name: string;

  @Column({ name: 'allow_negative', type: 'tinyint', default: 0 })
  allowNegative: number;

  @Column({ name: 'use_location', type: 'tinyint', default: 0 })
  useLocation: number;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('md_partner')
export class MdPartner {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 32 })
  code: string;

  @Column({ length: 128 })
  name: string;

  @Column({
    name: 'partner_type',
    type: 'tinyint',
    default: 1,
    comment: '1客户 2供应商 3兼有',
  })
  partnerType: number;

  @Column({ length: 64, default: '' })
  contact: string;

  @Column({ length: 32, default: '' })
  phone: string;

  @Column({ length: 255, default: '' })
  address: string;

  @Column({ name: 'tax_no', length: 64, default: '' })
  taxNo: string;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 18, scale: 4, default: 0 })
  creditLimit: string;

  @Column({ name: 'settle_terms', length: 64, default: '' })
  settleTerms: string;

  @Column({ length: 255, default: '' })
  remark: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date;
}
