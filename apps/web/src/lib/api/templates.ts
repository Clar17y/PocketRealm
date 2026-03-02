import { fetchApi } from './core';

export interface TemplateAction {
  actionId: string;
  label?: string;
}

export interface TemplateResponse {
  id: string;
  playerId: string;
  name: string;
  isActive: boolean;
  actions: TemplateAction[];
  createdAt: string;
  updatedAt: string;
}

export async function getTemplates() {
  return fetchApi<{ templates: TemplateResponse[] }>('/api/v1/templates');
}

export async function getActiveTemplate() {
  return fetchApi<{ actions: TemplateAction[] }>('/api/v1/templates/active');
}

export async function createTemplate(name: string, actions: TemplateAction[]) {
  return fetchApi<TemplateResponse>('/api/v1/templates', {
    method: 'POST',
    body: JSON.stringify({ name, actions }),
  });
}

export async function updateTemplate(id: string, name?: string, actions?: TemplateAction[]) {
  return fetchApi<TemplateResponse>(`/api/v1/templates/${id}`, {
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
