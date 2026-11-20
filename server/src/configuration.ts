import { Configuration, App, CommonJSFileDetector } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as validation from '@midwayjs/validation';
import * as typeorm from '@midwayjs/typeorm';
import * as jwt from '@midwayjs/jwt';
import * as info from '@midwayjs/info';
import { join } from 'path';
import { AuthMiddleware } from './middleware/auth.middleware';
import { ErrorMiddleware } from './middleware/error.middleware';
import { CorsMiddleware } from './middleware/cors.middleware';
import { StaticSiteMiddleware } from './middleware/static.middleware';

/**
 * DISABLE_DB=1 时不加载 ORM 组件。
 * 用途：前端联调、CI 冒烟测试、本机还没装 MySQL 时先跑通路由与鉴权。
 * 生产环境绝对不要设置这个变量。
 */
const enableDb = process.env.DISABLE_DB !== '1';

const components: any[] = [koa, validation, jwt, { component: info, enabledEnvironment: ['local'] }];
if (enableDb) {
  components.splice(2, 0, typeorm);
}

@Configuration({
  imports: components,
  importConfigs: [join(__dirname, './config')],
  detector: new CommonJSFileDetector(),
})
export class MainConfiguration {
  @App('koa')
  app: koa.Application;

  async onReady() {
    // 顺序很重要：
    // 1. ErrorMiddleware 兜住所有抛错，保证 JSON 错误体
    // 2. CorsMiddleware 只处理跨域头与预检（默认不启用）
    // 3. StaticSiteMiddleware 提供 web 构建产物（云托管单端口部署时前后端同源）
    // 4. AuthMiddleware 才是最内层的鉴权，只拦 /api
    this.app.useMiddleware([ErrorMiddleware, CorsMiddleware, StaticSiteMiddleware, AuthMiddleware]);
  }

  /**
   * 云托管缩容时会先发 SIGTERM，等进程退出后才强制杀掉。
   * 这里主动 close()，让建立中的请求有机会写完；10s 后无论如何退出。
   */
  async onServerReady() {
    let stopping = false;
    const shutdown = (signal: string) => {
      if (stopping) return;
      stopping = true;
      // eslint-disable-next-line no-console
      console.log(`[server] 收到 ${signal}，开始优雅退出…`);
      const timer = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('[server] 优雅退出超时，强制结束');
        process.exit(0);
      }, 10_000);
      timer.unref?.();
      const app: any = this.app;
      Promise.resolve(typeof app.close === 'function' ? app.close() : undefined)
        .catch(() => undefined)
        .finally(() => process.exit(0));
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }
}