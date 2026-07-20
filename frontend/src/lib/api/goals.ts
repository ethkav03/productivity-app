import { apiClient } from '../api-client';
import { CompletionResult, Goal, GoalType, SkillRewardOverride } from '../types';

export interface GoalFilters {
  status?: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

export async function getGoals(filters: GoalFilters = {}) {
  const { data } = await apiClient.get<Goal[]>('/goals', { params: filters });
  return data;
}

export async function getGoal(id: string) {
  const { data } = await apiClient.get<Goal>(`/goals/${id}`);
  return data;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  type: GoalType;
  targetValue?: number;
  unit?: string;
  targetDate?: string;
  xpReward?: number;
  skillIds?: string[];
  skillRewardOverrides?: SkillRewardOverride[];
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;
}

export async function createGoal(input: CreateGoalInput) {
  const { data } = await apiClient.post<Goal>('/goals', input);
  return data;
}

export async function updateGoal(id: string, input: Partial<CreateGoalInput> & { status?: string }) {
  const { data } = await apiClient.patch<Goal>(`/goals/${id}`, input);
  return data;
}

export async function progressGoal(id: string, input: { value: number }) {
  const { data } = await apiClient.post<{ goal: Goal; completion?: CompletionResult }>(
    `/goals/${id}/progress`,
    input,
  );
  return data;
}

export async function deleteGoal(id: string) {
  await apiClient.delete(`/goals/${id}`);
}
