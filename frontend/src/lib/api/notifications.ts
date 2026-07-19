import { apiClient } from '../api-client';
import { AppNotification } from '../types';

export async function getNotifications(unreadOnly = false) {
  const { data } = await apiClient.get<AppNotification[]>('/notifications', {
    params: unreadOnly ? { unread: 'true' } : undefined,
  });
  return data;
}

export async function markNotificationRead(id: string) {
  const { data } = await apiClient.patch<AppNotification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  await apiClient.patch('/notifications/read-all');
}
