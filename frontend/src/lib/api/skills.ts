import { apiClient } from '../api-client';
import { DefaultSkillDefinition, Skill, SkillDetail } from '../types';

export async function getSkills() {
  const { data } = await apiClient.get<Skill[]>('/skills');
  return data;
}

export async function getSkillSuggestions() {
  const { data } = await apiClient.get<DefaultSkillDefinition[]>('/skills/suggestions');
  return data;
}

export async function getSkill(id: string) {
  const { data } = await apiClient.get<SkillDetail>(`/skills/${id}`);
  return data;
}

export async function createSkill(input: { name: string; description?: string; icon?: string }) {
  const { data } = await apiClient.post<Skill>('/skills', input);
  return data;
}

export async function updateSkill(id: string, input: Partial<{ name: string; description: string; icon: string }>) {
  const { data } = await apiClient.patch<Skill>(`/skills/${id}`, input);
  return data;
}

export async function deleteSkill(id: string) {
  await apiClient.delete(`/skills/${id}`);
}
