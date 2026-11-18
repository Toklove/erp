/**
 * 业务异常：可直接暴露给前端的错误信息。
 * 系统异常（数据库/代码 bug）不要用这个类，交给 ErrorMiddleware 兜底并打日志。
 */
export class BizError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = 'BIZ_ERROR', status = 400) {
    super(message);
    this.name = 'BizError';
    this.code = code;
    this.status = status;
  }
}
