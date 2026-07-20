import { apiClient } from '../api-client';
import { AttributeKey, LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from '../types';

interface LeaderboardParams {
  metric: LeaderboardMetric;
  attributeKey?: AttributeKey;
  period?: LeaderboardPeriod;
}

export async function getLeaderboard(params: LeaderboardParams) {
  const { data } = await apiClient.get<LeaderboardEntry[]>('/leaderboard', { params });
  return data;
}
