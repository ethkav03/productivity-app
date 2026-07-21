import { apiClient } from '../api-client';
import { CompletionResult, Habit, HabitFrequency, SkillRewardOverride } from '../types';

export async function getHabits() {
  const { data } = await apiClient.get<Habit[]>('/habits');
  return data;
}

export interface CreateHabitInput {
  title: string;
  description?: string;
  frequency: HabitFrequency;
  daysOfWeek?: number[];
  timesPerWeek?: number;
  timeOfDay?: string;
  xpReward?: number;
  goalId?: string;
  skillIds?: string[];
  skillRewardOverrides?: SkillRewardOverride[];
  attributeBonuses?: Array<{ attributeId: string; amount: number }>;
}

export async function createHabit(input: CreateHabitInput) {
  const { data } = await apiClient.post<Habit>('/habits', input);
  return data;
}

export async function updateHabit(id: string, input: Partial<CreateHabitInput> & { isActive?: boolean }) {
  const { data } = await apiClient.patch<Habit>(`/habits/${id}`, input);
  return data;
}

export async function completeHabit(id: string) {
  const { data } = await apiClient.post<CompletionResult>(`/habits/${id}/complete`);
  return data;
}

export async function deleteHabit(id: string) {
  await apiClient.delete(`/habits/${id}`);
}
