import { Body, Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { AuthService, type WxProfile } from '../service/auth.service';
import { BizError } from '../common/biz-error';
import { currentUser } from '../middleware/auth.middleware';

/**
 * 取微信身份：
 * 1) 云托管内网调用（wx.cloud.callContainer）会由平台注入 X-WX-OPENID，直接信这个头；
 * 2) 小程序直连（wx.request）则传 wx.login 拿到的 code，这里换 openid。
 * 两者都没有就报错，交给客户端引导。
 */
function resolveProfile(ctx: Context, service: AuthService, body: { wxCode?: string; nickname?: string }): Promise<WxProfile> {
  const headerOpenid = (ctx.get('X-WX-OPENID') || '').trim();
  const nickname = (body?.nickname || '').trim().slice(0, 32);
  if (headerOpenid && headerOpenid !== 'undefined') {
    return Promise.resolve({
      openid: headerOpenid,
      unionid: (ctx.get('X-WX-UNIONID') || '').trim(),
      nickname,
    });
  }
  const code = (body?.wxCode || '').trim();
  if (!code) {
    throw new BizError('缺少微信登录凭证，请在小程序内重新点击微信登录', 'WX_NO_CREDENTIAL');
  }
  return service.code2Session(code).then((r) => ({ ...r, nickname }));
}

@Controller('/api/auth')
export class AuthController {
  @Inject()
  authService: AuthService;

  @Inject()
  jwtService: JwtService;

  @Inject()
  ctx: Context;

  @Post('/login')
  async login(@Body() body: { username?: string; password?: string }) {
    const username = (body?.username || '').trim();
    const password = body?.password || '';
    if (!username || !password) throw new BizError('请输入用户名和密码');

    const user = await this.authService.validate(username, password);
    const token = await this.jwtService.sign(this.authService.toLoginUser(user));
    return {
      success: true,
      data: {
        token,
        user: { id: user.id, username: user.username, realName: user.realName },
      },
    };
  }

  @Get('/me')
  async me() {
    return { success: true, data: currentUser(this.ctx) };
  }

  // ------------------------------------------------------------
  // 小程序：微信一键登录
  // ------------------------------------------------------------

  /**
   * 微信一键登录。
   * - 该微信已绑定用户：直接返回 token；
   * - 未绑定：返回 bound=false，客户端提示输入后台生成的 6 位绑定码。
   */
  @Post('/wx-login')
  async wxLogin(@Body() body: { wxCode?: string; nickname?: string }) {
    const profile = await resolveProfile(this.ctx, this.authService, body || {});
    const user = await this.authService.loginByOpenid(profile);

    if (!user) {
      return {
        success: true,
        data: {
          bound: false as const,
          wxConfigured: this.authService.wxConfigured,
        },
      };
    }

    if (user.status !== 1) throw new BizError('该账号已被停用，请联系管理员', 'USER_DISABLED', 403);
    const token = await this.jwtService.sign(this.authService.toLoginUser(user));
    return {
      success: true,
      data: {
        bound: true as const,
        token,
        user: { id: user.id, username: user.username, realName: user.realName },
      },
    };
  }

  /** 用后台生成的绑定码把当前微信绑定到管理员账号，成功后直接下发 token */
  @Post('/wx-bind')
  async wxBind(@Body() body: { bindCode?: string; wxCode?: string; nickname?: string }) {
    const bindCode = (body?.bindCode || '').trim();
    if (!bindCode) throw new BizError('请输入绑定码', 'BIND_CODE_REQUIRED');

    const profile = await resolveProfile(this.ctx, this.authService, body || {});
    const user = await this.authService.bindByCode(profile, bindCode);
    if (user.status !== 1) throw new BizError('该账号已被停用，请联系管理员', 'USER_DISABLED', 403);

    const token = await this.jwtService.sign(this.authService.toLoginUser(user));
    return {
      success: true,
      data: {
        bound: true as const,
        token,
        user: { id: user.id, username: user.username, realName: user.realName },
      },
    };
  }

  /** 当前登录账号的微信绑定状态（网页端展示用） */
  @Get('/wx-status')
  async wxStatus() {
    const me = currentUser(this.ctx);
    const status = await this.authService.bindStatus(me.uid);
    return { success: true, data: status };
  }

  /** 生成一次性绑定码（网页端「绑定微信」弹窗调用） */
  @Post('/wx-bind-code')
  async wxBindCode() {
    const me = currentUser(this.ctx);
    const result = await this.authService.createBindCode(me.uid);
    return { success: true, data: result };
  }

  /** 解绑当前账号的微信，之后小程序需重新绑定 */
  @Post('/wx-unbind')
  async wxUnbind() {
    const me = currentUser(this.ctx);
    await this.authService.unbind(me.uid);
    return { success: true, data: { bound: false } };
  }
}