import { fetchApi } from './core';
import type { CombatTemplateSlotData, CombatTemplateData } from '@adventure/shared';

export async function getTemplates() {
  return fetchApi<{ templates: CombatTemplateData[] }>('/api/v1/templates');
}

export async function getActiveTemplate() {
  return fetchApi<{ slots: CombatTemplateSlotData[] }>('/api/v1/templates/active');
}

export async function createTemplate(name: string, slots: Omit<CombatTemplateSlotData, 'id'>[]) {
  return fetchApi<CombatTemplateData>('/api/v1/templates', {
    method: 'POST',
    body: JSON.stringify({ name, slots }),
  });
}

export async function updateTemplate(id: string, name?: string, slots?: Omit<CombatTemplateSlotData, 'id'>[]) {
  return fetchApi<CombatTemplateData>(`/api/v1/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, slots }),
  });
}

export async function deleteTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}`, { method: 'DELETE' });
}

export async function activateTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}/activate`, { method: 'POST' });
}
