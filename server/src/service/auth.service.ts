import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { SysUser } from '../entity/sys.entity';
import { BizError } from '../common/biz-error';
import { LoginUser } from '../middleware/auth.middleware';

/** 密码哈希：scrypt 是 Node 内置，零原生依赖，比 bcrypt 省事 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const actual = scryptSync(plain, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

@Provide()
export class AuthService {
  @InjectEntityModel(SysUser)
  userRepo: Repository<SysUser>;

  async validate(username: string, password: string): Promise<SysUser> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || user.status !== 1) {
      throw new BizError('用户名或密码错误', 'LOGIN_FAILED', 401);
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw new BizError('用户名或密码错误', 'LOGIN_FAILED', 401);
    }
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });
    return user;
  }

  toLoginUser(user: SysUser): LoginUser {
    return { uid: user.id, username: user.username, roles: [] };
  }
}
