import { Router } from 'express';
import { NPC_DIALOGUE, type NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { getNpcActivityReaction } from '../services/chatActivityService';
import { getAuthorizedChannelHistory } from '../services/chatService';
import { asyncHandler } from '../utils/asyncHandler';

export const chatRouter = Router();

chatRouter.use(authenticate);

const historyQuerySchema = z.object({
  channelType: z.enum(['world', 'zone', 'guild', 'casino']),
  channelId: z.string().min(1).max(64),
  messageType: z.enum(['player', 'system', 'activity', 'non_activity']).optional(),
});

const npcReactionQuerySchema = z.object({
  npcKey: z.string().min(1).max(64),
});

chatRouter.get('/history', asyncHandler(async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid query', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { channelType, channelId, messageType } = parsed.data;
  const messages = await getAuthorizedChannelHistory(
    req.player!.playerId,
    channelType,
    channelId,
    messageType ? { messageType } : {},
  );
  res.json({ messages });
}));

chatRouter.get('/activity/npc-reaction', asyncHandler(async (req, res) => {
  const parsed = npcReactionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Invalid query', code: 'VALIDATION_ERROR' } });
    return;
  }

  const { npcKey } = parsed.data;
  if (!Object.prototype.hasOwnProperty.call(NPC_DIALOGUE, npcKey)) {
    res.status(400).json({ error: { message: 'Unknown NPC', code: 'UNKNOWN_NPC' } });
    return;
  }

  const reaction = await getNpcActivityReaction(req.player!.playerId, npcKey as NpcKey);
  res.json({ reaction });
}));
