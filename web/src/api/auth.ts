import { http } from './client';

export interface LoginResp {
  token: string;
  user: { id: number; username: string; realName: string };
}

export function login(username: string, password: string) {
  return http.post<LoginResp>('/api/auth/login', { username, password });
}

/** 当前账号的微信绑定状态 */
export interface WxBindStatus {
  bound: boolean;
  nickname: string;
  boundAt: string | null;
  /** 服务端是否配置了 WX_APPID / WX_SECRET */
  configured: boolean;
}

export interface WxBindCode {
  code: string;
  expireAt: string;
  ttlMinutes: number;
}

export function wxStatus() {
  return http.get<WxBindStatus>('/api/auth/wx-status');
}

/** 生成一次性绑定码（会作废该账号之前未使用的码） */
export function wxBindCode() {
  return http.post<WxBindCode>('/api/auth/wx-bind-code');
}

export function wxUnbind() {
  return http.post<{ bound: boolean }>('/api/auth/wx-unbind');
}