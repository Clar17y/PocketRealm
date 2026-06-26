import { Router } from 'express';
import { z } from 'zod';
import { ACHIEVEMENTS_BY_ID } from '@pocketrealm/shared/constants/achievementDefinitions';
import { DISCORD_DUEL_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { DISCORD_SUPPORT_BUTTON_STATUSES } from '@pocketrealm/shared/support/supportTickets';
import { authenticate } from '../middleware/auth';
import { requireInternalBotAuth } from '../middleware/internalBotAuth';
import { emitAchievementNotifications } from '../services/achievementService';
import {
  claimDiscordLinkCode,
  createDiscordLinkCode,
  getDiscordLinkStatus,
  listUnsyncedDiscordLinks,
  markDiscordLinkSynced,
  unlinkDiscordAccount,
} from '../services/discordAccountLinkService';
import {
  archiveSupportThread,
  getSupportTicketActionContextForDiscord,
  listUnpostedSupportTicketsForDiscord,
  markSupportThreadCreated,
  markSupportTriageMessage,
  updateSupportTicketStatusFromDiscord,
} from '../services/discordSupportThreadService';
import {
  adjustDiscordXp,
  grantDiscordMessageXp,
  markDiscordXpRoleSynced,
} from '../services/discordXpService';
import {
  getLinkedDiscordProfile,
  getLinkedDiscordRank,
  getLinkedDiscordSkills,
  getLinkedDiscordTurns,
} from '../services/discordProfileService';
import {
  claimDiscordLinkCodeSchema,
  discordNotificationAckSchema,
  discordNotificationPendingQuerySchema,
  discordNotificationPreferencesQuerySchema,
  discordNotificationPreferenceUpsertSchema,
  discordDuelCreateSchema,
  discordGuildLinkSchema,
  discordLinkIdParamsSchema,
  discordSnowflakeSchema,
  discordUnsyncedLinksQuerySchema,
  discordXpAdjustmentSchema,
  discordXpMessageGrantSchema,
  discordXpRoleSyncSchema,
} from '../services/discordSchemas';
import {
  createPendingDiscordDuel,
  getDiscordDuelReplay,
  recordDiscordDuelMessage,
  resolveDiscordDuel,
} from '../services/discordDuelService';
import {
  ackDiscordNotificationEvents,
  listDiscordNotificationPreferences,
  listPendingDiscordNotificationEvents,
  upsertDiscordNotificationPreference,
} from '../services/discordNotificationService';
import { notifySupportTicketCreated } from '../services/discordSupportNotifier';
import { createDiscordSupportTicket } from '../services/supportTicketService';
import { createSupportTicketSchema, supportTicketPublicIdParamsSchema } from '../services/supportTicketSchemas';
import { searchWikiForDiscord } from '../services/wikiSearchService';
import { lookupItemForDiscord, lookupMobForDiscord, lookupResourceForDiscord } from '../services/discordLookupService';
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

const discordLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
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
  page: z.coerce.number().int().min(1).max(DISCORD_DUEL_CONSTANTS.REPLAY_MAX_PAGE).optional(),
}).strict();

const publicIdParamsSchema = supportTicketPublicIdParamsSchema;

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

const supportTicketStatusSchema = z.object({
  status: z.enum(DISCORD_SUPPORT_BUTTON_STATUSES),
  actorDiscordUserId: discordSnowflakeSchema,
}).strict();

function webBaseUrl(): string {
  return process.env.POCKETREALM_WEB_BASE_URL ?? process.env.PUBLIC_WEB_URL ?? 'http://localhost:3002';
}

discordRouter.post('/link-codes', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordGuildLinkSchema.parse(req.body);
  const linkCode = await createDiscordLinkCode(input);

  res.status(201).json(linkCode);
}));

discordRouter.post('/link', authenticate, asyncHandler(async (req, res) => {
  const input = claimDiscordLinkCodeSchema.parse(req.body);
  const { achievementGranted, titleAchievementId, ...link } = await claimDiscordLinkCode({
    accountId: req.player!.accountId,
    playerId: req.player!.playerId,
    code: input.code,
  });

  if (achievementGranted) {
    const achievement = ACHIEVEMENTS_BY_ID.get(titleAchievementId);
    if (achievement) {
      await emitAchievementNotifications(req.player!.playerId, [achievement]);
    }
  }

  res.status(201).json({ link, titleAchievementId });
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

discordRouter.get('/items/lookup', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordLookupQuerySchema.parse(req.query);
  const result = await lookupItemForDiscord(query.q);

  res.json(result);
}));

discordRouter.get('/mobs/lookup', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordLookupQuerySchema.parse(req.query);
  const result = await lookupMobForDiscord(query.q);

  res.json(result);
}));

discordRouter.get('/resources/lookup', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordLookupQuerySchema.parse(req.query);
  const result = await lookupResourceForDiscord(query.q);

  res.json(result);
}));

discordRouter.post('/xp/messages', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpMessageGrantSchema.parse(req.body);
  const result = await grantDiscordMessageXp(input);

  res.json({ result });
}));

discordRouter.post('/xp/adjustments', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpAdjustmentSchema.parse(req.body);
  const adjustment = await adjustDiscordXp(input);

  res.json({ adjustment });
}));

discordRouter.post('/xp/role-sync', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordXpRoleSyncSchema.parse(req.body);
  const roleSync = await markDiscordXpRoleSynced(input);

  res.json({ roleSync });
}));

discordRouter.post('/reports', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const { discordGuildId, discordUserId, ...input } = discordReportSchema.parse(req.body);
  const ticket = await createDiscordSupportTicket({
    discordGuildId,
    discordUserId,
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

discordRouter.get('/support/tickets/:publicId/action-context', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = publicIdParamsSchema.parse(req.params);
  const result = await getSupportTicketActionContextForDiscord(params.publicId);

  res.json({ ticket: result });
}));

discordRouter.post('/support/tickets/:publicId/status', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const params = publicIdParamsSchema.parse(req.params);
  const input = supportTicketStatusSchema.parse(req.body);
  const result = await updateSupportTicketStatusFromDiscord({
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

discordRouter.get('/notifications/preferences', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordNotificationPreferencesQuerySchema.parse(req.query);
  const preferences = await listDiscordNotificationPreferences(query);

  res.json({ preferences });
}));

discordRouter.post('/notifications/preferences', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordNotificationPreferenceUpsertSchema.parse(req.body);
  const preference = await upsertDiscordNotificationPreference(input);

  res.json({ preference });
}));

discordRouter.get('/notifications/pending', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordNotificationPendingQuerySchema.parse(req.query);
  const events = await listPendingDiscordNotificationEvents(query.limit);

  res.json({ events });
}));

discordRouter.post('/notifications/ack', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const input = discordNotificationAckSchema.parse(req.body);
  const result = await ackDiscordNotificationEvents(input);

  res.json({ result });
}));
