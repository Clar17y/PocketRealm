import type {
  SupportTicketArea,
  SupportTicketCategory,
  SupportTicketPrivacy,
} from '@pocketrealm/shared/support/supportTickets';
import { fetchApi } from './core';

export type { SupportTicketArea, SupportTicketCategory, SupportTicketPrivacy };

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
