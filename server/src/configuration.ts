import { Configuration, App, CommonJSFileDetector } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as validation from '@midwayjs/validation';
import * as typeorm from '@midwayjs/typeorm';
import * as jwt from '@midwayjs/jwt';
import * as info from '@midwayjs/info';
import { join } from 'path';
import { AuthMiddleware } from './middleware/auth.middleware';
import { ErrorMiddleware } from './middleware/error.middleware';

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
    // 顺序很重要：先兜异常，再鉴权
    this.app.useMiddleware([ErrorMiddleware, AuthMiddleware]);
  }
}
