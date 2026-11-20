import { App, Controller, Get, Inject } from '@midwayjs/core';
import type { Application, Context } from '@midwayjs/koa';

interface DbHealth {
  ok: boolean;
  mode: 'disabled' | 'typeorm';
  latencyMs?: number;
  error?: string;
}

@Controller('/api')
export class PingController {
  @App()
  app: Application;

  @Inject()
  ctx: Context;

  /** 存活探针：只证明进程还在跑，不碰数据库 */
  @Get('/ping')
  async ping() {
    return { success: true, data: { pong: true, ts: Date.now() } };
  }

  /** 就绪探针：数据库不可用返回 503，云托管据此不把流量导进来 */
  @Get('/health')
  async health() {
    const db = await this.checkDb();
    const data = {
      status: db.ok ? 'UP' : 'DEGRADED',
      uptime: Math.round(process.uptime()),
      db,
      wx: {
        appidConfigured: Boolean(process.env.WX_APPID),
        secretConfigured: Boolean(process.env.WX_SECRET),
      },
    };
    if (!db.ok) {
      // 真的返回 503：云托管 / docker HEALTHCHECK 都按状态码判断就绪
      this.ctx.status = 503;
      return { success: false, message: '数据库不可用', data };
    }
    return { success: true, data };
  }

  private async checkDb(): Promise<DbHealth> {
    if (process.env.DISABLE_DB === '1') return { ok: true, mode: 'disabled' };
    const started = Date.now();
    try {
      // 动态取类，避免 DISABLE_DB=1 时把 typeorm 组件强行启起来
      const { TypeORMDataSourceManager } = await import('@midwayjs/typeorm');
      const manager: any = await this.app
        .getApplicationContext()
        .getAsync(TypeORMDataSourceManager as any);
      const name = manager.getDefaultDataSourceName();
      const dataSource = await manager.getDataSource(name);
      await dataSource.query('SELECT 1');
      return { ok: true, mode: 'typeorm', latencyMs: Date.now() - started };
    } catch (err: any) {
      // /api/health 是公开接口，生产环境不要回显数据库地址/驱动细节
      const raw = err?.message || String(err);
      return {
        ok: false,
        mode: 'typeorm',
        error: process.env.NODE_ENV === 'production' ? '数据库连接失败' : raw,
      };
    }
  }
}