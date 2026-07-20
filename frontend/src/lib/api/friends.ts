import { apiClient } from '../api-client';
import { Friend, FriendRequest } from '../types';

export async function getFriends() {
  const { data } = await apiClient.get<Friend[]>('/friends');
  return data;
}

export async function getFriendRequests() {
  const { data } = await apiClient.get<FriendRequest[]>('/friends/requests');
  return data;
}

export async function sendFriendRequest(username: string) {
  const { data } = await apiClient.post<FriendRequest>('/friends/requests', { username });
  return data;
}

export async function acceptFriendRequest(id: string) {
  const { data } = await apiClient.post<FriendRequest>(`/friends/requests/${id}/accept`);
  return data;
}

export async function declineFriendRequest(id: string) {
  const { data } = await apiClient.delete<{ id: string }>(`/friends/requests/${id}`);
  return data;
}

export async function removeFriend(friendshipId: string) {
  const { data } = await apiClient.delete<{ id: string }>(`/friends/${friendshipId}`);
  return data;
}
