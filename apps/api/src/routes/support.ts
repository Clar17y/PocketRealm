import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin';
import { authenticate } from '../middleware/auth';
import {
  createSupportTicketSchema,
  supportTicketPublicIdParamsSchema,
  supportTicketStatusListSchema,
  updateSupportTicketSchema,
} from '../services/supportTicketSchemas';
import {
  createSupportTicket,
  listSupportTicketsForExport,
  realmLabelFor,
  supportTicketToAdminRecord,
  supportTicketToJsonl,
  updateSupportTicket,
} from '../services/supportTicketService';
import { notifySupportTicketCreated } from '../services/discordSupportNotifier';
import { asyncHandler } from '../utils/asyncHandler';

export const supportRouter = Router();

const exportQuerySchema = z.object({
  status: supportTicketStatusListSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  createdAfter: z.string().datetime().optional(),
}).strict();

async function listTicketsFromQuery(query: unknown) {
  const parsed = exportQuerySchema.parse(query);

  return listSupportTicketsForExport({
    statuses: parsed.status,
    limit: parsed.limit,
    createdAfter: parsed.createdAfter ? new Date(parsed.createdAfter) : undefined,
  });
}

supportRouter.use(authenticate);

supportRouter.post('/tickets', asyncHandler(async (req, res) => {
  const input = createSupportTicketSchema.parse(req.body);
  const ticket = await createSupportTicket({
    accountId: req.player!.accountId,
    playerId: req.player!.playerId,
    seasonId: req.player!.seasonId,
    reporterDisplayName: req.player!.username,
    realmLabel: realmLabelFor(req.player!.seasonId, req.season?.name),
    input,
  });

  void notifySupportTicketCreated(ticket);

  res.status(201).json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

supportRouter.patch('/tickets/:publicId', requireAdmin, asyncHandler(async (req, res) => {
  const params = supportTicketPublicIdParamsSchema.parse(req.params);
  const input = updateSupportTicketSchema.parse(req.body);
  const ticket = await updateSupportTicket(params.publicId, req.player!.accountId, input);

  res.json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

supportRouter.get('/tickets', requireAdmin, asyncHandler(async (req, res) => {
  const { tickets, hasMore } = await listTicketsFromQuery(req.query);

  res.json({
    tickets: tickets.map(supportTicketToAdminRecord),
    hasMore,
  });
}));

supportRouter.get('/tickets/export', requireAdmin, asyncHandler(async (req, res) => {
  const { tickets, hasMore } = await listTicketsFromQuery(req.query);

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  if (hasMore) {
    res.setHeader('X-Truncated', 'true');
  }
  for (const ticket of tickets) {
    res.write(supportTicketToJsonl(ticket));
  }
  res.end();
}));
