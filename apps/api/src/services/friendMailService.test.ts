import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import {
  sendMail,
  sendSystemMail,
  getInbox,
  getSentMail,
  readMail,
  deleteMail,
  getUnreadCount,
} from './friendMailService';
import { AppError } from '../middleware/errorHandler';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

import { isBlocked } from './blockService';

const SENDER_ID = 'player-1';
const RECIPIENT_ID = 'player-2';
const NOW = new Date('2026-03-01T12:00:00Z');

function makeMail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mail-1',
    senderId: SENDER_ID,
    recipientId: RECIPIENT_ID,
    subject: 'Hello',
    body: 'How are you?',
    goldCost: 25,
    isSystem: false,
    isRead: false,
    isDeletedBySender: false,
    isDeletedByRecipient: false,
    createdAt: NOW,
    sender: { username: 'Alice' },
    recipient: { username: 'Bob' },
    ...overrides,
  };
}

describe('friendMailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  describe('sendMail', () => {
    it('deducts gold and creates mail for accepted friends', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.findUnique.mockResolvedValue({ gold: 100 });
      mockPrisma.player.update.mockResolvedValue({});
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      const result = await sendMail(SENDER_ID, RECIPIENT_ID, 'Hello', 'How are you?');

      expect(result.id).toBe('mail-1');
      expect(result.senderName).toBe('Alice');
      expect(result.recipientName).toBe('Bob');
      expect(result.goldCost).toBe(25);
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: SENDER_ID },
        data: { gold: { decrement: 25 } },
      });
      expect(mockPrisma.friendMail.create).toHaveBeenCalledWith({
        data: {
          senderId: SENDER_ID,
          recipientId: RECIPIENT_ID,
          subject: 'Hello',
          body: 'How are you?',
          goldCost: 25,
          isSystem: false,
        },
        include: {
          sender: { select: { username: true } },
          recipient: { select: { username: true } },
        },
      });
    });

    it('throws SELF_MAIL when sending to yourself', async () => {
      await expect(sendMail(SENDER_ID, SENDER_ID, 'Hi', 'Body')).rejects.toThrow(AppError);
      await expect(sendMail(SENDER_ID, SENDER_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'SELF_MAIL',
      });
    });

    it('throws NOT_FRIENDS when no accepted friendship exists', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toThrow(AppError);
      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'NOT_FRIENDS',
      });
    });

    it('throws BLOCKED when sender has blocked recipient', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      (isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toThrow(AppError);
      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'BLOCKED',
      });
    });

    it('throws INSUFFICIENT_GOLD when sender cannot afford the cost', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.findUnique.mockResolvedValue({ gold: 10 });

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toThrow(AppError);
      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_GOLD',
      });
    });
  });

  describe('sendSystemMail', () => {
    it('creates mail with isSystem=true and goldCost=0', async () => {
      mockPrisma.friendMail.create.mockResolvedValue(
        makeMail({ isSystem: true, goldCost: 0 }),
      );

      const result = await sendSystemMail(SENDER_ID, RECIPIENT_ID, 'System', 'You have mail');

      expect(result.isSystem).toBe(true);
      expect(result.goldCost).toBe(0);
      expect(mockPrisma.friendMail.create).toHaveBeenCalledWith({
        data: {
          senderId: SENDER_ID,
          recipientId: RECIPIENT_ID,
          subject: 'System',
          body: 'You have mail',
          goldCost: 0,
          isSystem: true,
        },
        include: {
          sender: { select: { username: true } },
          recipient: { select: { username: true } },
        },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread mails', async () => {
      mockPrisma.friendMail.count.mockResolvedValue(7);

      const count = await getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(7);
      expect(mockPrisma.friendMail.count).toHaveBeenCalledWith({
        where: { recipientId: RECIPIENT_ID, isRead: false, isDeletedByRecipient: false },
      });
    });
  });

  describe('readMail', () => {
    it('marks mail as read when recipient reads it', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(makeMail());
      mockPrisma.friendMail.update.mockResolvedValue({});

      const result = await readMail(RECIPIENT_ID, 'mail-1');

      expect(result.isRead).toBe(true);
      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isRead: true },
      });
    });

    it('returns mail without marking read when sender reads it', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(makeMail({ isRead: false }));

      const result = await readMail(SENDER_ID, 'mail-1');

      expect(result.isRead).toBe(false);
      expect(mockPrisma.friendMail.update).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when mail does not exist', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(null);

      await expect(readMail(SENDER_ID, 'mail-999')).rejects.toThrow(AppError);
      await expect(readMail(SENDER_ID, 'mail-999')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('deleteMail', () => {
    it('soft-deletes when other side has not deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ID,
        recipientId: RECIPIENT_ID,
        isDeletedBySender: false,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.update.mockResolvedValue({});

      await deleteMail(RECIPIENT_ID, 'mail-1');

      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isDeletedByRecipient: true },
      });
      expect(mockPrisma.friendMail.delete).not.toHaveBeenCalled();
    });

    it('hard-deletes when other side has already deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ID,
        recipientId: RECIPIENT_ID,
        isDeletedBySender: true,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.delete.mockResolvedValue({});

      await deleteMail(RECIPIENT_ID, 'mail-1');

      expect(mockPrisma.friendMail.delete).toHaveBeenCalledWith({ where: { id: 'mail-1' } });
      expect(mockPrisma.friendMail.update).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND when mail does not exist', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(null);

      await expect(deleteMail(SENDER_ID, 'mail-999')).rejects.toThrow(AppError);
      await expect(deleteMail(SENDER_ID, 'mail-999')).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('getInbox', () => {
    it('returns paginated inbox results', async () => {
      const mails = [makeMail(), makeMail({ id: 'mail-2' })];
      mockPrisma.friendMail.findMany.mockResolvedValue(mails);
      mockPrisma.friendMail.count.mockResolvedValue(2);

      const result = await getInbox(RECIPIENT_ID, 1, 20);

      expect(result.mails).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { recipientId: RECIPIENT_ID, isDeletedByRecipient: false },
        include: {
          sender: { select: { username: true } },
          recipient: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });
  });

  describe('getSentMail', () => {
    it('returns paginated sent mail results excluding system mails', async () => {
      const mails = [makeMail()];
      mockPrisma.friendMail.findMany.mockResolvedValue(mails);
      mockPrisma.friendMail.count.mockResolvedValue(1);

      const result = await getSentMail(SENDER_ID, 1, 10);

      expect(result.mails).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { senderId: SENDER_ID, isDeletedBySender: false, isSystem: false },
        include: {
          sender: { select: { username: true } },
          recipient: { select: { username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });
  });
});
