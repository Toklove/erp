import { http } from './client';

export interface LoginUser {
  id: number;
  username: string;
  realName: string;
}

export interface LoginResp {
  token: string;
  user: LoginUser;
}

export function login(username: string, password: string): Promise<LoginResp> {
  return http.post<LoginResp>('/api/auth/login', { username, password });
}

export function me(): Promise<unknown> {
  return http.get<unknown>('/api/auth/me');
}

/** 未绑定：后端返回 bound=false，需要让用户输入后台生成的绑定码 */
export interface WxLoginUnbound {
  bound: false;
  wxConfigured: boolean;
}

export interface WxLoginBound extends LoginResp {
  bound: true;
}

export type WxLoginResp = WxLoginUnbound | WxLoginBound;

/**
 * 微信一键登录。
 * wxCode 是 wx.login() 的 code；走云托管时后端直接读 X-WX-OPENID，可以不传。
 */
export function wxLogin(wxCode?: string): Promise<WxLoginResp> {
  return http.post<WxLoginResp>('/api/auth/wx-login', { wxCode });
}

/** 用后台生成的 6 位绑定码把当前微信绑到账号上，成功后直接返回 token */
export function wxBind(bindCode: string, wxCode?: string): Promise<WxLoginBound> {
  return http.post<WxLoginBound>('/api/auth/wx-bind', { bindCode, wxCode });
}