import { fetchApi } from './core';

export type SupportTicketPrivacy = 'public_candidate' | 'private' | 'not_sure';
export type SupportTicketCategory = 'bug' | 'suggestion' | 'balance' | 'account' | 'security' | 'abuse' | 'other';
export type SupportTicketArea =
  | 'combat'
  | 'exploration'
  | 'crafting'
  | 'inventory'
  | 'social'
  | 'guild'
  | 'casino'
  | 'payments'
  | 'auth'
  | 'mobile'
  | 'performance'
  | 'other';

export interface CreateSupportTicketRequest {
  privacy: SupportTicketPrivacy;
  category: SupportTicketCategory;
  area: SupportTicketArea;
  title: string;
  description: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  reproductionSteps?: string;
  screen?: string;
  appVersion?: string;
  browser?: string;
  device?: string;
  requestId?: string;
  sentryEventId?: string;
}

export interface CreateSupportTicketResponse {
  ticket: {
    publicId: string;
    status: 'new';
  };
}

export function createSupportTicket(input: CreateSupportTicketRequest) {
  return fetchApi<CreateSupportTicketResponse>('/api/v1/support/tickets', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
