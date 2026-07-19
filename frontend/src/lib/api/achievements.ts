import { apiClient } from '../api-client';
import { Achievement, UserAchievement } from '../types';

export async function getAchievements() {
  const { data } = await apiClient.get<Achievement[]>('/achievements');
  return data;
}

export async function getUnlockedAchievements() {
  const { data } = await apiClient.get<UserAchievement[]>('/achievements/unlocked');
  return data;
}
