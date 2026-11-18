import { Body, Controller, Get, Inject, Post } from '@midwayjs/core';
import type { Context } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { AuthService } from '../service/auth.service';
import { BizError } from '../common/biz-error';
import { currentUser } from '../middleware/auth.middleware';

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
}
