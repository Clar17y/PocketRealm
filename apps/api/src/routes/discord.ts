import { Router } from 'express';
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
  claimDiscordLinkCodeSchema,
  discordGuildLinkSchema,
  discordLinkIdParamsSchema,
  discordUnsyncedLinksQuerySchema,
} from '../services/discordSchemas';
import { asyncHandler } from '../utils/asyncHandler';

export const discordRouter = Router();

function splitClaimedLink(result: ClaimedDiscordLinkDto) {
  const { titleAchievementId, ...link } = result;
  return { link, titleAchievementId };
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
