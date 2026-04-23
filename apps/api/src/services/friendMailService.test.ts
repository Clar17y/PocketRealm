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
import { MAIL_CONSTANTS } from '@pocketrealm/shared';

vi.mock('./blockService', () => ({
  isBlocked: vi.fn().mockResolvedValue(false),
}));

import { isBlocked } from './blockService';

const SENDER_ID = 'player-1';
const RECIPIENT_ID = 'player-2';
const SENDER_ACCOUNT_ID = 'account-1';
const RECIPIENT_ACCOUNT_ID = 'account-2';
const NOW = new Date('2026-03-01T12:00:00Z');

function makeMail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mail-1',
    senderId: SENDER_ACCOUNT_ID,
    recipientId: RECIPIENT_ACCOUNT_ID,
    subject: 'Hello',
    body: 'How are you?',
    goldCost: 25,
    isSystem: false,
    isRead: false,
    isDeletedBySender: false,
    isDeletedByRecipient: false,
    createdAt: NOW,
    sender: { activePlayer: { id: SENDER_ID, username: 'Alice' } },
    recipient: { activePlayer: { id: RECIPIENT_ID, username: 'Bob' } },
    ...overrides,
  };
}

describe('friendMailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isBlocked as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    mockPrisma.player.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === SENDER_ID) {
        return Promise.resolve({ id: SENDER_ID, accountId: SENDER_ACCOUNT_ID, username: 'Alice' });
      }
      if (where.id === RECIPIENT_ID) {
        return Promise.resolve({ id: RECIPIENT_ID, accountId: RECIPIENT_ACCOUNT_ID, username: 'Bob' });
      }
      return Promise.resolve({
        id: where.id,
        accountId: `account:${where.id}`,
        username: where.id,
      });
    });
  });

  // ─── sendMail ──────────────────────────────────────────────────────────

  describe('sendMail', () => {
    it('deducts gold and creates mail for accepted friends', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      const result = await sendMail(SENDER_ID, RECIPIENT_ID, 'Hello', 'How are you?');

      expect(result.id).toBe('mail-1');
      expect(result.senderName).toBe('Alice');
      expect(result.recipientName).toBe('Bob');
      expect(result.goldCost).toBe(25);
      expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
        where: { id: SENDER_ID, gold: { gte: MAIL_CONSTANTS.GOLD_COST } },
        data: { gold: { decrement: MAIL_CONSTANTS.GOLD_COST } },
      });
      expect(mockPrisma.friendMail.create).toHaveBeenCalledWith({
        data: {
          senderId: SENDER_ACCOUNT_ID,
          recipientId: RECIPIENT_ACCOUNT_ID,
          subject: 'Hello',
          body: 'How are you?',
          goldCost: MAIL_CONSTANTS.GOLD_COST,
          isSystem: false,
        },
        include: {
          sender: { select: { activePlayer: { select: { id: true, username: true } } } },
          recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
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

    it('throws BLOCKED when recipient has blocked sender (reverse direction)', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      // First call (sender→recipient) returns false, second call (recipient→sender) returns true
      (isBlocked as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'BLOCKED',
      });
      // Both directions checked
      expect(isBlocked).toHaveBeenCalledWith(SENDER_ID, RECIPIENT_ID);
      expect(isBlocked).toHaveBeenCalledWith(RECIPIENT_ID, SENDER_ID);
    });

    it('throws INSUFFICIENT_GOLD when sender cannot afford the cost', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 0 });

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toThrow(AppError);
      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INSUFFICIENT_GOLD',
      });
    });

    it('truncates subject to MAX_SUBJECT_LENGTH', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      const longSubject = 'A'.repeat(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH + 50);
      await sendMail(SENDER_ID, RECIPIENT_ID, longSubject, 'Body');

      const createCall = mockPrisma.friendMail.create.mock.calls[0][0];
      expect(createCall.data.subject).toHaveLength(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH);
      expect(createCall.data.subject).toBe('A'.repeat(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH));
    });

    it('truncates body to MAX_BODY_LENGTH', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      const longBody = 'B'.repeat(MAIL_CONSTANTS.MAX_BODY_LENGTH + 200);
      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', longBody);

      const createCall = mockPrisma.friendMail.create.mock.calls[0][0];
      expect(createCall.data.body).toHaveLength(MAIL_CONSTANTS.MAX_BODY_LENGTH);
      expect(createCall.data.body).toBe('B'.repeat(MAIL_CONSTANTS.MAX_BODY_LENGTH));
    });

    it('does not truncate subject/body when within limits', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Short', 'Also short');

      const createCall = mockPrisma.friendMail.create.mock.calls[0][0];
      expect(createCall.data.subject).toBe('Short');
      expect(createCall.data.body).toBe('Also short');
    });

    it('prunes recipient inbox when count exceeds MAX_INBOX_SIZE', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      // First count call returns inbox over limit, second returns sent within limit
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_INBOX_SIZE + 3) // inbox count
        .mockResolvedValueOnce(10); // sent count
      mockPrisma.friendMail.findMany.mockResolvedValue([
        { id: 'old-1' },
        { id: 'old-2' },
        { id: 'old-3' },
      ]);
      mockPrisma.friendMail.updateMany.mockResolvedValue({ count: 3 });

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // Should find oldest 3 to prune
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { recipientId: RECIPIENT_ACCOUNT_ID, isDeletedByRecipient: false },
        orderBy: { createdAt: 'asc' },
        take: 3,
        select: { id: true },
      });
      // Should soft-delete them
      expect(mockPrisma.friendMail.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['old-1', 'old-2', 'old-3'] } },
        data: { isDeletedByRecipient: true },
      });
    });

    it('does not prune inbox when count is at or below MAX_INBOX_SIZE', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_INBOX_SIZE) // exactly at limit
        .mockResolvedValueOnce(10); // sent count

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // findMany should not be called for pruning
      expect(mockPrisma.friendMail.findMany).not.toHaveBeenCalled();
    });

    it('prunes sender sent mail when count exceeds MAX_SENT_SIZE', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(50) // inbox within limit
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_SENT_SIZE + 2); // sent over limit
      mockPrisma.friendMail.findMany.mockResolvedValue([
        { id: 'sent-old-1' },
        { id: 'sent-old-2' },
      ]);
      mockPrisma.friendMail.updateMany.mockResolvedValue({ count: 2 });

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // Should find oldest 2 sent to prune
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { senderId: SENDER_ACCOUNT_ID, isDeletedBySender: false, isSystem: false },
        orderBy: { createdAt: 'asc' },
        take: 2,
        select: { id: true },
      });
      // Should soft-delete sender side
      expect(mockPrisma.friendMail.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['sent-old-1', 'sent-old-2'] } },
        data: { isDeletedBySender: true },
      });
    });

    it('does not prune sent mail when count is at or below MAX_SENT_SIZE', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(50)                        // inbox fine
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_SENT_SIZE); // exactly at sent limit

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // No prune queries
      expect(mockPrisma.friendMail.findMany).not.toHaveBeenCalled();
    });

    it('prunes both inbox and sent mail when both are over limit', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_INBOX_SIZE + 1) // inbox over
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_SENT_SIZE + 1); // sent over
      mockPrisma.friendMail.findMany
        .mockResolvedValueOnce([{ id: 'inbox-old-1' }])  // inbox oldest
        .mockResolvedValueOnce([{ id: 'sent-old-1' }]);  // sent oldest
      mockPrisma.friendMail.updateMany.mockResolvedValue({ count: 1 });

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // Two findMany calls: one for inbox prune, one for sent prune
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledTimes(2);
      // Two updateMany calls: one for inbox prune, one for sent prune
      expect(mockPrisma.friendMail.updateMany).toHaveBeenCalledTimes(2);
    });

    it('skips inbox prune update when findMany returns empty array', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count
        .mockResolvedValueOnce(MAIL_CONSTANTS.MAX_INBOX_SIZE + 1) // inbox over
        .mockResolvedValueOnce(10); // sent fine
      mockPrisma.friendMail.findMany.mockResolvedValue([]); // empty oldest

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      // findMany called but updateMany NOT called since oldest is empty
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.friendMail.updateMany).not.toHaveBeenCalled();
    });

    it('runs within a $transaction', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.friendMail.create.mockResolvedValue(makeMail());
      mockPrisma.friendMail.count.mockResolvedValue(5);

      await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it('converts createdAt Date to ISO string in return value', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue({ id: 'friend-1' });
      mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
      const customDate = new Date('2026-06-15T08:30:00Z');
      mockPrisma.friendMail.create.mockResolvedValue(makeMail({ createdAt: customDate }));
      mockPrisma.friendMail.count.mockResolvedValue(5);

      const result = await sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body');

      expect(result.createdAt).toBe('2026-06-15T08:30:00.000Z');
      expect(typeof result.createdAt).toBe('string');
    });

    it('queries friendship with OR clause for both directions', async () => {
      mockPrisma.friendship.findFirst.mockResolvedValue(null);

      await expect(sendMail(SENDER_ID, RECIPIENT_ID, 'Hi', 'Body')).rejects.toThrow();

      expect(mockPrisma.friendship.findFirst).toHaveBeenCalledWith({
        where: {
          status: 'accepted',
          OR: [
            { senderId: SENDER_ACCOUNT_ID, receiverId: RECIPIENT_ACCOUNT_ID },
            { senderId: RECIPIENT_ACCOUNT_ID, receiverId: SENDER_ACCOUNT_ID },
          ],
        },
        select: { id: true },
      });
    });
  });

  // ─── sendSystemMail ────────────────────────────────────────────────────

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
          senderId: SENDER_ACCOUNT_ID,
          recipientId: RECIPIENT_ACCOUNT_ID,
          subject: 'System',
          body: 'You have mail',
          goldCost: 0,
          isSystem: true,
        },
        include: {
          sender: { select: { activePlayer: { select: { id: true, username: true } } } },
          recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
        },
      });
    });

    it('truncates subject and body to max lengths', async () => {
      const longSubject = 'S'.repeat(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH + 10);
      const longBody = 'B'.repeat(MAIL_CONSTANTS.MAX_BODY_LENGTH + 50);
      mockPrisma.friendMail.create.mockResolvedValue(
        makeMail({ isSystem: true, goldCost: 0 }),
      );

      await sendSystemMail(SENDER_ID, RECIPIENT_ID, longSubject, longBody);

      const createCall = mockPrisma.friendMail.create.mock.calls[0][0];
      expect(createCall.data.subject).toHaveLength(MAIL_CONSTANTS.MAX_SUBJECT_LENGTH);
      expect(createCall.data.body).toHaveLength(MAIL_CONSTANTS.MAX_BODY_LENGTH);
    });

    it('does not check friendship or blocks', async () => {
      mockPrisma.friendMail.create.mockResolvedValue(
        makeMail({ isSystem: true, goldCost: 0 }),
      );

      await sendSystemMail(SENDER_ID, RECIPIENT_ID, 'System', 'Body');

      expect(mockPrisma.friendship.findFirst).not.toHaveBeenCalled();
      expect(isBlocked).not.toHaveBeenCalled();
    });

    it('does not deduct gold', async () => {
      mockPrisma.friendMail.create.mockResolvedValue(
        makeMail({ isSystem: true, goldCost: 0 }),
      );

      await sendSystemMail(SENDER_ID, RECIPIENT_ID, 'System', 'Body');

      expect(mockPrisma.player.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('converts createdAt to ISO string', async () => {
      const customDate = new Date('2026-01-01T00:00:00Z');
      mockPrisma.friendMail.create.mockResolvedValue(
        makeMail({ isSystem: true, goldCost: 0, createdAt: customDate }),
      );

      const result = await sendSystemMail(SENDER_ID, RECIPIENT_ID, 'System', 'Body');

      expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  // ─── getInbox ──────────────────────────────────────────────────────────

  describe('getInbox', () => {
    it('returns paginated inbox results', async () => {
      const mails = [makeMail(), makeMail({ id: 'mail-2' })];
      mockPrisma.friendMail.findMany.mockResolvedValue(mails);
      mockPrisma.friendMail.count.mockResolvedValue(2);

      const result = await getInbox(RECIPIENT_ID, 1, 20);

      expect(result.mails).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { recipientId: RECIPIENT_ACCOUNT_ID, isDeletedByRecipient: false },
        include: {
          sender: { select: { activePlayer: { select: { id: true, username: true } } } },
          recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('uses default page=1 and pageSize=20 when not provided', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(0);

      await getInbox(RECIPIENT_ID);

      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calculates correct offset for page 2', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(30);

      await getInbox(RECIPIENT_ID, 2, 10);

      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('calculates correct offset for page 3 with pageSize 5', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(50);

      await getInbox(RECIPIENT_ID, 3, 5);

      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('returns empty mails array when no mails exist', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(0);

      const result = await getInbox(RECIPIENT_ID);

      expect(result.mails).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('maps each mail through toMailEntry', async () => {
      const date1 = new Date('2026-01-01T00:00:00Z');
      const date2 = new Date('2026-02-01T00:00:00Z');
      const mails = [
        makeMail({ id: 'mail-1', createdAt: date1 }),
        makeMail({ id: 'mail-2', createdAt: date2 }),
      ];
      mockPrisma.friendMail.findMany.mockResolvedValue(mails);
      mockPrisma.friendMail.count.mockResolvedValue(2);

      const result = await getInbox(RECIPIENT_ID);

      expect(result.mails[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.mails[1].createdAt).toBe('2026-02-01T00:00:00.000Z');
      // Should have senderName, not sender object
      expect(result.mails[0].senderName).toBe('Alice');
      expect(result.mails[0]).not.toHaveProperty('sender');
    });
  });

  // ─── getSentMail ───────────────────────────────────────────────────────

  describe('getSentMail', () => {
    it('returns paginated sent mail results excluding system mails', async () => {
      const mails = [makeMail()];
      mockPrisma.friendMail.findMany.mockResolvedValue(mails);
      mockPrisma.friendMail.count.mockResolvedValue(1);

      const result = await getSentMail(SENDER_ID, 1, 10);

      expect(result.mails).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith({
        where: { senderId: SENDER_ACCOUNT_ID, isDeletedBySender: false, isSystem: false },
        include: {
          sender: { select: { activePlayer: { select: { id: true, username: true } } } },
          recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('uses default page=1 and pageSize=20 when not provided', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(0);

      await getSentMail(SENDER_ID);

      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calculates correct offset for page 2', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(30);

      await getSentMail(SENDER_ID, 2, 15);

      expect(mockPrisma.friendMail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 15, take: 15 }),
      );
    });

    it('returns empty mails array when none sent', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(0);

      const result = await getSentMail(SENDER_ID);

      expect(result.mails).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('filters by senderId in where clause', async () => {
      mockPrisma.friendMail.findMany.mockResolvedValue([]);
      mockPrisma.friendMail.count.mockResolvedValue(0);

      await getSentMail('custom-player');

      const whereClause = mockPrisma.friendMail.findMany.mock.calls[0][0].where;
      expect(whereClause.senderId).toBe('account:custom-player');
    });
  });

  // ─── readMail ──────────────────────────────────────────────────────────

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

    it('does not update when recipient has already read the mail', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(makeMail({ isRead: true }));

      const result = await readMail(RECIPIENT_ID, 'mail-1');

      expect(result.isRead).toBe(true);
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

    it('queries with OR clause allowing both sender and recipient to read', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(makeMail());
      mockPrisma.friendMail.update.mockResolvedValue({});

      await readMail(RECIPIENT_ID, 'mail-1');

      expect(mockPrisma.friendMail.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'mail-1',
          OR: [
            { recipientId: RECIPIENT_ACCOUNT_ID, isDeletedByRecipient: false },
            { senderId: RECIPIENT_ACCOUNT_ID, isDeletedBySender: false },
          ],
        },
        include: {
          sender: { select: { activePlayer: { select: { id: true, username: true } } } },
          recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
        },
      });
    });

    it('converts createdAt to ISO string in the return value', async () => {
      const customDate = new Date('2026-07-04T15:00:00Z');
      mockPrisma.friendMail.findFirst.mockResolvedValue(
        makeMail({ isRead: true, createdAt: customDate }),
      );

      const result = await readMail(RECIPIENT_ID, 'mail-1');

      expect(result.createdAt).toBe('2026-07-04T15:00:00.000Z');
    });
  });

  // ─── deleteMail ────────────────────────────────────────────────────────

  describe('deleteMail', () => {
    it('soft-deletes for recipient when sender has not deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ACCOUNT_ID,
        recipientId: RECIPIENT_ACCOUNT_ID,
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

    it('soft-deletes for sender when recipient has not deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ACCOUNT_ID,
        recipientId: RECIPIENT_ACCOUNT_ID,
        isDeletedBySender: false,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.update.mockResolvedValue({});

      await deleteMail(SENDER_ID, 'mail-1');

      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isDeletedBySender: true },
      });
      expect(mockPrisma.friendMail.delete).not.toHaveBeenCalled();
    });

    it('hard-deletes when recipient deletes and sender already deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ACCOUNT_ID,
        recipientId: RECIPIENT_ACCOUNT_ID,
        isDeletedBySender: true,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.delete.mockResolvedValue({});

      await deleteMail(RECIPIENT_ID, 'mail-1');

      expect(mockPrisma.friendMail.delete).toHaveBeenCalledWith({ where: { id: 'mail-1' } });
      expect(mockPrisma.friendMail.update).not.toHaveBeenCalled();
    });

    it('hard-deletes when sender deletes and recipient already deleted', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: SENDER_ACCOUNT_ID,
        recipientId: RECIPIENT_ACCOUNT_ID,
        isDeletedBySender: false,
        isDeletedByRecipient: true,
      });
      mockPrisma.friendMail.delete.mockResolvedValue({});

      await deleteMail(SENDER_ID, 'mail-1');

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

    it('queries with OR clause for sender or recipient', async () => {
      mockPrisma.friendMail.findFirst.mockResolvedValue(null);

      await expect(deleteMail('some-player', 'mail-1')).rejects.toThrow();

      expect(mockPrisma.friendMail.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'mail-1',
          OR: [{ senderId: 'account:some-player' }, { recipientId: 'account:some-player' }],
        },
        select: {
          id: true,
          senderId: true,
          recipientId: true,
          isDeletedBySender: true,
          isDeletedByRecipient: true,
        },
      });
    });

    it('recipient soft-delete takes priority when player is recipient', async () => {
      // If the player is the recipient, isDeletedByRecipient should be set,
      // even though the code checks isSender first
      mockPrisma.friendMail.findFirst.mockResolvedValue({
        id: 'mail-1',
        senderId: 'account:other-player',
        recipientId: 'account:my-player',
        isDeletedBySender: false,
        isDeletedByRecipient: false,
      });
      mockPrisma.friendMail.update.mockResolvedValue({});

      await deleteMail('my-player', 'mail-1');

      expect(mockPrisma.friendMail.update).toHaveBeenCalledWith({
        where: { id: 'mail-1' },
        data: { isDeletedByRecipient: true },
      });
    });
  });

  // ─── getUnreadCount ────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('returns count of unread non-deleted mails', async () => {
      mockPrisma.friendMail.count.mockResolvedValue(7);

      const count = await getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(7);
      expect(mockPrisma.friendMail.count).toHaveBeenCalledWith({
        where: { recipientId: RECIPIENT_ACCOUNT_ID, isRead: false, isDeletedByRecipient: false },
      });
    });

    it('returns 0 when no unread mails', async () => {
      mockPrisma.friendMail.count.mockResolvedValue(0);

      const count = await getUnreadCount(RECIPIENT_ID);

      expect(count).toBe(0);
    });

    it('uses correct playerId in where clause', async () => {
      mockPrisma.friendMail.count.mockResolvedValue(3);

      await getUnreadCount('custom-player-id');

      expect(mockPrisma.friendMail.count).toHaveBeenCalledWith({
        where: {
          recipientId: 'account:custom-player-id',
          isRead: false,
          isDeletedByRecipient: false,
        },
      });
    });
  });
});
