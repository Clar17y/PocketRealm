import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { MAIL_CONSTANTS } from '@pocketrealm/shared';
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  unfriend,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getFriendProfile,
  findPlayerByUsername,
} from '../services/friendService';
import { blockPlayer, unblockPlayer, getBlockList } from '../services/blockService';
import { sendMail, getInbox, getSentMail, readMail, deleteMail, getUnreadCount } from '../services/friendMailService';
import { validateSpar, spendSparTurns, runSpar } from '../services/sparService';
import { getIo } from '../socket';

export const friendsRouter = Router();
friendsRouter.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────

function getOnlinePlayers(): Set<string> {
  const io = getIo();
  if (!io) return new Set();
  const players = new Set<string>();
  for (const [, socket] of io.sockets.sockets) {
    if (socket.data.playerId) players.add(socket.data.playerId);
  }
  return players;
}

// ── Schemas ──────────────────────────────────────────────────────────

const targetIdSchema = z.object({ targetId: z.string().uuid() });
const usernameSchema = z.object({ username: z.string().min(1).max(32) });
const mailSchema = z.object({
  recipientId: z.string().uuid(),
  subject: z.string().min(1).max(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH),
  body: z.string().min(1).max(MAIL_CONSTANTS.MAX_BODY_LENGTH),
});
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
});

// ── Friend Requests ──────────────────────────────────────────────────

friendsRouter.post('/request', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = targetIdSchema.parse(req.body);
  const result = await sendFriendRequest(playerId, body.targetId);
  res.json(result);
}));

friendsRouter.post('/request/search', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = usernameSchema.parse(req.body);
  const player = await findPlayerByUsername(body.username, playerId);
  res.json({ player });
}));

friendsRouter.get('/requests/incoming', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const requests = await getIncomingRequests(playerId);
  res.json({ requests });
}));

friendsRouter.get('/requests/outgoing', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const requests = await getOutgoingRequests(playerId);
  res.json({ requests });
}));

friendsRouter.post('/requests/:id/accept', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await acceptFriendRequest(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.post('/requests/:id/decline', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await declineFriendRequest(playerId, req.params.id);
  res.json({ success: true });
}));

// ── Friends List ─────────────────────────────────────────────────────

friendsRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const friends = await getFriends(playerId, getOnlinePlayers());
  res.json({ friends });
}));

friendsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await unfriend(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.get('/:id/profile', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const profile = await getFriendProfile(playerId, req.params.id, getOnlinePlayers());
  res.json({ profile });
}));

// ── Spar ─────────────────────────────────────────────────────────────

friendsRouter.post('/:id/spar', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { attackerId, defenderId } = await validateSpar(playerId, req.params.id);
  await spendSparTurns(attackerId);
  const result = await runSpar(attackerId, req.player!.username, defenderId);
  res.json(result);
}));

// ── Block ────────────────────────────────────────────────────────────

friendsRouter.post('/block', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = targetIdSchema.parse(req.body);
  await blockPlayer(playerId, body.targetId);
  res.json({ success: true });
}));

friendsRouter.delete('/block/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await unblockPlayer(playerId, req.params.id);
  res.json({ success: true });
}));

friendsRouter.get('/block', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const blocks = await getBlockList(playerId);
  res.json({ blocks });
}));

// ── Mail ─────────────────────────────────────────────────────────────

friendsRouter.post('/mail', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = mailSchema.parse(req.body);
  const mail = await sendMail(playerId, body.recipientId, body.subject, body.body);
  res.json({ mail });
}));

friendsRouter.get('/mail/inbox', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = paginationSchema.parse(req.query);
  const result = await getInbox(playerId, query.page);
  res.json(result);
}));

friendsRouter.get('/mail/sent', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const query = paginationSchema.parse(req.query);
  const result = await getSentMail(playerId, query.page);
  res.json(result);
}));

friendsRouter.get('/mail/unread-count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getUnreadCount(playerId);
  res.json({ count });
}));

friendsRouter.get('/mail/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const mail = await readMail(playerId, req.params.id);
  res.json({ mail });
}));

friendsRouter.delete('/mail/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await deleteMail(playerId, req.params.id);
  res.json({ success: true });
}));
