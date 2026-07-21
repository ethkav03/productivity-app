import { apiClient } from '../api-client';
import { AttributeKey, Season, SeasonStatus } from '../types';

export interface SeasonFilters {
  status?: SeasonStatus;
}

export async function getSeasons(filters: SeasonFilters = {}) {
  const { data } = await apiClient.get<Season[]>('/seasons', { params: filters });
  return data;
}

export async function getSeason(id: string) {
  const { data } = await apiClient.get<Season>(`/seasons/${id}`);
  return data;
}

export interface CreateSeasonInput {
  title: string;
  description?: string;
  focus: AttributeKey[];
  endDate?: string;
}

export async function createSeason(input: CreateSeasonInput) {
  const { data } = await apiClient.post<Season>('/seasons', input);
  return data;
}

export async function updateSeason(id: string, input: Partial<CreateSeasonInput>) {
  const { data } = await apiClient.patch<Season>(`/seasons/${id}`, input);
  return data;
}

export async function closeSeason(id: string) {
  const { data } = await apiClient.post<Season>(`/seasons/${id}/close`);
  return data;
}

export async function deleteSeason(id: string) {
  await apiClient.delete(`/seasons/${id}`);
}
