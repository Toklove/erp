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

  /** 微信 openid：唯一，未绑定为 NULL（唯一索引允许多个 NULL） */
  @Column({ name: 'wx_openid', type: 'varchar', length: 64, nullable: true, default: null })
  wxOpenid: string | null;

  @Column({ name: 'wx_unionid', type: 'varchar', length: 64, default: '' })
  wxUnionid: string;

  @Column({ name: 'wx_nickname', type: 'varchar', length: 64, default: '' })
  wxNickname: string;

  @Column({ name: 'wx_bound_at', type: 'datetime', nullable: true })
  wxBoundAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * 微信绑定码：后台生成，一次性，10 分钟有效。
 * 用绑定码把当前微信 openid 挂到指定系统用户上，之后小程序即可一键登录。
 */
@Entity('sys_wx_bind_code')
export class SysWxBindCode {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'char', length: 6 })
  code: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  /** 0 待用 / 1 已使用 / 2 已作废 */
  @Column({ type: 'tinyint', default: 0 })
  status: number;

  @Column({ name: 'expire_at', type: 'datetime' })
  expireAt: Date;

  @Column({ name: 'used_at', type: 'datetime', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'used_openid', type: 'varchar', length: 64, default: '' })
  usedOpenid: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
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
