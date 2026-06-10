import { z } from 'zod';
import {
  SUPPORT_SENSITIVITY_FLAGS,
  SUPPORT_TICKET_AREAS,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIVACY,
  SUPPORT_TICKET_STATUSES,
  type SupportTicketStatus,
} from '@pocketrealm/shared/support/supportTickets';

export {
  SUPPORT_SENSITIVITY_FLAGS,
  SUPPORT_TICKET_AREAS,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIVACY,
  SUPPORT_TICKET_STATUSES,
};
export type {
  SupportSensitivityFlag,
  SupportTicketArea,
  SupportTicketCategory,
  SupportTicketPrivacy,
  SupportTicketStatus,
} from '@pocketrealm/shared/support/supportTickets';

export const attachmentMetadataSchema = z.object({
  name: z.string().max(160),
  url: z.string().url(),
  contentType: z.string().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().max(10_000_000).optional(),
}).strict();

export const createSupportTicketSchema = z.object({
  privacy: z.enum(SUPPORT_TICKET_PRIVACY),
  category: z.enum(SUPPORT_TICKET_CATEGORIES),
  area: z.enum(SUPPORT_TICKET_AREAS),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(4000),
  expectedBehavior: z.string().trim().max(2000).optional(),
  actualBehavior: z.string().trim().max(2000).optional(),
  reproductionSteps: z.string().trim().max(3000).optional(),
  screen: z.string().trim().max(80).optional(),
  appVersion: z.string().trim().max(80).optional(),
  apiVersion: z.string().trim().max(80).optional(),
  browser: z.string().trim().max(160).optional(),
  device: z.string().trim().max(160).optional(),
  requestId: z.string().trim().max(64).optional(),
  sentryEventId: z.string().trim().max(64).optional(),
  attachments: z.array(attachmentMetadataSchema).max(5).optional(),
}).strict();

export const updateSupportTicketSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  note: z.string().trim().max(2000).optional(),
  githubIssueUrl: z.string().url().max(500).nullable().optional(),
  duplicateTicketIds: z.array(z.string().trim().max(24)).max(20).optional(),
  sensitivityFlags: z.array(z.enum(SUPPORT_SENSITIVITY_FLAGS)).max(8).optional(),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: 'At least one update field is required',
});

export const supportTicketPublicIdParamsSchema = z.object({
  publicId: z.string().trim().regex(/^SUP-[A-Z0-9]{1,16}$/),
}).strict();

export const supportTicketStatusListSchema = z.string().transform((raw, ctx) => {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one support ticket status is required' });
    return z.NEVER;
  }

  const allowed = new Set<string>(SUPPORT_TICKET_STATUSES);
  const unsupported = values.filter((value) => !allowed.has(value));
  if (unsupported.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unsupported support ticket status: ${unsupported.join(', ')}` });
    return z.NEVER;
  }

  return values as SupportTicketStatus[];
});

export function parseSupportTicketStatuses(raw: string | undefined): SupportTicketStatus[] | undefined {
  return raw === undefined ? undefined : supportTicketStatusListSchema.parse(raw);
}

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;
