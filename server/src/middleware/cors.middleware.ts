import { Config, Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';

/**
 * 跨域（可选）。
 *
 * 默认不启用：微信云托管 / docker compose 都是「web 与 API 同源」，同源不需要 CORS；
 * 小程序真机走 wx.request，也不受浏览器同源策略限制。
 * 只有把小程序 H5 版单独部署到别的域名时，才需要设 CORS_ORIGINS=https://h5.example.com（逗号分隔，* 表示全部）。
 */
@Middleware()
export class CorsMiddleware implements IMiddleware<Context, NextFunction> {
  @Config('cors')
  cfg: { origins?: string };

  private allowed(origin: string): string | null {
    const raw = (this.cfg?.origins || '').trim();
    if (!raw) return null;
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.includes('*')) return '*';
    return list.includes(origin) ? origin : null;
  }

  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      const origin = ctx.get('Origin');
      if (!origin) return next();

      const allow = this.allowed(origin);
      if (allow) {
        ctx.set('Access-Control-Allow-Origin', allow);
        ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        ctx.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        ctx.set('Access-Control-Max-Age', '86400');
        ctx.set('Vary', 'Origin');
        // 云托管下若前面还有一层网关，带上凭证时才需要下面这行；当前用 Bearer，不需要 cookie
        if (allow !== '*') ctx.set('Access-Control-Allow-Credentials', 'true');
      }

      if (ctx.method === 'OPTIONS') {
        ctx.status = allow ? 204 : 403;
        return;
      }
      return next();
    };
  }

  static getName() {
    return 'cors';
  }
}