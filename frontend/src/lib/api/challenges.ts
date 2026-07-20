import { apiClient } from '../api-client';
import { Challenge } from '../types';

/** Ensures the caller has an up-to-date DAILY and WEEKLY challenge, then returns whichever haven't expired. Entirely system-generated - no create/edit endpoints. */
export async function getChallenges() {
  const { data } = await apiClient.get<Challenge[]>('/challenges');
  return data;
}
