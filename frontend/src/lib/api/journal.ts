import { apiClient } from '../api-client';
import { JournalCapacity, JournalCorrelations, JournalDaySummary, JournalEntry } from '../types';

export async function getJournalDay(date?: string) {
  const { data } = await apiClient.get<JournalDaySummary>('/journal', { params: date ? { date } : undefined });
  return data;
}

export async function getJournalHistory(days?: number) {
  const { data } = await apiClient.get<JournalEntry[]>('/journal/history', { params: days ? { days } : undefined });
  return data;
}

export async function getJournalCapacity() {
  const { data } = await apiClient.get<JournalCapacity>('/journal/capacity');
  return data;
}

export async function getJournalCorrelations() {
  const { data } = await apiClient.get<JournalCorrelations>('/journal/correlations');
  return data;
}

export interface UpsertJournalEntryInput {
  mood?: number;
  energyLevel?: number;
  sleepHours?: number;
  stressLevel?: number;
  note?: string;
}

export async function upsertJournalEntry(date: string, input: UpsertJournalEntryInput) {
  const { data } = await apiClient.put<JournalEntry>(`/journal/${date}`, input);
  return data;
}
