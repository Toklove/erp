import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('sys_user')
export class SysUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ length: 64 })
  username: string;

  @Column({ name: 'password_hash', length: 128 })
  passwordHash: string;

  @Column({ name: 'real_name', length: 64, default: '' })
  realName: string;

  @Column({ length: 32, default: '' })
  phone: string;

  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * 单据编号流水：按 (前缀, 日期) 一行计数。
 * 单号格式 {前缀}-{YYYY-MM-DD}-{5位流水}，靠数据库行锁保证并发不重号。
 */
@Entity('sys_doc_seq')
export class SysDocSeq {
  @PrimaryColumn({ length: 16 })
  prefix: string;

  @PrimaryColumn({ name: 'seq_date', type: 'date' })
  seqDate: string;

  @Column({ type: 'int', default: 0 })
  current: number;
}
