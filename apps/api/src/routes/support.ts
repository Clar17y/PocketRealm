import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/admin';
import { authenticate } from '../middleware/auth';
import { createSupportTicketSchema, supportTicketStatusListSchema, updateSupportTicketSchema } from '../services/supportTicketSchemas';
import {
  createSupportTicket,
  listSupportTicketsForExport,
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
});

function realmLabelFor(seasonId: string | null, seasonName?: string): string {
  if (!seasonId) return 'Preseason';
  return seasonName ?? 'Seasonal Realm';
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
  const input = updateSupportTicketSchema.parse(req.body);
  const ticket = await updateSupportTicket(req.params.publicId, req.player!.accountId, input);

  res.json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

supportRouter.get('/tickets', requireAdmin, asyncHandler(async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const tickets = await listSupportTicketsForExport({
    statuses: query.status,
    limit: query.limit,
    createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
  });

  res.json({
    tickets: tickets.map(supportTicketToAdminRecord),
  });
}));

supportRouter.get('/tickets/export', requireAdmin, asyncHandler(async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const tickets = await listSupportTicketsForExport({
    statuses: query.status,
    limit: query.limit,
    createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
  });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  for (const ticket of tickets) {
    res.write(supportTicketToJsonl(ticket));
  }
  res.end();
}));
