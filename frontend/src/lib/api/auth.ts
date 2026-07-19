import { apiClient } from '../api-client';
import { PublicUser } from '../types';

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export async function registerRequest(input: { email: string; username: string; password: string }) {
  const { data } = await apiClient.post<AuthSession>('/auth/register', input);
  return data;
}

export async function loginRequest(input: { email: string; password: string }) {
  const { data } = await apiClient.post<AuthSession>('/auth/login', input);
  return data;
}

export async function logoutRequest() {
  await apiClient.post('/auth/logout');
}
