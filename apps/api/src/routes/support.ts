import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin';
import { authenticate } from '../middleware/auth';
import { createSupportTicketSchema, SUPPORT_TICKET_STATUSES, updateSupportTicketSchema } from '../services/supportTicketSchemas';
import {
  createSupportTicket,
  listSupportTicketsForExport,
  supportTicketToJsonl,
  updateSupportTicket,
} from '../services/supportTicketService';
import { notifySupportTicketCreated } from '../services/discordSupportNotifier';
import { asyncHandler } from '../utils/asyncHandler';

export const supportRouter = Router();

const exportQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  createdAfter: z.string().datetime().optional(),
});

function realmLabelFor(seasonId: string | null): string {
  return seasonId ? 'Seasonal Realm' : 'Preseason';
}

function parseStatuses(raw: string | undefined): typeof SUPPORT_TICKET_STATUSES[number][] | undefined {
  if (!raw) return undefined;
  const allowed = new Set<string>(SUPPORT_TICKET_STATUSES);
  return raw
    .split(',')
    .map((status) => status.trim())
    .filter((status): status is typeof SUPPORT_TICKET_STATUSES[number] => allowed.has(status));
}

supportRouter.use(authenticate);

supportRouter.post('/tickets', asyncHandler(async (req, res) => {
  const input = createSupportTicketSchema.parse(req.body);
  const ticket = await createSupportTicket({
    accountId: req.player!.accountId,
    playerId: req.player!.playerId,
    reporterDisplayName: req.player!.username,
    realmLabel: realmLabelFor(req.player!.seasonId),
    input,
  });

  await notifySupportTicketCreated(ticket).catch(() => undefined);

  res.status(201).json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

supportRouter.patch('/tickets/:publicId', requireAdmin, asyncHandler(async (req, res) => {
  const input = updateSupportTicketSchema.parse(req.body);
  const ticket = await updateSupportTicket(req.params.publicId, req.player!.accountId, input);

  res.json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

supportRouter.get('/tickets/export', requireAdmin, asyncHandler(async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const tickets = await listSupportTicketsForExport({
    statuses: parseStatuses(query.status),
    limit: query.limit,
    createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
  });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.send(tickets.map(supportTicketToJsonl).join(''));
}));
