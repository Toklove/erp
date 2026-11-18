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
