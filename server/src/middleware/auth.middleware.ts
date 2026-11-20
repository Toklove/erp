import { Inject, Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { JwtService } from '@midwayjs/jwt';
import { BizError } from '../common/biz-error';

/** 无需登录即可访问的路径 */
const WHITE_LIST = [
  '/api/ping',
  '/api/health',
  '/api/auth/login',
  // 未登录时也要能调：微信一键登录、用绑定码绑定
  '/api/auth/wx-login',
  '/api/auth/wx-bind',
];

export interface LoginUser {
  uid: number;
  username: string;
  roles: string[];
}

@Middleware()
export class AuthMiddleware implements IMiddleware<Context, NextFunction> {
  @Inject()
  jwtService: JwtService;

  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const path = ctx.path;
      if (WHITE_LIST.some(p => path === p || path.startsWith(p + '/'))) {
        return next();
      }
      if (!path.startsWith('/api')) {
        return next();
      }

      const auth = ctx.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) {
        throw new BizError('未登录', 'UNAUTHORIZED', 401);
      }

      try {
        const payload = (await this.jwtService.verify(token)) as unknown as LoginUser;
        ctx.state.user = payload;
      } catch {
        throw new BizError('登录已过期，请重新登录', 'UNAUTHORIZED', 401);
      }

      return next();
    };
  }

  static getName() {
    return 'auth';
  }
}

/** 从 ctx 取当前登录用户 */
export function currentUser(ctx: Context): LoginUser {
  return (ctx.state as any).user || { uid: 0, username: 'anonymous', roles: [] };
}
