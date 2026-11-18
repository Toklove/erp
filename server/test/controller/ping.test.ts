import { createApp, close, createHttpRequest } from '@midwayjs/mock';
import { Framework } from '@midwayjs/koa';

/**
 * 冒烟测试：不依赖 MySQL（DISABLE_DB=1），验证路由 / 中间件 / 鉴权装配是否正常。
 * 库存过账等依赖数据库的逻辑，用独立测试文件 + 真实 MySQL 跑。
 */
describe('smoke', () => {
  let app: any;

  beforeAll(async () => {
    process.env.DISABLE_DB = '1';
    app = await createApp<Framework>({ appDir: process.cwd() });
  });

  afterAll(async () => {
    await close(app);
  });

  it('GET /api/ping 返回 pong', async () => {
    const res = await createHttpRequest(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pong).toBe(true);
  });

  it('未登录访问受保护接口返回 401', async () => {
    const res = await createHttpRequest(app).get('/api/md/items/page');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
