import { Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { BizError } from '../common/biz-error';

/**
 * 统一异常出口。
 * - BizError：原样返回给前端
 * - 其他：500 + 日志（不要泄露堆栈给前端）
 */
@Middleware()
export class ErrorMiddleware implements IMiddleware<Context, NextFunction> {
  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      try {
        await next();
        // 统一响应包装：controller 只需 return data
        if (ctx.status === 404 || ctx.body === undefined) return;
      } catch (err: any) {
        if (err instanceof BizError) {
          ctx.status = err.status;
          ctx.body = { success: false, code: err.code, message: err.message };
          return;
        }
        // 框架抛出的 4xx（路由 404、方法不允许、参数校验等）不要当成 500
        const status = Number(err?.status || err?.statusCode) || 0;
        if (status >= 400 && status < 500) {
          ctx.status = status;
          ctx.body = {
            success: false,
            code: status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
            message:
              status === 404
                ? '请求的资源不存在'
                : String(err?.message || '请求参数有误').slice(0, 200),
          };
          return;
        }
        ctx.logger.error('[unhandled] %s\n%s', err?.message, err?.stack);
        ctx.status = 500;
        ctx.body = {
          success: false,
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : String(err?.message || err),
        };
      }
    };
  }

  static getName() {
    return 'error';
  }
}
