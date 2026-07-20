import { apiClient } from '../api-client';
import {
  AnalyticsActivityDay,
  AnalyticsAttributeProgress,
  AnalyticsOverview,
  AnalyticsSkillProgress,
  AnalyticsXpPoint,
  XPSourceType,
  XpHistoryEvent,
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

export interface XpHistoryParams {
  sourceType?: XPSourceType;
  limit?: number;
  /** ISO timestamp cursor - returns events strictly older than this, for "load more" pagination. */
  before?: string;
}

export async function getXpHistory(params: XpHistoryParams = {}) {
  const { data } = await apiClient.get<XpHistoryEvent[]>('/analytics/xp-history', { params });
  return data;
}
