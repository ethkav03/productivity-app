import { apiClient } from '../api-client';
import { CompletionResult, Goal, GoalMilestone, GoalType, SkillRewardOverride } from '../types';

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
  seasonId?: string;
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

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  xpReward?: number;
}

export async function addMilestone(goalId: string, input: CreateMilestoneInput) {
  const { data } = await apiClient.post<GoalMilestone>(`/goals/${goalId}/milestones`, input);
  return data;
}

export interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  xpReward?: number;
  order?: number;
  completed?: boolean;
}

export async function updateMilestone(goalId: string, milestoneId: string, input: UpdateMilestoneInput) {
  const { data } = await apiClient.patch<{ milestone: GoalMilestone; completion?: CompletionResult }>(
    `/goals/${goalId}/milestones/${milestoneId}`,
    input,
  );
  return data;
}

export async function deleteMilestone(goalId: string, milestoneId: string) {
  await apiClient.delete(`/goals/${goalId}/milestones/${milestoneId}`);
}
