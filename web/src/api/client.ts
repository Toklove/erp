const TOKEN_KEY = 'erp_token';
const USER_KEY = 'erp_user';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setUser(user: unknown) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser<T>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as T) : null;
}

export interface ApiResult<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
}

/** 统一请求：自动带 token，非 2xx 或 success=false 一律抛错 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as ApiResult<T>;

  if (res.status === 401) {
    clearAuth();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new Error(body.message || '登录已过期');
  }
  if (!res.ok || body.success === false) {
    throw new Error(body.message || `请求失败 (${res.status})`);
  }
  return body.data;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
};
