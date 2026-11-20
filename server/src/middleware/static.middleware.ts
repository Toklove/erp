import { Config, Middleware, IMiddleware } from '@midwayjs/core';
import { Context, NextFunction } from '@midwayjs/koa';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';
import { gzipSync } from 'zlib';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

/** 可以顺手 gzip 的文本类型 */
const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.map',
  '.svg',
  '.txt',
]);

/** gzip 结果缓存：文件不变就不重复压缩（云托管实例内存小，上限 200 个文件） */
const gzipCache = new Map<string, { mtimeMs: number; buf: Buffer }>();
const GZIP_CACHE_MAX = 200;

/**
 * 单容器托管 web 构建产物（微信云托管只暴露一个端口，API 与页面必须同源）。
 *
 * - 命中真实文件 → 直接返回；`/assets/*` 带 hash，强缓存一年
 * - 没命中且不像静态文件（无扩展名）→ 回落 index.html，交给前端路由
 * - `/api` 一律放行给后续中间件
 *
 * 目录优先级：WEB_DIST 环境变量 > <cwd>/web/dist。找不到目录时静默放行，
 * 本机开发（vite 5173）和纯 API 部署都不受影响。
 */
@Middleware()
export class StaticSiteMiddleware implements IMiddleware<Context, NextFunction> {
  @Config('staticSite')
  cfg: { dir?: string; disabled?: boolean };

  private resolved: { dir: string; ok: boolean } | null = null;

  private async rootDir(): Promise<string | null> {
    if (this.cfg?.disabled) return null;
    const dir = resolve(this.cfg?.dir || join(process.cwd(), 'web', 'dist'));
    if (!this.resolved || this.resolved.dir !== dir) {
      let ok = false;
      try {
        ok = (await stat(dir)).isDirectory();
      } catch {
        ok = false;
      }
      this.resolved = { dir, ok };
    }
    return this.resolved.ok ? dir : null;
  }

  resolve() {
    return async (ctx: Context, next: NextFunction) => {
      if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return next();
      if (ctx.path.startsWith('/api')) return next();

      const root = await this.rootDir();
      if (!root) return next();

      let pathname: string;
      try {
        pathname = decodeURIComponent(ctx.path);
      } catch {
        return next();
      }
      const target = resolve(join(root, pathname));
      // 目录穿越保护：解析后必须仍在 root 内
      if (target !== root && !target.startsWith(root + sep)) return next();

      let file: string | null = null;
      try {
        const s = await stat(target);
        if (s.isFile()) file = target;
        else if (s.isDirectory()) {
          const indexPath = join(target, 'index.html');
          if ((await stat(indexPath)).isFile()) file = indexPath;
        }
      } catch {
        file = null;
      }

      const ext = extname(pathname).toLowerCase();
      // 未命中且不像静态资源 → SPA 回落
      if (!file) {
        if (ext && ext !== '.html') return next();
        file = join(root, 'index.html');
        if (!(await stat(file).then(s => s.isFile()).catch(() => false))) return next();
      }

      const fileStat = await stat(file);
      const isHashedAsset = file.includes(`${sep}assets${sep}`);
      const fileName = file;
      const mime = MIME[extname(fileName).toLowerCase()] || 'application/octet-stream';

      ctx.set('Content-Type', mime);
      ctx.set(
        'Cache-Control',
        isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
      );
      ctx.set('Last-Modified', fileStat.mtime.toUTCString());
      ctx.set('X-Content-Type-Options', 'nosniff');

      if (ctx.method === 'HEAD') {
        ctx.status = 200;
        ctx.set('Content-Length', String(fileStat.size));
        return; // 不进入后续中间件
      }

      const compressible = COMPRESSIBLE.has(extname(fileName).toLowerCase());
      if (compressible && String(ctx.get('Accept-Encoding') || '').includes('gzip')) {
        let cached = gzipCache.get(fileName);
        if (!cached || cached.mtimeMs !== fileStat.mtimeMs) {
          const raw = await readFile(fileName);
          cached = { mtimeMs: fileStat.mtimeMs, buf: gzipSync(raw) };
          if (gzipCache.size >= GZIP_CACHE_MAX) gzipCache.clear();
          gzipCache.set(fileName, cached);
        }
        ctx.set('Content-Encoding', 'gzip');
        ctx.set('Vary', 'Accept-Encoding');
        ctx.body = cached.buf;
      } else {
        ctx.body = createReadStream(fileName);
      }
      ctx.status = 200;
      return; // 静态资源请求到此为止，不再走路由
    };
  }

  static getName() {
    return 'staticSite';
  }
}