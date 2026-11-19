/**
 * 请求封装（小程序端）。
 *
 * 与 web 端 web/src/api/client.ts 保持同一套约定：
 * - 后端统一返回 { success, data, message }
 * - 带 Authorization: Bearer <token>
 * - 401 清登录态并跳登录页
 * 区别只有存储方式（uni storage 取代 localStorage）和请求器（uni.request 取代 fetch）。
 */

const TOKEN_KEY = 'erp_token';
const USER_KEY = 'erp_user';
const BASE_KEY = 'erp_api_base';

export interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  data?: unknown;
}

/**
 * 默认后端地址。
 * 小程序里 uni.request 必须带完整域名（不能像 H5 那样走 /api 相对路径），
 * 所以小程序端默认指向本机 7001；真机/上线时在登录页把它改成实际域名即可（会存到本地）。
 * H5 端留空，表示与页面同源（开发走 vite 代理，部署走 nginx 反代）。
 */
function defaultBaseUrl(): string {
  let url = 'http://127.0.0.1:7001';
  // #ifdef H5
  url = '';
  // #endif
  return url;
}

export function getBaseUrl(): string {
  const saved = (uni.getStorageSync(BASE_KEY) as string) || '';
  const base = saved || defaultBaseUrl();
  // H5 空地址表示同源，不能返回 '/'，否则拼出来是 '//api/...'
  return base.replace(/\/+$/, '');
}

export function setBaseUrl(url: string): void {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (trimmed) uni.setStorageSync(BASE_KEY, trimmed);
  else uni.removeStorageSync(BASE_KEY);
}

export function getToken(): string {
  return (uni.getStorageSync(TOKEN_KEY) as string) || '';
}

export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function setUser(user: unknown): void {
  uni.setStorageSync(USER_KEY, JSON.stringify(user));
}

export function getUser<T>(): T | null {
  const raw = uni.getStorageSync(USER_KEY) as string;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  uni.removeStorageSync(TOKEN_KEY);
  uni.removeStorageSync(USER_KEY);
}

let redirecting = false;

/** 401 统一跳登录页；reLaunch 避免用户可以返回到需要登录的页面 */
export function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  const pages = getCurrentPages();
  const current = pages.length ? pages[pages.length - 1].route : '';
  if (current === 'pages/login/index') {
    redirecting = false;
    return;
  }
  uni.reLaunch({
    url: '/pages/login/index',
    complete: () => {
      redirecting = false;
    },
  });
}

/** 页面进入时调用：没登录就跳登录页并返回 false */
export function ensureLogin(): boolean {
  if (getToken()) return true;
  redirectToLogin();
  return false;
}

function describeNetworkError(err: { errMsg?: string }, url: string): string {
  const raw = err?.errMsg || '网络异常';
  if (raw.indexOf('timeout') >= 0) return '请求超时，请检查网络后重试';
  if (raw.indexOf('domain') >= 0 || raw.indexOf('url not in') >= 0) {
    return `请求域名未配置：请在微信公众平台把 ${url} 加入 request 合法域名（开发阶段可勾选「不校验合法域名」）`;
  }
  return `无法连接服务器：${raw}。请确认后端已启动、地址正确（当前 ${url}）`;
}

/** 统一请求：自动带 token，非 2xx 或 success=false 一律抛错 */
export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const header: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) header.Authorization = `Bearer ${token}`;

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method: options.method || 'GET',
      data: options.data as Record<string, unknown> | undefined,
      header,
      timeout: 20000,
      success: (res) => {
        const body = (res.data || {}) as ApiResult<T>;
        if (res.statusCode === 401) {
          clearAuth();
          redirectToLogin();
          reject(new Error(body.message || '登录已过期，请重新登录'));
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || body.success === false) {
          reject(new Error(body.message || `请求失败 (${res.statusCode})`));
          return;
        }
        resolve(body.data);
      },
      fail: (err) => {
        reject(new Error(describeNetworkError(err as { errMsg?: string }, url)));
      },
    });
  });
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', data: data ?? {} }),
};
