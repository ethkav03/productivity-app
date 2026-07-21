import { apiClient } from '../api-client';
import { RecommendationCard, WeeklyReview } from '../types';

export async function getRecommendations() {
  const { data } = await apiClient.get<RecommendationCard[]>('/recommendations');
  return data;
}

export async function getWeeklyReview() {
  const { data } = await apiClient.get<WeeklyReview>('/recommendations/weekly-review');
  return data;
}
