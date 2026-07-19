import { apiClient } from '../api-client';
import {
  AnalyticsActivityDay,
  AnalyticsAttributeProgress,
  AnalyticsOverview,
  AnalyticsSkillProgress,
  AnalyticsXpPoint,
  XPTransaction,
} from '../types';

export async function getAnalyticsOverview() {
  const { data } = await apiClient.get<AnalyticsOverview>('/analytics/overview');
  return data;
}

export async function getAnalyticsXp(days = 30) {
  const { data } = await apiClient.get<AnalyticsXpPoint[]>('/analytics/xp', { params: { days } });
  return data;
}

export async function getAnalyticsSkills() {
  const { data } = await apiClient.get<AnalyticsSkillProgress[]>('/analytics/skills');
  return data;
}

export async function getAnalyticsAttributes() {
  const { data } = await apiClient.get<AnalyticsAttributeProgress[]>('/analytics/attributes');
  return data;
}

export async function getAnalyticsActivity(days = 84) {
  const { data } = await apiClient.get<AnalyticsActivityDay[]>('/analytics/activity', { params: { days } });
  return data;
}

export async function getAnalyticsFeed(limit = 15) {
  const { data } = await apiClient.get<XPTransaction[]>('/analytics/feed', { params: { limit } });
  return data;
}
