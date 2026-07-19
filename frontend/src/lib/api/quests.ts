import { apiClient } from '../api-client';
import { CompletionResult, Quest, QuestDifficulty, QuestType } from '../types';

export interface QuestFilters {
  status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  goalId?: string;
}

export async function getQuests(filters: QuestFilters = {}) {
  const { data } = await apiClient.get<Quest[]>('/quests', { params: filters });
  return data;
}

export async function getQuest(id: string) {
  const { data } = await apiClient.get<Quest>(`/quests/${id}`);
  return data;
}

export interface CreateQuestInput {
  title: string;
  description?: string;
  type: QuestType;
  difficulty: QuestDifficulty;
  xpReward?: number;
  goalId?: string;
  skillIds?: string[];
  deadline?: string;
}

export async function createQuest(input: CreateQuestInput) {
  const { data } = await apiClient.post<Quest>('/quests', input);
  return data;
}

export async function updateQuest(id: string, input: Partial<CreateQuestInput> & { status?: string }) {
  const { data } = await apiClient.patch<Quest>(`/quests/${id}`, input);
  return data;
}

export async function completeQuest(id: string) {
  const { data } = await apiClient.post<CompletionResult>(`/quests/${id}/complete`);
  return data;
}

export async function deleteQuest(id: string) {
  await apiClient.delete(`/quests/${id}`);
}
