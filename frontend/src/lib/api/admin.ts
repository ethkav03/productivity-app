import { apiClient } from '../api-client';
import {
  Achievement,
  AdminCorrectionResult,
  AdminFriendship,
  AdminUserDetail,
  AdminUserSummary,
  AttributeKey,
  FriendshipStatus,
} from '../types';

export async function getAdminUsers(search?: string) {
  const { data } = await apiClient.get<AdminUserSummary[]>('/admin/users', { params: search ? { search } : undefined });
  return data;
}

export async function getAdminUser(id: string) {
  const { data } = await apiClient.get<AdminUserDetail>(`/admin/users/${id}`);
  return data;
}

export interface AdminUpdateUserInput {
  id: string;
  username?: string;
  email?: string;
  avatar?: string;
  isAdmin?: boolean;
}

export async function updateAdminUser({ id, ...body }: AdminUpdateUserInput) {
  const { data } = await apiClient.patch<AdminUserSummary>(`/admin/users/${id}`, body);
  return data;
}

export async function deleteAdminUser(id: string) {
  const { data } = await apiClient.delete<{ id: string; deleted: true }>(`/admin/users/${id}`);
  return data;
}

export interface AdminAdjustXpInput {
  userId: string;
  amount: number;
  attributeKey?: AttributeKey;
  note?: string;
}

export async function adjustAdminUserXp({ userId, ...body }: AdminAdjustXpInput) {
  const { data } = await apiClient.post<AdminCorrectionResult>(`/admin/users/${userId}/xp`, body);
  return data;
}

export async function getAdminAchievements() {
  const { data } = await apiClient.get<Achievement[]>('/admin/achievements');
  return data;
}

export async function grantAdminAchievement(userId: string, achievementId: string) {
  const { data } = await apiClient.post(`/admin/users/${userId}/achievements`, { achievementId });
  return data;
}

export async function revokeAdminAchievement(userId: string, achievementId: string) {
  const { data } = await apiClient.delete(`/admin/users/${userId}/achievements/${achievementId}`);
  return data;
}

export async function getAdminFriendships() {
  const { data } = await apiClient.get<AdminFriendship[]>('/admin/friendships');
  return data;
}

export interface AdminCreateFriendshipInput {
  requesterUsername: string;
  addresseeUsername: string;
  status?: FriendshipStatus;
}

export async function createAdminFriendship(input: AdminCreateFriendshipInput) {
  const { data } = await apiClient.post<AdminFriendship>('/admin/friendships', input);
  return data;
}

export async function acceptAdminFriendship(id: string) {
  const { data } = await apiClient.patch<AdminFriendship>(`/admin/friendships/${id}/accept`);
  return data;
}

export async function deleteAdminFriendship(id: string) {
  const { data } = await apiClient.delete<{ id: string; deleted: true }>(`/admin/friendships/${id}`);
  return data;
}
