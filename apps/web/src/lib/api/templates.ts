import { fetchApi } from './core';
import type { CombatTemplateAction, CombatTemplateData } from '@adventure/shared';

export async function getTemplates() {
  return fetchApi<{ templates: CombatTemplateData[] }>('/api/v1/templates');
}

export async function getActiveTemplate() {
  return fetchApi<{ actions: CombatTemplateAction[] }>('/api/v1/templates/active');
}

export async function createTemplate(name: string, actions: CombatTemplateAction[]) {
  return fetchApi<CombatTemplateData>('/api/v1/templates', {
    method: 'POST',
    body: JSON.stringify({ name, actions }),
  });
}

export async function updateTemplate(id: string, name?: string, actions?: CombatTemplateAction[]) {
  return fetchApi<CombatTemplateData>(`/api/v1/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, actions }),
  });
}

export async function deleteTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}`, { method: 'DELETE' });
}

export async function activateTemplate(id: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/templates/${id}/activate`, { method: 'POST' });
}
