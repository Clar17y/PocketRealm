import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/errorHandler';
import { supportRouter } from './support';

const mocks = vi.hoisted(() => ({
  createSupportTicket: vi.fn(),
  updateSupportTicket: vi.fn(),
  listSupportTicketsForExport: vi.fn(),
  supportTicketToAdminRecord: vi.fn(),
  supportTicketToJsonl: vi.fn(),
  notifySupportTicketCreated: vi.fn(),
  accountRole: 'player',
  playerSeasonId: null as string | null,
  requestSeason: undefined as { id: string; name: string } | undefined,
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    Object.assign(req, {
      player: {
        accountId: 'account-1',
        playerId: 'player-1',
        username: 'Mira',
        seasonId: mocks.playerSeasonId,
        role: mocks.accountRole,
      },
      account: { id: 'account-1', role: mocks.accountRole },
      season: mocks.requestSeason,
    });
    next();
  },
}));

vi.mock('../middleware/admin', () => ({
  requireAdmin: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.account?.role !== 'admin') {
      return next(new AppError(403, 'Admin access required', 'FORBIDDEN'));
    }
    next();
  },
}));

vi.mock('../services/supportTicketService', () => ({
  createSupportTicket: mocks.createSupportTicket,
  updateSupportTicket: mocks.updateSupportTicket,
  listSupportTicketsForExport: mocks.listSupportTicketsForExport,
  supportTicketToAdminRecord: mocks.supportTicketToAdminRecord,
  supportTicketToJsonl: mocks.supportTicketToJsonl,
}));

vi.mock('../services/discordSupportNotifier', () => ({
  notifySupportTicketCreated: mocks.notifySupportTicketCreated,
}));

function app() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/support', supportRouter);
  app.use(errorHandler);
  return app;
}

describe('supportRouter', () => {
  beforeEach(() => {
    mocks.createSupportTicket.mockReset();
    mocks.updateSupportTicket.mockReset();
    mocks.listSupportTicketsForExport.mockReset();
    mocks.supportTicketToAdminRecord.mockReset();
    mocks.supportTicketToJsonl.mockReset();
    mocks.notifySupportTicketCreated.mockReset();
    mocks.notifySupportTicketCreated.mockResolvedValue(undefined);
    mocks.accountRole = 'player';
    mocks.playerSeasonId = null;
    mocks.requestSeason = undefined;
  });

  it('creates a support ticket for the authenticated player', async () => {
    mocks.createSupportTicket.mockResolvedValue({
      publicId: 'SUP-1',
      status: 'new',
      title: 'Combat stuck',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
      screen: 'combat',
    });

    const res = await request(app())
      .post('/api/v1/support/tickets')
      .send({
        privacy: 'private',
        category: 'bug',
        area: 'combat',
        title: 'Combat stuck',
        description: 'Combat playback stopped after round two.',
      })
      .expect(201);

    expect(res.body).toEqual({ ticket: { publicId: 'SUP-1', status: 'new' } });
    expect(mocks.createSupportTicket).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'account-1',
      playerId: 'player-1',
      seasonId: null,
      reporterDisplayName: 'Mira',
      realmLabel: 'Preseason',
    }));
    expect(mocks.notifySupportTicketCreated).toHaveBeenCalledOnce();
  });

  it('creates a support ticket with the active season id and name', async () => {
    mocks.playerSeasonId = 'season-1';
    mocks.requestSeason = { id: 'season-1', name: 'Season One' };
    mocks.createSupportTicket.mockResolvedValue({
      publicId: 'SUP-1',
      status: 'new',
      title: 'Season combat stuck',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      reporterDisplayName: 'Mira',
      realmLabel: 'Season One',
      seasonId: 'season-1',
      screen: 'combat',
    });

    await request(app())
      .post('/api/v1/support/tickets')
      .send({
        privacy: 'private',
        category: 'bug',
        area: 'combat',
        title: 'Season combat stuck',
        description: 'Season combat playback stopped after round two.',
      })
      .expect(201);

    expect(mocks.createSupportTicket).toHaveBeenCalledWith(expect.objectContaining({
      seasonId: 'season-1',
      realmLabel: 'Season One',
    }));
  });

  it('rejects invalid reports', async () => {
    const res = await request(app())
      .post('/api/v1/support/tickets')
      .send({ title: 'bad' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires admin access for support ticket updates', async () => {
    const res = await request(app())
      .patch('/api/v1/support/tickets/SUP-1')
      .send({ status: 'accepted' })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mocks.updateSupportTicket).not.toHaveBeenCalled();
  });

  it('updates support tickets for admins', async () => {
    mocks.accountRole = 'admin';
    mocks.updateSupportTicket.mockResolvedValue({ publicId: 'SUP-1', status: 'accepted' });

    const res = await request(app())
      .patch('/api/v1/support/tickets/SUP-1')
      .send({ status: 'accepted', note: 'Reproduced locally.' })
      .expect(200);

    expect(res.body).toEqual({ ticket: { publicId: 'SUP-1', status: 'accepted' } });
    expect(mocks.updateSupportTicket).toHaveBeenCalledWith('SUP-1', 'account-1', {
      status: 'accepted',
      note: 'Reproduced locally.',
    });
  });

  it('exports support tickets as ndjson for admins', async () => {
    mocks.accountRole = 'admin';
    const ticket = { publicId: 'SUP-1' };
    mocks.listSupportTicketsForExport.mockResolvedValue([ticket]);
    mocks.supportTicketToJsonl.mockReturnValue('{"id":"SUP-1"}\n');

    const res = await request(app())
      .get('/api/v1/support/tickets/export?status=new,needs_info&limit=10&createdAfter=2026-05-30T12:00:00.000Z')
      .expect(200);

    expect(res.headers['content-type']).toContain('application/x-ndjson');
    expect(res.text).toBe('{"id":"SUP-1"}\n');
    expect(mocks.listSupportTicketsForExport).toHaveBeenCalledWith({
      statuses: ['new', 'needs_info'],
      limit: 10,
      createdAfter: new Date('2026-05-30T12:00:00.000Z'),
    });
    expect(mocks.supportTicketToJsonl.mock.calls[0]?.[0]).toBe(ticket);
  });

  it('lists support tickets as json for admins', async () => {
    mocks.accountRole = 'admin';
    const ticket = { publicId: 'SUP-1' };
    const record = {
      id: 'SUP-1',
      status: 'new',
      privacy: 'private',
      category: 'bug',
      area: 'combat',
      title: 'Combat stuck',
      body: 'Combat playback stopped.',
      reporter: { displayName: 'Mira', realm: 'Preseason' },
      context: { screen: 'combat' },
      sensitivityFlags: [],
      duplicateTicketIds: [],
      githubIssueUrl: null,
      createdAt: '2026-06-01T20:00:00.000Z',
      updatedAt: '2026-06-01T20:00:00.000Z',
    };
    mocks.listSupportTicketsForExport.mockResolvedValue([ticket]);
    mocks.supportTicketToAdminRecord.mockReturnValue(record);

    const res = await request(app())
      .get('/api/v1/support/tickets?status=new,needs_info&limit=25')
      .expect(200);

    expect(res.body).toEqual({ tickets: [record] });
    expect(mocks.listSupportTicketsForExport).toHaveBeenCalledWith({
      statuses: ['new', 'needs_info'],
      limit: 25,
      createdAfter: undefined,
    });
    expect(mocks.supportTicketToAdminRecord.mock.calls[0]?.[0]).toBe(ticket);
  });

  it('rejects invalid export status filters', async () => {
    mocks.accountRole = 'admin';

    const res = await request(app())
      .get('/api/v1/support/tickets/export?status=not-a-status')
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.listSupportTicketsForExport).not.toHaveBeenCalled();
  });
});
