import { http } from './client';

export interface LoginResp {
  token: string;
  user: { id: number; username: string; realName: string };
}

export function login(username: string, password: string) {
  return http.post<LoginResp>('/api/auth/login', { username, password });
}
