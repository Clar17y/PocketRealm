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
  DISCORD_DUEL_REPLAY_MAX_PAGE: 100,
  createPendingDiscordDuel: mocks.createPendingDiscordDuel,
  recordDiscordDuelMessage: mocks.recordDiscordDuelMessage,
  resolveDiscordDuel: mocks.resolveDiscordDuel,
  getDiscordDuelReplay: mocks.getDiscordDuelReplay,
}));

import { discordRouter } from './discord';

const DISCORD_USER_ID = '1234567890123456';
const DISCORD_GUILD_ID = '2345678901234567';
const DISCORD_CHANNEL_ID = '3456789012345678';
const DISCORD_TARGET_USER_ID = '4567890123456789';
const DISCORD_MESSAGE_ID = '5678901234567890';
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
    const originalPublicWebUrl = process.env.PUBLIC_WEB_URL;
    process.env.PUBLIC_WEB_URL = 'https://pocketrealm.example';
    mocks.searchWikiForDiscord.mockReturnValue([{ title: 'Forge', url: 'https://pocketrealm.example/wiki/items/forge' }]);

    const res = await request(app())
      .get('/api/v1/discord/wiki/search?q=forge')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);

    expect(res.body.results).toEqual([{ title: 'Forge', url: 'https://pocketrealm.example/wiki/items/forge' }]);
    expect(mocks.searchWikiForDiscord).toHaveBeenCalledWith('forge', 'https://pocketrealm.example');

    if (originalPublicWebUrl === undefined) {
      delete process.env.PUBLIC_WEB_URL;
    } else {
      process.env.PUBLIC_WEB_URL = originalPublicWebUrl;
    }
  });

  it('creates a Discord support report for a linked user', async () => {
    mocks.createDiscordSupportTicket.mockResolvedValue({
      publicId: 'SUP-ABC12345',
      status: 'new',
    });

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
  });

  it('delegates Discord support triage thread routes', async () => {
    mocks.listUnpostedSupportTicketsForDiscord.mockResolvedValue([{ publicId: 'SUP-ABC12345' }]);
    mocks.markSupportTriageMessage.mockResolvedValue({ publicId: 'SUP-ABC12345', discordMessageId: '3456789012345678' });
    mocks.markSupportThreadCreated.mockResolvedValue({ publicId: 'SUP-ABC12345', threadId: '4567890123456789' });
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
        triageChannelId: '2345678901234567',
        triageMessageId: '3456789012345678',
      })
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/thread')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({
        threadId: '4567890123456789',
        createdByDiscordUserId: '5678901234567890',
      })
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/archive-thread')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ actorDiscordUserId: '5678901234567890' })
      .expect(200);
    await request(app())
      .get('/api/v1/discord/support/tickets/SUP-ABC12345/action-context')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .expect(200);
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/status')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ status: 'accepted', actorDiscordUserId: '5678901234567890' })
      .expect(200);

    expect(mocks.listUnpostedSupportTicketsForDiscord).toHaveBeenCalledWith(5);
    expect(mocks.markSupportTriageMessage).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      guildId: DISCORD_GUILD_ID,
      triageChannelId: '2345678901234567',
      triageMessageId: '3456789012345678',
    });
    expect(mocks.markSupportThreadCreated).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      threadId: '4567890123456789',
      createdByDiscordUserId: '5678901234567890',
    });
    expect(mocks.archiveSupportThread).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      actorDiscordUserId: '5678901234567890',
    });
    expect(mocks.getSupportTicketActionContextForDiscord).toHaveBeenCalledWith('SUP-ABC12345');
    expect(mocks.updateSupportTicketStatusFromDiscord).toHaveBeenCalledWith({
      publicId: 'SUP-ABC12345',
      status: 'accepted',
      actorDiscordUserId: '5678901234567890',
    });
  });

  it('rejects Discord support status values that buttons do not emit', async () => {
    await request(app())
      .post('/api/v1/discord/support/tickets/SUP-ABC12345/status')
      .set('x-pocketrealm-bot-key', 'bot-key')
      .send({ status: 'duplicate', actorDiscordUserId: '5678901234567890' })
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
});
