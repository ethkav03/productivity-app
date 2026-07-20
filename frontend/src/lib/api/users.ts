import { apiClient } from '../api-client';
import { PublicUser } from '../types';

export async function getMe() {
  const { data } = await apiClient.get<PublicUser>('/users/me');
  return data;
}

export async function updateMe(input: { username?: string; avatar?: string; equippedTitleId?: string | null }) {
  const { data } = await apiClient.patch<PublicUser>('/users/me', input);
  return data;
}
