import { apiClient } from '../api-client';
import { LevelReward, UserLevelReward } from '../types';

export async function getLevelRewards() {
  const { data } = await apiClient.get<LevelReward[]>('/level-rewards');
  return data;
}

export async function getUnlockedLevelRewards() {
  const { data } = await apiClient.get<UserLevelReward[]>('/level-rewards/unlocked');
  return data;
}
