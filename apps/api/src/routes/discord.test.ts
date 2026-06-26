import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/errorHandler';

const mocks = vi.hoisted(() => ({
  createDiscordLinkCode: vi.fn(),
  claimDiscordLinkCode: vi.fn(),
  getDiscordLinkStatus: vi.fn(),
  unlinkDiscordAccount: vi.fn(),
  listUnsyncedDiscordLinks: vi.fn(),
  markDiscordLinkSynced: vi.fn(),
  getLinkedDiscordProfile: vi.fn(),
  getLinkedDiscordTurns: vi.fn(),
  getLinkedDiscordSkills: vi.fn(),
  getLinkedDiscordRank: vi.fn(),
  searchWikiForDiscord: vi.fn(),
  grantDiscordMessageXp: vi.fn(),
  adjustDiscordXp: vi.fn(),
  markDiscordXpRoleSynced: vi.fn(),
  createDiscordSupportTicket: vi.fn(),
  listUnpostedSupportTicketsForDiscord: vi.fn(),
  markSupportTriageMessage: vi.fn(),
  markSupportThreadCreated: vi.fn(),
  archiveSupportThread: vi.fn(),
  getSupportTicketActionContextForDiscord: vi.fn(),
  updateSupportTicketStatusFromDiscord: vi.fn(),
  createPendingDiscordDuel: vi.fn(),
  recordDiscordDuelMessage: vi.fn(),
  resolveDiscordDuel: vi.fn(),
  getDiscordDuelReplay: vi.fn(),
  notifySupportTicketCreated: vi.fn(),
  emitAchievementNotifications: vi.fn(),
  listDiscordNotificationPreferences: vi.fn(),
  upsertDiscordNotificationPreference: vi.fn(),
  listPendingDiscordNotificationEvents: vi.fn(),
  ackDiscordNotificationEvents: vi.fn(),
  lookupItemForDiscord: vi.fn(),
  lookupMobForDiscord: vi.fn(),
  lookupResourceForDiscord: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (!req.header('authorization')) {
      return next(new AppError(401, 'Missing or invalid authorization header', 'UNAUTHORIZED'));
    }
    req.player = {
      accountId: 'account-1',
      playerId: 'player-1',
      username: 'Mira',
      seasonId: null,
      role: 'player',
    };
    next();
  },
}));

vi.mock('../middleware/internalBotAuth', () => ({
  requireInternalBotAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.header('x-pocketrealm-bot-key') !== 'bot-key') {
      return next(new AppError(401, 'Bot API key missing or invalid', 'BOT_UNAUTHORIZED'));
    }
    next();
  },
}));

vi.mock('../services/discordAccountLinkService', () => ({
  createDiscordLinkCode: mocks.createDiscordLinkCode,
  claimDiscordLinkCode: mocks.claimDiscordLinkCode,
  getDiscordLinkStatus: mocks.getDiscordLinkStatus,
  unlinkDiscordAccount: mocks.unlinkDiscordAccount,
  listUnsyncedDiscordLinks: mocks.listUnsyncedDiscordLinks,
  markDiscordLinkSynced: mocks.markDiscordLinkSynced,
}));

vi.mock('../services/discordProfileService', () => ({
  getLinkedDiscordProfile: mocks.getLinkedDiscordProfile,
  getLinkedDiscordTurns: mocks.getLinkedDiscordTurns,
  getLinkedDiscordSkills: mocks.getLinkedDiscordSkills,
  getLinkedDiscordRank: mocks.getLinkedDiscordRank,
}));

vi.mock('../services/wikiSearchService', () => ({
  searchWikiForDiscord: mocks.searchWikiForDiscord,
}));

vi.mock('../services/discordXpService', () => ({
  grantDiscordMessageXp: mocks.grantDiscordMessageXp,
  adjustDiscordXp: mocks.adjustDiscordXp,
  markDiscordXpRoleSynced: mocks.markDiscordXpRoleSynced,
}));

vi.mock('../services/supportTicketService', () => ({
  createDiscordSupportTicket: mocks.createDiscordSupportTicket,
}));

vi.mock('../services/discordSupportThreadService', () => ({
  listUnpostedSupportTicketsForDiscord: mocks.listUnpostedSupportTicketsForDiscord,
  markSupportTriageMessage: mocks.markSupportTriageMessage,
  markSupportThreadCreated: mocks.markSupportThreadCreated,
  archiveSupportThread: mocks.archiveSupportThread,
  getSupportTicketActionContextForDiscord: mocks.getSupportTicketActionContextForDiscord,
  updateSupportTicketStatusFromDiscord: mocks.updateSupportTicketStatusFromDiscord,
}));

vi.mock('../services/discordDuelService', () => ({
  createPendingDiscordDuel: mocks.createPendingDiscordDuel,
  recordDiscordDuelMessage: mocks.recordDiscordDuelMessage,
  resolveDiscordDuel: mocks.resolveDiscordDuel,
  getDiscordDuelReplay: mocks.getDiscordDuelReplay,
}));

vi.mock('../services/discordSupportNotifier', () => ({
  notifySupportTicketCreated: mocks.notifySupportTicketCreated,
}));

vi.mock('../services/achievementService', () => ({
  emitAchievementNotifications: mocks.emitAchievementNotifications,
}));

vi.mock('../services/discordNotificationService', () => ({
  listDiscordNotificationPreferences: mocks.listDiscordNotificationPreferences,
  upsertDiscordNotificationPreference: mocks.upsertDiscordNotificationPreference,
  listPendingDiscordNotificationEvents: mocks.listPendingDiscordNotificationEvents,
  ackDiscordNotificationEvents: mocks.ackDiscordNotificationEvents,
}));

vi.mock('../services/discordLookupService', () => ({
  lookupItemForDiscord: mocks.lookupItemForDiscord,
  lookupMobForDiscord: mocks.lookupMobForDiscord,
  lookupResourceForDiscord: mocks.lookupResourceForDiscord,
}));

import { discordRouter } from './discord';

const DISCORD_USER_ID = '12345678901234567';
const DISCORD_GUILD_ID = '23456789012345678';
const DISCORD_CHANNEL_ID = '34567890123456789';
const DISCORD_TARGET_USER_ID = '45678901234567890';
const DISCORD_MESSAGE_ID = '56789012345678901';
const DISCORD_MESSAGE_FINGERPRINT = 'a'.repeat(64);
const LINK_ID = '11111111-1111-4111-8111-111111111111';
const DUEL_ID = '22222222-2222-4222-8222-222222222222';
const LINKED_AT = '2026-06-04T12:00:00.000Z';

function app() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/discord', discordRouter);
  app.use(errorHandler);
  return app;
}

describe('discordRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires internal bot auth and creates a Discord link code', async () => {
    await request(app())
      .post('/api/v1/discord/link-codes')
      .send({ discordUserId: DISCORD_USER_ID, discordGuildId: DISCORD_GUILD_ID })
      .expect(401);

    mocks.createDiscordLinkCode.mockResolvedValue({
      code: 'ABC12345',
      expiresAt: new Date(LINKED_AT),
    });

    const res = await request(app())
      .post('/api/v1/discord/link-codes')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ discordUserId: DISCORD_USER_ID, discordGuildId: DISCORD_GUILD_ID })
      .expect(201);

    expect(res.body).toEqual({
      code: 'ABC12345',
      expiresAt: LINKED_AT,
    });
    expect(mocks.createDiscordLinkCode).toHaveBeenCalledWith({
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
    });
  });

  it('claims a Discord link code for the authenticated player', async () => {
    mocks.claimDiscordLinkCode.mockResolvedValue({
      id: LINK_ID,
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: new Date(LINKED_AT),
      roleSyncedAt: null,
      titleAchievementId: 'discord_linked',
      achievementGranted: false,
    });

    const res = await request(app())
      .post('/api/v1/discord/link')
      .set('authorization', 'Bearer test-token')
      .send({ code: ' abc12345 ' })
      .expect(201);

    expect(res.body).toEqual({
      link: {
        id: LINK_ID,
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: LINKED_AT,
        roleSyncedAt: null,
      },
      titleAchievementId: 'discord_linked',
    });
    expect(mocks.claimDiscordLinkCode).toHaveBeenCalledWith({
      accountId: 'account-1',
      playerId: 'player-1',
      code: 'ABC12345',
    });
    expect(mocks.emitAchievementNotifications).not.toHaveBeenCalled();
  });

  it('emits the achievement notification only when the claim newly grants it', async () => {
    mocks.claimDiscordLinkCode.mockResolvedValue({
      id: LINK_ID,
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: new Date(LINKED_AT),
      roleSyncedAt: null,
      titleAchievementId: 'discord_linked',
      achievementGranted: true,
    });

    const res = await request(app())
      .post('/api/v1/discord/link')
      .set('authorization', 'Bearer test-token')
      .send({ code: 'ABC12345' })
      .expect(201);

    expect(res.body.titleAchievementId).toBe('discord_linked');
    expect(res.body.link).not.toHaveProperty('achievementGranted');
    expect(mocks.emitAchievementNotifications).toHaveBeenCalledWith(
      'player-1',
      [expect.objectContaining({ id: 'discord_linked' })],
    );
  });

  it('returns active Discord link status for the authenticated account', async () => {
    mocks.getDiscordLinkStatus.mockResolvedValue({
      linked: true,
      link: {
        id: LINK_ID,
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: new Date(LINKED_AT),
        roleSyncedAt: null,
      },
    });

    const res = await request(app())
      .get('/api/v1/discord/link')
      .set('authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body).toEqual({
      linked: true,
      link: {
        id: LINK_ID,
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: LINKED_AT,
        roleSyncedAt: null,
      },
    });
    expect(mocks.getDiscordLinkStatus).toHaveBeenCalledWith('account-1');
  });

  it('unlinks the authenticated account active Discord link', async () => {
    mocks.unlinkDiscordAccount.mockResolvedValue({
      unlinked: true,
      link: {
        id: LINK_ID,
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: new Date(LINKED_AT),
        roleSyncedAt: null,
      },
    });

    const res = await request(app())
      .delete('/api/v1/discord/link')
      .set('authorization', 'Bearer test-token')
      .expect(200);

    expect(res.body.unlinked).toBe(true);
    expect(mocks.unlinkDiscordAccount).toHaveBeenCalledWith('account-1');
  });

  it('requires player auth for player Discord link routes', async () => {
    await request(app())
      .get('/api/v1/discord/link')
      .expect(401);

    expect(mocks.getDiscordLinkStatus).not.toHaveBeenCalled();
  });

  it('rejects extra fields on the claim body', async () => {
    await request(app())
      .post('/api/v1/discord/link')
      .set('authorization', 'Bearer test-token')
      .send({ code: 'ABC12345', extra: 'nope' })
      .expect(400);

    expect(mocks.claimDiscordLinkCode).not.toHaveBeenCalled();
  });

  it('lists unsynced links for a Discord guild with internal bot auth', async () => {
    mocks.listUnsyncedDiscordLinks.mockResolvedValue([
      {
        id: LINK_ID,
        discordUserId: DISCORD_USER_ID,
        discordGuildId: DISCORD_GUILD_ID,
        linkedAt: new Date(LINKED_AT),
        roleSyncedAt: null,
      },
    ]);

    const res = await request(app())
      .get(`/api/v1/discord/links/unsynced?guildId=${DISCORD_GUILD_ID}`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body).toEqual({
      links: [
        {
          id: LINK_ID,
          discordUserId: DISCORD_USER_ID,
          discordGuildId: DISCORD_GUILD_ID,
          linkedAt: LINKED_AT,
          roleSyncedAt: null,
        },
      ],
    });
    expect(mocks.listUnsyncedDiscordLinks).toHaveBeenCalledWith(DISCORD_GUILD_ID);
  });

  it('rejects malformed snowflakes on internal routes', async () => {
    await request(app())
      .post('/api/v1/discord/link-codes')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ discordUserId: 'not-a-snowflake', discordGuildId: DISCORD_GUILD_ID })
      .expect(400);

    expect(mocks.createDiscordLinkCode).not.toHaveBeenCalled();
  });

  it('marks a Discord link as role synced with internal bot auth', async () => {
    mocks.markDiscordLinkSynced.mockResolvedValue({
      id: LINK_ID,
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: new Date(LINKED_AT),
      roleSyncedAt: new Date(LINKED_AT),
    });

    const res = await request(app())
      .post(`/api/v1/discord/links/${LINK_ID}/synced`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.link).toEqual({
      id: LINK_ID,
      discordUserId: DISCORD_USER_ID,
      discordGuildId: DISCORD_GUILD_ID,
      linkedAt: LINKED_AT,
      roleSyncedAt: LINKED_AT,
    });
    expect(mocks.markDiscordLinkSynced).toHaveBeenCalledWith(LINK_ID);
  });

  it('rejects a bad Discord link id param', async () => {
    await request(app())
      .post('/api/v1/discord/links/not-a-uuid/synced')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(400);

    expect(mocks.markDiscordLinkSynced).not.toHaveBeenCalled();
  });

  it('requires internal bot auth for Discord profile helper routes', async () => {
    await request(app())
      .get(`/api/v1/discord/users/${DISCORD_USER_ID}/profile?guildId=${DISCORD_GUILD_ID}`)
      .expect(401);

    expect(mocks.getLinkedDiscordProfile).not.toHaveBeenCalled();
  });

  it('returns a linked Discord player profile with internal bot auth', async () => {
    mocks.getLinkedDiscordProfile.mockResolvedValue({
      username: 'Mira',
      characterLevel: 12,
      activeTitle: 'Linked Adventurer',
    });

    const res = await request(app())
      .get(`/api/v1/discord/users/${DISCORD_USER_ID}/profile?guildId=${DISCORD_GUILD_ID}`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.profile).toEqual({
      username: 'Mira',
      characterLevel: 12,
      activeTitle: 'Linked Adventurer',
    });
    expect(mocks.getLinkedDiscordProfile).toHaveBeenCalledWith({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
    });
  });

  it('delegates Discord turns, skills, and rank routes after validation', async () => {
    mocks.getLinkedDiscordTurns.mockResolvedValue({ currentTurns: 42 });
    mocks.getLinkedDiscordSkills.mockResolvedValue({ skills: [{ skillType: 'mining', level: 18, xp: 1200 }] });
    mocks.getLinkedDiscordRank.mockResolvedValue({ category: 'character_level', rank: 3, score: 12 });

    await request(app())
      .get(`/api/v1/discord/users/${DISCORD_USER_ID}/turns?guildId=${DISCORD_GUILD_ID}`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);
    await request(app())
      .get(`/api/v1/discord/users/${DISCORD_USER_ID}/skills?guildId=${DISCORD_GUILD_ID}`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);
    await request(app())
      .get(`/api/v1/discord/users/${DISCORD_USER_ID}/rank/character_level?guildId=${DISCORD_GUILD_ID}`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(mocks.getLinkedDiscordTurns).toHaveBeenCalledWith({ guildId: DISCORD_GUILD_ID, discordUserId: DISCORD_USER_ID });
    expect(mocks.getLinkedDiscordSkills).toHaveBeenCalledWith({ guildId: DISCORD_GUILD_ID, discordUserId: DISCORD_USER_ID });
    expect(mocks.getLinkedDiscordRank).toHaveBeenCalledWith({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      category: 'character_level',
    });
  });

  it('searches the wiki with the configured public web URL', async () => {
    const originalBaseUrl = process.env.POCKETREALM_WEB_BASE_URL;
    const originalPublicWebUrl = process.env.PUBLIC_WEB_URL;
    delete process.env.POCKETREALM_WEB_BASE_URL;
    process.env.PUBLIC_WEB_URL = 'https://pocketrealm.example';
    mocks.searchWikiForDiscord.mockReturnValue([{ title: 'Forge', url: 'https://pocketrealm.example/wiki/items/forge' }]);

    const res = await request(app())
      .get('/api/v1/discord/wiki/search?q=forge')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.results).toEqual([{ title: 'Forge', url: 'https://pocketrealm.example/wiki/items/forge' }]);
    expect(mocks.searchWikiForDiscord).toHaveBeenCalledWith('forge', 'https://pocketrealm.example');

    if (originalBaseUrl === undefined) {
      delete process.env.POCKETREALM_WEB_BASE_URL;
    } else {
      process.env.POCKETREALM_WEB_BASE_URL = originalBaseUrl;
    }
    if (originalPublicWebUrl === undefined) {
      delete process.env.PUBLIC_WEB_URL;
    } else {
      process.env.PUBLIC_WEB_URL = originalPublicWebUrl;
    }
  });

  it('prefers POCKETREALM_WEB_BASE_URL over PUBLIC_WEB_URL for wiki links', async () => {
    const originalBaseUrl = process.env.POCKETREALM_WEB_BASE_URL;
    const originalPublicWebUrl = process.env.PUBLIC_WEB_URL;
    process.env.POCKETREALM_WEB_BASE_URL = 'https://base.pocketrealm.example';
    process.env.PUBLIC_WEB_URL = 'https://legacy.pocketrealm.example';
    mocks.searchWikiForDiscord.mockReturnValue([]);

    await request(app())
      .get('/api/v1/discord/wiki/search?q=forge')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(mocks.searchWikiForDiscord).toHaveBeenCalledWith('forge', 'https://base.pocketrealm.example');

    if (originalBaseUrl === undefined) {
      delete process.env.POCKETREALM_WEB_BASE_URL;
    } else {
      process.env.POCKETREALM_WEB_BASE_URL = originalBaseUrl;
    }
    if (originalPublicWebUrl === undefined) {
      delete process.env.PUBLIC_WEB_URL;
    } else {
      process.env.PUBLIC_WEB_URL = originalPublicWebUrl;
    }
  });

  it.each([
    '/api/v1/discord/xp/messages',
    '/api/v1/discord/xp/adjustments',
    '/api/v1/discord/xp/role-sync',
  ])('requires internal bot auth on %s', async (path) => {
    await request(app()).post(path).send({}).expect(401);

    expect(mocks.grantDiscordMessageXp).not.toHaveBeenCalled();
    expect(mocks.adjustDiscordXp).not.toHaveBeenCalled();
    expect(mocks.markDiscordXpRoleSynced).not.toHaveBeenCalled();
  });

  it('grants Discord message XP through the internal API', async () => {
    mocks.grantDiscordMessageXp.mockResolvedValue({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 2,
      profileId: 'profile-1',
    });

    const res = await request(app())
      .post('/api/v1/discord/xp/messages')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        channelId: DISCORD_CHANNEL_ID,
        messageId: DISCORD_MESSAGE_ID,
        messageFingerprint: DISCORD_MESSAGE_FINGERPRINT,
      })
      .expect(200);

    expect(res.body.result).toEqual({
      eligible: true,
      reason: 'granted',
      xpGranted: 8,
      previousLevel: 1,
      newLevel: 2,
      profileId: 'profile-1',
    });
    expect(mocks.grantDiscordMessageXp).toHaveBeenCalledWith({
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      channelId: DISCORD_CHANNEL_ID,
      messageId: DISCORD_MESSAGE_ID,
      messageFingerprint: DISCORD_MESSAGE_FINGERPRINT,
    });
  });

  it('rejects raw message content on Discord message XP route', async () => {
    await request(app())
      .post('/api/v1/discord/xp/messages')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        channelId: DISCORD_CHANNEL_ID,
        messageId: DISCORD_MESSAGE_ID,
        messageFingerprint: DISCORD_MESSAGE_FINGERPRINT,
        content: 'this must never cross the API boundary',
      })
      .expect(400);

    expect(mocks.grantDiscordMessageXp).not.toHaveBeenCalled();
  });

  it('applies staff Discord XP adjustments through the internal API', async () => {
    mocks.adjustDiscordXp.mockResolvedValue({
      profileId: 'profile-1',
      targetDiscordUserId: DISCORD_TARGET_USER_ID,
      amount: 20,
      previousXp: 90,
      newXp: 110,
      previousLevel: 1,
      newLevel: 2,
      reason: 'manual event credit',
    });

    const res = await request(app())
      .post('/api/v1/discord/xp/adjustments')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        actorDiscordUserId: DISCORD_USER_ID,
        targetDiscordUserId: DISCORD_TARGET_USER_ID,
        amount: 20,
        reason: ' manual event credit ',
      })
      .expect(200);

    expect(res.body.adjustment).toMatchObject({
      newXp: 110,
      newLevel: 2,
      reason: 'manual event credit',
    });
    expect(mocks.adjustDiscordXp).toHaveBeenCalledWith({
      discordGuildId: DISCORD_GUILD_ID,
      actorDiscordUserId: DISCORD_USER_ID,
      targetDiscordUserId: DISCORD_TARGET_USER_ID,
      amount: 20,
      reason: 'manual event credit',
    });
  });

  it('records Discord XP role sync through the internal API', async () => {
    mocks.markDiscordXpRoleSynced.mockResolvedValue({
      profileId: 'profile-1',
      lastRoleSyncAt: new Date(LINKED_AT),
    });

    const res = await request(app())
      .post('/api/v1/discord/xp/role-sync')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        profileId: '11111111-1111-4111-8111-111111111111',
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        roleId: '78901234567890123',
        level: 2,
        syncedAt: LINKED_AT,
      })
      .expect(200);

    expect(res.body.roleSync).toEqual({
      profileId: 'profile-1',
      lastRoleSyncAt: LINKED_AT,
    });
    expect(mocks.markDiscordXpRoleSynced).toHaveBeenCalledWith({
      profileId: '11111111-1111-4111-8111-111111111111',
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      roleId: '78901234567890123',
      level: 2,
      syncedAt: new Date(LINKED_AT),
    });
  });

  it.each([null, 0, '0'])('rejects non-ISO syncedAt values for Discord XP role sync: %s', async (syncedAt) => {
    await request(app())
      .post('/api/v1/discord/xp/role-sync')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        profileId: '11111111-1111-4111-8111-111111111111',
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        roleId: '78901234567890123',
        level: 2,
        syncedAt,
      })
      .expect(400);

    expect(mocks.markDiscordXpRoleSynced).not.toHaveBeenCalled();
  });

  it('creates a Discord support report for a linked user', async () => {
    const ticket = {
      publicId: 'SUP-ABC12345',
      status: 'new',
    };
    mocks.createDiscordSupportTicket.mockResolvedValue(ticket);
    mocks.notifySupportTicketCreated.mockResolvedValue(undefined);

    const res = await request(app())
      .post('/api/v1/discord/reports')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_USER_ID,
        privacy: 'private',
        category: 'bug',
        area: 'crafting',
        title: 'Forge broke',
        description: 'The forge did not refresh after upgrade.',
      })
      .expect(201);

    expect(res.body.ticket).toEqual({ publicId: 'SUP-ABC12345', status: 'new' });
    expect(mocks.createDiscordSupportTicket).toHaveBeenCalledWith({
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_USER_ID,
      input: {
        privacy: 'private',
        category: 'bug',
        area: 'crafting',
        title: 'Forge broke',
        description: 'The forge did not refresh after upgrade.',
      },
    });
    expect(mocks.notifySupportTicketCreated).toHaveBeenCalledOnce();
    expect(mocks.notifySupportTicketCreated.mock.calls[0]?.[0]).toBe(ticket);
  });

  it('delegates Discord support triage thread routes', async () => {
    mocks.listUnpostedSupportTicketsForDiscord.mockResolvedValue([{ publicId: 'SUP-ABC12345' }]);
    mocks.markSupportTriageMessage.mockResolvedValue({ publicId: 'SUP-ABC12345', discordMessageId: '34567890123456789' });
    mocks.markSupportThreadCreated.mockResolvedValue({ publicId: 'SUP-ABC12345', threadId: '45678901234567890' });
    mocks.archiveSupportThread.mockResolvedValue({ publicId: 'SUP-ABC12345', status: 'archived' });
    mocks.getSupportTicketActionContextForDiscord.mockResolvedValue({ publicId: 'SUP-ABC12345' });
    mocks.updateSupportTicketStatusFromDiscord.mockResolvedValue({ publicId: 'SUP-ABC12345', status: 'accepted' });

    await request(app())
      .get('/api/v1/discord/support/tickets/unposted?limit=5')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/triage-message')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        guildId: DISCORD_GUILD_ID,
        triageChannelId: '23456789012345678',
        triageMessageId: '34567890123456789',
      })
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/thread')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        threadId: '45678901234567890',
        createdByDiscordUserId: '56789012345678901',
      })
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/archive-thread')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ actorDiscordUserId: '56789012345678901' })
      .expect(200);
    await request(app())
      .get('/api/v1/discord/support/tickets/SUP-ABC12345/action-context')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/status')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ status: 'accepted', actorDiscordUserId: '56789012345678901' })
      .expect(200);

    expect(mocks.listUnpostedSupportTicketsForDiscord).toHaveBeenCalledWith(5);
    expect(mocks.markSupportTriageMessage).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      guildId: DISCORD_GUILD_ID,
      triageChannelId: '23456789012345678',
      triageMessageId: '34567890123456789',
    });
    expect(mocks.markSupportThreadCreated).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      threadId: '45678901234567890',
      createdByDiscordUserId: '56789012345678901',
    });
    expect(mocks.archiveSupportThread).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      actorDiscordUserId: '56789012345678901',
    });
    expect(mocks.getSupportTicketActionContextForDiscord).toHaveBeenCalledWith('SUP-ABC12345');
    expect(mocks.updateSupportTicketStatusFromDiscord).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      status: 'accepted',
      actorDiscordUserId: '56789012345678901',
    });
  });

  it('rejects Discord support status values that buttons do not emit', async () => {
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/status')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ status: 'duplicate', actorDiscordUserId: '56789012345678901' })
      .expect(400);

    expect(mocks.updateSupportTicketStatusFromDiscord).not.toHaveBeenCalled();
  });

  it('creates a pending Discord duel with internal bot auth', async () => {
    mocks.createPendingDiscordDuel.mockResolvedValue({
      id: DUEL_ID,
      status: 'pending',
      challengerUsername: 'Mira',
      targetUsername: 'Theo',
      expiresAt: new Date(LINKED_AT),
    });

    const res = await request(app())
      .post('/api/v1/discord/duels')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        guildId: DISCORD_GUILD_ID,
        channelId: DISCORD_CHANNEL_ID,
        challengerDiscordUserId: DISCORD_USER_ID,
        targetDiscordUserId: DISCORD_TARGET_USER_ID,
      })
      .expect(201);

    expect(res.body.duel).toEqual({
      id: DUEL_ID,
      status: 'pending',
      challengerUsername: 'Mira',
      targetUsername: 'Theo',
      expiresAt: LINKED_AT,
    });
    expect(mocks.createPendingDiscordDuel).toHaveBeenCalledWith({
      guildId: DISCORD_GUILD_ID,
      channelId: DISCORD_CHANNEL_ID,
      challengerDiscordUserId: DISCORD_USER_ID,
      targetDiscordUserId: DISCORD_TARGET_USER_ID,
    });
  });

  it('rejects malformed Discord duel create bodies', async () => {
    await request(app())
      .post('/api/v1/discord/duels')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        guildId: DISCORD_GUILD_ID,
        channelId: DISCORD_CHANNEL_ID,
        challengerDiscordUserId: 'not-a-snowflake',
        targetDiscordUserId: DISCORD_TARGET_USER_ID,
      })
      .expect(400);

    expect(mocks.createPendingDiscordDuel).not.toHaveBeenCalled();
  });

  it('records a Discord duel message id', async () => {
    mocks.recordDiscordDuelMessage.mockResolvedValue({ id: DUEL_ID, messageId: DISCORD_MESSAGE_ID });

    const res = await request(app())
      .post(`/api/v1/discord/duels/${DUEL_ID}/message`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ messageId: DISCORD_MESSAGE_ID })
      .expect(200);

    expect(res.body.duel).toEqual({ id: DUEL_ID, messageId: DISCORD_MESSAGE_ID });
    expect(mocks.recordDiscordDuelMessage).toHaveBeenCalledWith(DUEL_ID, DISCORD_MESSAGE_ID);
  });

  it('resolves a Discord duel for the accepting target', async () => {
    mocks.resolveDiscordDuel.mockResolvedValue({
      id: DUEL_ID,
      status: 'completed',
      winnerUsername: 'Mira',
      isDraw: false,
      summary: { outcome: 'victory', totalRounds: 3 },
      replay: { page: 1, pageSize: 10, hasMore: false, entries: [{ round: 1 }] },
    });

    const res = await request(app())
      .post(`/api/v1/discord/duels/${DUEL_ID}/resolve`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ acceptedByDiscordUserId: DISCORD_TARGET_USER_ID })
      .expect(200);

    expect(res.body.duel).toEqual({
      id: DUEL_ID,
      status: 'completed',
      winnerUsername: 'Mira',
      isDraw: false,
      summary: { outcome: 'victory', totalRounds: 3 },
      replay: { page: 1, pageSize: 10, hasMore: false, entries: [{ round: 1 }] },
    });
    expect(mocks.resolveDiscordDuel).toHaveBeenCalledWith(DUEL_ID, DISCORD_TARGET_USER_ID);
  });

  it('returns a paginated Discord duel replay', async () => {
    mocks.getDiscordDuelReplay.mockResolvedValue({
      id: DUEL_ID,
      status: 'completed',
      page: 2,
      pageSize: 10,
      hasMore: false,
      entries: [{ round: 11 }],
    });

    const res = await request(app())
      .get(`/api/v1/discord/duels/${DUEL_ID}/replay?page=2`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.replay).toEqual({
      id: DUEL_ID,
      status: 'completed',
      page: 2,
      pageSize: 10,
      hasMore: false,
      entries: [{ round: 11 }],
    });
    expect(mocks.getDiscordDuelReplay).toHaveBeenCalledWith(DUEL_ID, 2);
  });

  it('rejects Discord duel replay pages beyond the route cap', async () => {
    await request(app())
      .get(`/api/v1/discord/duels/${DUEL_ID}/replay?page=101`)
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(400);

    expect(mocks.getDiscordDuelReplay).not.toHaveBeenCalled();
  });

  it('requires internal bot auth for Discord duel routes', async () => {
    await request(app())
      .post('/api/v1/discord/duels')
      .send({
        guildId: DISCORD_GUILD_ID,
        channelId: DISCORD_CHANNEL_ID,
        challengerDiscordUserId: DISCORD_USER_ID,
        targetDiscordUserId: DISCORD_TARGET_USER_ID,
      })
      .expect(401);

    expect(mocks.createPendingDiscordDuel).not.toHaveBeenCalled();
  });

  it('GET /notifications/preferences returns toggles', async () => {
    mocks.listDiscordNotificationPreferences.mockResolvedValue([{ type: 'turns_capped', enabled: true }]);

    const res = await request(app())
      .get('/api/v1/discord/notifications/preferences')
      .query({ guildId: DISCORD_GUILD_ID, discordUserId: DISCORD_CHANNEL_ID })
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body).toEqual({ preferences: [{ type: 'turns_capped', enabled: true }] });
    expect(mocks.listDiscordNotificationPreferences).toHaveBeenCalledWith({
      guildId: DISCORD_GUILD_ID,
      discordUserId: DISCORD_CHANNEL_ID,
    });
  });

  it('POST /notifications/preferences upserts a toggle', async () => {
    mocks.upsertDiscordNotificationPreference.mockResolvedValue({ type: 'turns_capped', enabled: true });

    const res = await request(app())
      .post('/api/v1/discord/notifications/preferences')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_CHANNEL_ID,
        type: 'turns_capped',
        enabled: true,
      })
      .expect(200);

    expect(res.body).toEqual({ preference: { type: 'turns_capped', enabled: true } });
  });

  it('POST /notifications/preferences rejects unknown types', async () => {
    await request(app())
      .post('/api/v1/discord/notifications/preferences')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        discordGuildId: DISCORD_GUILD_ID,
        discordUserId: DISCORD_CHANNEL_ID,
        type: 'boss_spawned',
        enabled: true,
      })
      .expect(400);

    expect(mocks.upsertDiscordNotificationPreference).not.toHaveBeenCalled();
  });

  it('GET /notifications/pending returns events', async () => {
    mocks.listPendingDiscordNotificationEvents.mockResolvedValue([{ id: 'event-1' }]);

    const res = await request(app())
      .get('/api/v1/discord/notifications/pending')
      .query({ limit: 10 })
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body).toEqual({ events: [{ id: 'event-1' }] });
    expect(mocks.listPendingDiscordNotificationEvents).toHaveBeenCalledWith(10);
  });

  it('POST /notifications/ack acknowledges batches', async () => {
    mocks.ackDiscordNotificationEvents.mockResolvedValue({ delivered: 1, failed: 0 });

    const res = await request(app())
      .post('/api/v1/discord/notifications/ack')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ deliveredIds: ['1f8e9b3c-0000-4000-8000-000000000001'], failedIds: [] })
      .expect(200);

    expect(res.body).toEqual({ result: { delivered: 1, failed: 0 } });
    expect(mocks.ackDiscordNotificationEvents).toHaveBeenCalledWith({
      deliveredIds: ['1f8e9b3c-0000-4000-8000-000000000001'],
      failedIds: [],
    });
  });

  it('POST /notifications/ack rejects ids present in both batches', async () => {
    const id = '1f8e9b3c-0000-4000-8000-000000000001';

    await request(app())
      .post('/api/v1/discord/notifications/ack')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ deliveredIds: [id], failedIds: [id] })
      .expect(400);

    expect(mocks.ackDiscordNotificationEvents).not.toHaveBeenCalled();
  });

  it('rejects notification requests without the bot key', async () => {
    await request(app())
      .get('/api/v1/discord/notifications/pending')
      .expect(401);

    expect(mocks.listPendingDiscordNotificationEvents).not.toHaveBeenCalled();
  });

  it('requires bot auth and returns an item lookup card', async () => {
    await request(app()).get('/api/v1/discord/items/lookup?q=iron').expect(401);

    mocks.lookupItemForDiscord.mockResolvedValue({
      match: { name: 'Iron Ingot', sources: { drops: [], craft: null }, stats: [], season: null },
      suggestions: [],
    });

    const res = await request(app())
      .get('/api/v1/discord/items/lookup?q=iron%20ingot')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.match.name).toBe('Iron Ingot');
    expect(mocks.lookupItemForDiscord).toHaveBeenCalledWith('iron ingot');
  });

  it('returns mob suggestions when there is no exact match', async () => {
    mocks.lookupMobForDiscord.mockResolvedValue({ match: null, suggestions: ['Forest Spider'] });

    const res = await request(app())
      .get('/api/v1/discord/mobs/lookup?q=spider')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body).toEqual({ match: null, suggestions: ['Forest Spider'] });
  });

  it('requires bot auth and returns a resource lookup card', async () => {
    await request(app()).get('/api/v1/discord/resources/lookup?q=iron').expect(401);

    mocks.lookupResourceForDiscord.mockResolvedValue({
      match: {
        query: 'iron',
        resources: [
          {
            name: 'Iron Ore',
            tier: 3,
            zones: [{ name: 'Deep Mines', skillRequired: 'mining', levelRequired: 12 }],
          },
        ],
      },
      suggestions: [],
    });

    const res = await request(app())
      .get('/api/v1/discord/resources/lookup?q=iron')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.match.resources[0].zones[0].name).toBe('Deep Mines');
    expect(mocks.lookupResourceForDiscord).toHaveBeenCalledWith('iron');
  });

  it('rejects an empty lookup query', async () => {
    await request(app())
      .get('/api/v1/discord/items/lookup?q=')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(400);
  });
});
