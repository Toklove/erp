import { Config, Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { SysUser, SysWxBindCode } from '../entity/sys.entity';
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

export interface WxProfile {
  openid: string;
  unionid?: string;
  nickname?: string;
}

export interface WxBindStatus {
  bound: boolean;
  nickname: string;
  boundAt: string | null;
  /** 服务端是否配好了 AppID/Secret（客户端据此提示「一键登录未启用」） */
  configured: boolean;
}

const WX_CONFIG_ERROR = 'WX_NOT_CONFIGURED';

/** 绑定码字符集：去掉 0/O/1/I/L 等易混字符，方便口头或手抄 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function fmtDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

@Provide()
export class AuthService {
  @InjectEntityModel(SysUser)
  userRepo: Repository<SysUser>;

  @InjectEntityModel(SysWxBindCode)
  bindRepo: Repository<SysWxBindCode>;

  @Config('wx')
  wxConfig: { appid: string; secret: string; bindTtlMinutes: number };

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

  // ------------------------------------------------------------
  // 微信登录
  // ------------------------------------------------------------

  /** 服务端是否具备换取 openid 的能力（云托管内网调用可只用 X-WX-OPENID，不需要 secret） */
  get wxConfigured(): boolean {
    return Boolean(this.wxConfig?.appid && this.wxConfig?.secret);
  }

  /**
   * 用 wx.login 拿到的 code 换 openid。
   * 只在「小程序直接 wx.request 调后端」时需要；走云托管 callContainer 时后端直接读 X-WX-OPENID。
   */
  async code2Session(code: string): Promise<{ openid: string; unionid: string }> {
    if (!this.wxConfigured) {
      throw new BizError(
        '服务端未配置小程序 AppID/Secret，无法用临时 code 登录。请在云托管环境变量里配置 WX_APPID / WX_SECRET，或改用云托管内网调用方式。',
        WX_CONFIG_ERROR
      );
    }
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', this.wxConfig.appid);
    url.searchParams.set('secret', this.wxConfig.secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let payload: Record<string, unknown>;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      payload = (await res.json()) as Record<string, unknown>;
    } catch (e) {
      throw new BizError(`微信登录服务连接失败：${(e as Error).message}`, 'WX_NETWORK');
    }

    const errcode = Number(payload.errcode || 0);
    if (errcode) {
      const msg = String(payload.errmsg || '');
      if (errcode === 40029 || errcode === 40163) {
        throw new BizError('微信登录凭证已失效，请重新点击「微信一键登录」', 'WX_CODE_INVALID');
      }
      throw new BizError(`微信登录失败（${errcode} ${msg}）`, 'WX_LOGIN_FAILED');
    }
    const openid = String(payload.openid || '');
    if (!openid) throw new BizError('微信登录失败：未取到 openid', 'WX_LOGIN_FAILED');
    return { openid, unionid: String(payload.unionid || '') };
  }

  async findByOpenid(openid: string): Promise<SysUser | null> {
    if (!openid) return null;
    return this.userRepo.findOne({ where: { wxOpenid: openid } });
  }

  /** 已绑定则直接返回用户；未绑定返回 null（由客户端引导去绑定） */
  async loginByOpenid(profile: WxProfile): Promise<SysUser | null> {
    const user = await this.findByOpenid(profile.openid);
    if (!user) return null;
    if (user.status !== 1) {
      throw new BizError('该账号已被停用，请联系管理员', 'USER_DISABLED', 403);
    }
    const patch: Partial<SysUser> = { lastLoginAt: new Date() };
    const nickname = (profile.nickname || '').trim();
    if (nickname && nickname !== user.wxNickname) patch.wxNickname = nickname;
    if (profile.unionid && !user.wxUnionid) patch.wxUnionid = profile.unionid;
    await this.userRepo.update(user.id, patch);
    return this.userRepo.findOne({ where: { id: user.id } });
  }

  // ------------------------------------------------------------
  // 绑定 / 解绑
  // ------------------------------------------------------------

  async bindStatus(userId: number): Promise<WxBindStatus> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BizError('用户不存在', 'USER_NOT_FOUND', 404);
    return {
      bound: Boolean(user.wxOpenid),
      nickname: user.wxNickname || '',
      boundAt: fmtDate(user.wxBoundAt),
      configured: this.wxConfigured,
    };
  }

  /** 后台生成绑定码：同一用户之前的未使用码一律作废，避免旧码泄漏还能用 */
  async createBindCode(userId: number): Promise<{ code: string; expireAt: string; ttlMinutes: number }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BizError('用户不存在', 'USER_NOT_FOUND', 404);

    await this.bindRepo.update({ userId, status: 0 }, { status: 2 });

    const ttl = Math.max(1, Math.min(60, Number(this.wxConfig?.bindTtlMinutes) || 10));
    const expireAt = new Date(Date.now() + ttl * 60 * 1000);

    // 6 位码在 30 个字符里组合够多，但并发/重试仍可能撞唯一键，撞了就换一个重试
    let lastErr: unknown = null;
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      try {
        await this.bindRepo.insert({ code, userId, status: 0, expireAt, usedOpenid: '' });
        return { code, expireAt: fmtDate(expireAt) as string, ttlMinutes: ttl };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new BizError(`生成绑定码失败：${(lastErr as Error)?.message || '请重试'}`, 'BIND_CODE_FAILED');
  }

  /**
   * 小程序端用绑定码把当前微信挂到指定用户上。
   * 校验顺序：码存在 → 未用过 → 未过期 → 目标用户可用 → 该微信没绑过别的账号。
   */
  async bindByCode(profile: WxProfile, rawCode: string): Promise<SysUser> {
    const code = (rawCode || '').trim().toUpperCase();
    if (!/^[0-9A-Z]{6}$/.test(code)) {
      throw new BizError('绑定码格式不正确（6 位字母或数字）', 'BIND_CODE_INVALID');
    }

    const record = await this.bindRepo.findOne({ where: { code } });
    if (!record) throw new BizError('绑定码不存在，请让管理员重新生成', 'BIND_CODE_NOT_FOUND');
    if (record.status === 1) throw new BizError('该绑定码已被使用，请让管理员重新生成', 'BIND_CODE_USED');
    if (record.status === 2) throw new BizError('该绑定码已作废，请让管理员重新生成', 'BIND_CODE_REVOKED');
    if (record.expireAt.getTime() < Date.now()) {
      await this.bindRepo.update(record.id, { status: 2 });
      throw new BizError('绑定码已过期，请让管理员重新生成', 'BIND_CODE_EXPIRED');
    }

    const user = await this.userRepo.findOne({ where: { id: record.userId } });
    if (!user || user.status !== 1) throw new BizError('要绑定的账号不可用，请联系管理员', 'USER_DISABLED');

    // 一个账号同时只挂一个微信：换微信必须先解绑，避免多人共用账号时分不清是谁
    if (user.wxOpenid && user.wxOpenid !== profile.openid) {
      throw new BizError('该账号已绑定其他微信，请先在网页端解绑后再绑定', 'USER_ALREADY_HAS_WX');
    }

    const occupied = await this.findByOpenid(profile.openid);
    if (occupied && occupied.id !== user.id) {
      throw new BizError(
        `该微信已绑定账号「${occupied.realName || occupied.username}」，请先在网页端解绑后再绑`,
        'WX_ALREADY_BOUND'
      );
    }

    // 原子消费绑定码：状态必须是「待用」，防止两个客户端同时用同一个码
    const consumed = await this.bindRepo
      .createQueryBuilder()
      .update(SysWxBindCode)
      .set({ status: 1, usedAt: new Date(), usedOpenid: profile.openid })
      .where('id = :id AND status = 0', { id: record.id })
      .execute();
    if (!consumed.affected) {
      throw new BizError('该绑定码已被使用，请让管理员重新生成', 'BIND_CODE_USED');
    }

    const patch: Partial<SysUser> = {
      wxOpenid: profile.openid,
      wxBoundAt: new Date(),
      lastLoginAt: new Date(),
    };
    if (profile.unionid) patch.wxUnionid = profile.unionid;
    if (profile.nickname) patch.wxNickname = profile.nickname;

    try {
      await this.userRepo.update(user.id, patch);
    } catch (e) {
      // 唯一索引 uk_wx_openid 兜底：并发绑定到不同账号时只有一个能成功
      const msg = String((e as Error).message || '');
      if (msg.includes('uk_wx_openid') || msg.includes('Duplicate entry')) {
        throw new BizError('该微信已绑定其他账号，请先在网页端解绑', 'WX_ALREADY_BOUND');
      }
      throw e;
    }
    return this.userRepo.findOne({ where: { id: user.id } });
  }

  async unbind(userId: number): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BizError('用户不存在', 'USER_NOT_FOUND', 404);
    await this.userRepo.update(userId, { wxOpenid: null, wxUnionid: '', wxBoundAt: null });
  }
}