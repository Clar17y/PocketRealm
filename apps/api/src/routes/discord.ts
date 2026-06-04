import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireInternalBotAuth } from '../middleware/internalBotAuth';
import {
  claimDiscordLinkCode,
  createDiscordLinkCode,
  getDiscordLinkStatus,
  listUnsyncedDiscordLinks,
  markDiscordLinkSynced,
  unlinkDiscordAccount,
  type ClaimedDiscordLinkDto,
} from '../services/discordAccountLinkService';
import {
  archiveSupportThread,
  listUnpostedSupportTicketsForDiscord,
  markSupportThreadCreated,
  markSupportTriageMessage,
} from '../services/discordSupportThreadService';
import {
  getLinkedDiscordProfile,
  getLinkedDiscordRank,
  getLinkedDiscordSkills,
  getLinkedDiscordTurns,
} from '../services/discordProfileService';
import {
  claimDiscordLinkCodeSchema,
  discordDuelCreateSchema,
  discordGuildLinkSchema,
  discordLinkIdParamsSchema,
  discordSnowflakeSchema,
  discordUnsyncedLinksQuerySchema,
} from '../services/discordSchemas';
import {
  createPendingDiscordDuel,
  getDiscordDuelReplay,
  recordDiscordDuelMessage,
  resolveDiscordDuel,
} from '../services/discordDuelService';
import { createDiscordSupportTicket } from '../services/supportTicketService';
import { createSupportTicketSchema } from '../services/supportTicketSchemas';
import { searchWikiForDiscord } from '../services/wikiSearchService';
import { asyncHandler } from '../utils/asyncHandler';

export const discordRouter = Router();

const discordUserParamsSchema = z.object({
  discordUserId: discordSnowflakeSchema,
}).strict();

const discordUserQuerySchema = z.object({
  guildId: discordSnowflakeSchema,
}).strict();

const discordRankParamsSchema = discordUserParamsSchema.extend({
  category: z.string().regex(/^[a-z0-9_]{1,64}$/),
}).strict();

const discordWikiSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
}).strict();

const discordReportSchema = createSupportTicketSchema.extend({
  discordGuildId: discordSnowflakeSchema,
  discordUserId: discordSnowflakeSchema,
}).strict();

const discordDuelParamsSchema = z.object({
  duelId: z.string().uuid(),
}).strict();

const discordDuelMessageSchema = z.object({
  messageId: discordSnowflakeSchema,
}).strict();

const discordDuelResolveSchema = z.object({
  acceptedByDiscordUserId: discordSnowflakeSchema,
}).strict();

const discordDuelReplayQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
}).strict();

const publicIdParamsSchema = z.object({
  publicId: z.string().trim().regex(/^SUP-[A-Z0-9]{1,16}$/),
}).strict();

const unpostedSupportTicketsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

const triageMessageSchema = z.object({
  guildId: discordSnowflakeSchema,
  triageChannelId: discordSnowflakeSchema,
  triageMessageId: discordSnowflakeSchema,
}).strict();

const threadCreatedSchema = z.object({
  threadId: discordSnowflakeSchema,
  createdByDiscordUserId: discordSnowflakeSchema,
}).strict();

const archiveThreadSchema = z.object({
  actorDiscordUserId: discordSnowflakeSchema,
}).strict();

function splitClaimedLink(result: ClaimedDiscordLinkDto) {
  const { titleAchievementId, ...link } = result;
  return { link, titleAchievementId };
}

function webBaseUrl(): string {
  return process.env.PUBLIC_WEB_URL ?? process.env.POCKETREALM_WEB_URL ?? 'http://localhost:3002';
}

discordRouter.post('/link-codes', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordGuildLinkSchema.parse(req.body);
  const linkCode = await createDiscordLinkCode(input);

  res.status(201).json(linkCode);
}));

discordRouter.post('/link', authenticate, asyncHandler(async (req, res) => {
  const input = claimDiscordLinkCodeSchema.parse(req.body);
  const result = await claimDiscordLinkCode({
    accountId: req.player!.accountId,
    playerId: req.player!.playerId,
    code: input.code,
  });

  res.status(201).json(splitClaimedLink(result));
}));

discordRouter.get('/link', authenticate, asyncHandler(async (req, res) => {
  const status = await getDiscordLinkStatus(req.player!.accountId);

  res.json(status);
}));

discordRouter.delete('/link', authenticate, asyncHandler(async (req, res) => {
  const result = await unlinkDiscordAccount(req.player!.accountId);

  res.json(result);
}));

discordRouter.get('/links/unsynced', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordUnsyncedLinksQuerySchema.parse(req.query);
  const links = await listUnsyncedDiscordLinks(query.guildId);

  res.json({ links });
}));

discordRouter.post('/links/:id/synced', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordLinkIdParamsSchema.parse(req.params);
  const link = await markDiscordLinkSynced(params.id);

  res.json({ link });
}));

discordRouter.post('/duels', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordDuelCreateSchema.parse(req.body);
  const duel = await createPendingDiscordDuel(input);

  res.status(201).json({ duel });
}));

discordRouter.post('/duels/:duelId/message', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordDuelParamsSchema.parse(req.params);
  const input = discordDuelMessageSchema.parse(req.body);
  const duel = await recordDiscordDuelMessage(params.duelId, input.messageId);

  res.json({ duel });
}));

discordRouter.post('/duels/:duelId/resolve', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordDuelParamsSchema.parse(req.params);
  const input = discordDuelResolveSchema.parse(req.body);
  const duel = await resolveDiscordDuel(params.duelId, input.acceptedByDiscordUserId);

  res.json({ duel });
}));

discordRouter.get('/duels/:duelId/replay', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordDuelParamsSchema.parse(req.params);
  const query = discordDuelReplayQuerySchema.parse(req.query);
  const replay = await getDiscordDuelReplay(params.duelId, query.page ?? 1);

  res.json({ replay });
}));

discordRouter.get('/users/:discordUserId/profile', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordUserParamsSchema.parse(req.params);
  const query = discordUserQuerySchema.parse(req.query);
  const profile = await getLinkedDiscordProfile({
    guildId: query.guildId,
    discordUserId: params.discordUserId,
  });

  res.json({ profile });
}));

discordRouter.get('/users/:discordUserId/turns', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordUserParamsSchema.parse(req.params);
  const query = discordUserQuerySchema.parse(req.query);
  const turns = await getLinkedDiscordTurns({
    guildId: query.guildId,
    discordUserId: params.discordUserId,
  });

  res.json({ turns });
}));

discordRouter.get('/users/:discordUserId/skills', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordUserParamsSchema.parse(req.params);
  const query = discordUserQuerySchema.parse(req.query);
  const skills = await getLinkedDiscordSkills({
    guildId: query.guildId,
    discordUserId: params.discordUserId,
  });

  res.json(skills);
}));

discordRouter.get('/users/:discordUserId/rank/:category', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = discordRankParamsSchema.parse(req.params);
  const query = discordUserQuerySchema.parse(req.query);
  const rank = await getLinkedDiscordRank({
    guildId: query.guildId,
    discordUserId: params.discordUserId,
    category: params.category,
  });

  res.json({ rank });
}));

discordRouter.get('/wiki/search', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordWikiSearchQuerySchema.parse(req.query);
  const results = searchWikiForDiscord(query.q, webBaseUrl());

  res.json({ results });
}));

discordRouter.post('/reports', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const { discordGuildId, discordUserId, ...input } = discordReportSchema.parse(req.body);
  const ticket = await createDiscordSupportTicket({
    discordGuildId,
    discordUserId,
    input,
  });

  res.status(201).json({
    ticket: {
      publicId: ticket.publicId,
      status: ticket.status,
    },
  });
}));

discordRouter.get('/support/tickets/unposted', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = unpostedSupportTicketsQuerySchema.parse(req.query);
  const tickets = await listUnpostedSupportTicketsForDiscord(query.limit);

  res.json({ tickets });
}));

discordRouter.post('/support/tickets/:publicId/triage-message', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = publicIdParamsSchema.parse(req.params);
  const input = triageMessageSchema.parse(req.body);
  const result = await markSupportTriageMessage({
    publicId: params.publicId,
    ...input,
  });

  res.json({ ticket: result });
}));

discordRouter.post('/support/tickets/:publicId/thread', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = publicIdParamsSchema.parse(req.params);
  const input = threadCreatedSchema.parse(req.body);
  const result = await markSupportThreadCreated({
    publicId: params.publicId,
    ...input,
  });

  res.json({ ticket: result });
}));

discordRouter.post('/support/tickets/:publicId/archive-thread', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = publicIdParamsSchema.parse(req.params);
  const input = archiveThreadSchema.parse(req.body);
  const result = await archiveSupportThread({
    publicId: params.publicId,
    ...input,
  });

  res.json({ ticket: result });
}));
