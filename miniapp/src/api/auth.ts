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
