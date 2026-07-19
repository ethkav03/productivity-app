import { apiClient } from '../api-client';
import { Attribute, AttributeDetail } from '../types';

export async function getAttributes() {
  const { data } = await apiClient.get<Attribute[]>('/attributes');
  return data;
}

export async function getAttribute(id: string) {
  const { data } = await apiClient.get<AttributeDetail>(`/attributes/${id}`);
  return data;
}
