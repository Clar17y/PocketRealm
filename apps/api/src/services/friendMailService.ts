import { prisma } from '@pocketrealm/database';
import { MAIL_CONSTANTS, type FriendMailEntry } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';
import { sanitizeUserText } from '../utils/sanitize';

async function getPlayerSummary(playerId: string): Promise<{
  id: string;
  accountId: string;
  username: string;
} | null> {
  return prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      accountId: true,
      username: true,
    },
  });
}

const MAIL_INCLUDE = {
  sender: { select: { activePlayer: { select: { id: true, username: true } } } },
  recipient: { select: { activePlayer: { select: { id: true, username: true } } } },
} as const;

function toMailEntry(mail: {
  id: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  goldCost: number;
  isSystem: boolean;
  isRead: boolean;
  createdAt: Date;
  sender: { activePlayer: { id: string; username: string } | null };
  recipient: { activePlayer: { id: string; username: string } | null };
}): FriendMailEntry {
  return {
    id: mail.id,
    senderId: mail.sender.activePlayer?.id ?? mail.senderId,
    senderName: mail.sender.activePlayer?.username ?? 'Unknown',
    recipientId: mail.recipient.activePlayer?.id ?? mail.recipientId,
    recipientName: mail.recipient.activePlayer?.username ?? 'Unknown',
    subject: mail.subject,
    body: mail.body,
    goldCost: mail.goldCost,
    isSystem: mail.isSystem,
    isRead: mail.isRead,
    createdAt: mail.createdAt.toISOString(),
  };
}

export async function sendMail(
  senderId: string,
  recipientId: string,
  subject: string,
  body: string,
): Promise<FriendMailEntry> {
  if (senderId === recipientId) {
    throw new AppError(400, 'Cannot send mail to yourself', 'SELF_MAIL');
  }

  const [sender, recipient] = await Promise.all([
    getPlayerSummary(senderId),
    getPlayerSummary(recipientId),
  ]);
  if (!sender || !recipient) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  if (sender.accountId === recipient.accountId) {
    throw new AppError(400, 'Cannot send mail to yourself', 'SELF_MAIL');
  }

  // Check friendship (either direction)
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { senderId: sender.accountId, receiverId: recipient.accountId },
        { senderId: recipient.accountId, receiverId: sender.accountId },
      ],
    },
    select: { id: true },
  });
  if (!friendship) {
    throw new AppError(400, 'You must be friends to send mail', 'NOT_FRIENDS');
  }

  // Check blocks in both directions
  if (await isBlocked(senderId, recipientId) || await isBlocked(recipientId, senderId)) {
    throw new AppError(400, 'Cannot send mail to this player', 'BLOCKED');
  }

  const truncatedSubject = sanitizeUserText(subject).slice(0, MAIL_CONSTANTS.MAX_SUBJECT_LENGTH);
  const truncatedBody = sanitizeUserText(body).slice(0, MAIL_CONSTANTS.MAX_BODY_LENGTH);

  const mail = await prisma.$transaction(async (tx) => {
    // Atomic gold deduction — only decrements if balance is sufficient
    const { count } = await tx.player.updateMany({
      where: { id: senderId, gold: { gte: MAIL_CONSTANTS.GOLD_COST } },
      data: { gold: { decrement: MAIL_CONSTANTS.GOLD_COST } },
    });
    if (count === 0) {
      throw new AppError(400, 'Insufficient gold', 'INSUFFICIENT_GOLD');
    }

    // Create mail
    const created = await tx.friendMail.create({
      data: {
        senderId: sender.accountId,
        recipientId: recipient.accountId,
        subject: truncatedSubject,
        body: truncatedBody,
        goldCost: MAIL_CONSTANTS.GOLD_COST,
        isSystem: false,
      },
      include: MAIL_INCLUDE,
    });

    // Prune recipient inbox if over limit (soft-delete oldest)
    const inboxCount = await tx.friendMail.count({
      where: { recipientId: recipient.accountId, isDeletedByRecipient: false },
    });
    if (inboxCount > MAIL_CONSTANTS.MAX_INBOX_SIZE) {
      const oldest = await tx.friendMail.findMany({
        where: { recipientId: recipient.accountId, isDeletedByRecipient: false },
        orderBy: { createdAt: 'asc' },
        take: inboxCount - MAIL_CONSTANTS.MAX_INBOX_SIZE,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await tx.friendMail.updateMany({
          where: { id: { in: oldest.map((m) => m.id) } },
          data: { isDeletedByRecipient: true },
        });
      }
    }

    // Prune sender's sent mail if over limit (soft-delete oldest)
    const sentCount = await tx.friendMail.count({
      where: { senderId: sender.accountId, isDeletedBySender: false, isSystem: false },
    });
    if (sentCount > MAIL_CONSTANTS.MAX_SENT_SIZE) {
      const oldestSent = await tx.friendMail.findMany({
        where: { senderId: sender.accountId, isDeletedBySender: false, isSystem: false },
        orderBy: { createdAt: 'asc' },
        take: sentCount - MAIL_CONSTANTS.MAX_SENT_SIZE,
        select: { id: true },
      });
      if (oldestSent.length > 0) {
        await tx.friendMail.updateMany({
          where: { id: { in: oldestSent.map((m) => m.id) } },
          data: { isDeletedBySender: true },
        });
      }
    }

    return created;
  });

  return toMailEntry(mail);
}

export async function sendSystemMail(
  senderId: string,
  recipientId: string,
  subject: string,
  body: string,
): Promise<FriendMailEntry> {
  const [sender, recipient] = await Promise.all([
    getPlayerSummary(senderId),
    getPlayerSummary(recipientId),
  ]);
  if (!sender || !recipient) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const truncatedSubject = sanitizeUserText(subject).slice(0, MAIL_CONSTANTS.MAX_SUBJECT_LENGTH);
  const truncatedBody = sanitizeUserText(body).slice(0, MAIL_CONSTANTS.MAX_BODY_LENGTH);

  const mail = await prisma.friendMail.create({
    data: {
      senderId: sender.accountId,
      recipientId: recipient.accountId,
      subject: truncatedSubject,
      body: truncatedBody,
      goldCost: 0,
      isSystem: true,
    },
    include: MAIL_INCLUDE,
  });

  return toMailEntry(mail);
}

export async function getInbox(
  playerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ mails: FriendMailEntry[]; total: number }> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const where = { recipientId: player.accountId, isDeletedByRecipient: false };

  const [mails, total] = await Promise.all([
    prisma.friendMail.findMany({
      where,
      include: MAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.friendMail.count({ where }),
  ]);

  return { mails: mails.map(toMailEntry), total };
}

export async function getSentMail(
  playerId: string,
  page = 1,
  pageSize = 20,
): Promise<{ mails: FriendMailEntry[]; total: number }> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const where = { senderId: player.accountId, isDeletedBySender: false, isSystem: false };

  const [mails, total] = await Promise.all([
    prisma.friendMail.findMany({
      where,
      include: MAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.friendMail.count({ where }),
  ]);

  return { mails: mails.map(toMailEntry), total };
}

export async function readMail(
  playerId: string,
  mailId: string,
): Promise<FriendMailEntry> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const mail = await prisma.friendMail.findFirst({
    where: {
      id: mailId,
      OR: [
        { recipientId: player.accountId, isDeletedByRecipient: false },
        { senderId: player.accountId, isDeletedBySender: false },
      ],
    },
    include: MAIL_INCLUDE,
  });

  if (!mail) {
    throw new AppError(404, 'Mail not found', 'NOT_FOUND');
  }

  // Mark as read if recipient is reading and not yet read
  if (mail.recipientId === player.accountId && !mail.isRead) {
    await prisma.friendMail.update({
      where: { id: mailId },
      data: { isRead: true },
    });
    return toMailEntry({ ...mail, isRead: true });
  }

  return toMailEntry(mail);
}

export async function deleteMail(
  playerId: string,
  mailId: string,
): Promise<void> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const mail = await prisma.friendMail.findFirst({
    where: {
      id: mailId,
      OR: [{ senderId: player.accountId }, { recipientId: player.accountId }],
    },
    select: {
      id: true,
      senderId: true,
      recipientId: true,
      isDeletedBySender: true,
      isDeletedByRecipient: true,
    },
  });

  if (!mail) {
    throw new AppError(404, 'Mail not found', 'NOT_FOUND');
  }

  const isSender = mail.senderId === player.accountId;
  const isRecipient = mail.recipientId === player.accountId;
  const otherSideDeleted = isSender ? mail.isDeletedByRecipient : mail.isDeletedBySender;

  // If other side already deleted (or same player is both — shouldn't happen), hard-delete
  if (otherSideDeleted) {
    await prisma.friendMail.delete({ where: { id: mailId } });
    return;
  }

  // Soft-delete for this side
  if (isSender && !isRecipient) {
    await prisma.friendMail.update({
      where: { id: mailId },
      data: { isDeletedBySender: true },
    });
  } else if (isRecipient) {
    await prisma.friendMail.update({
      where: { id: mailId },
      data: { isDeletedByRecipient: true },
    });
  }
}

export async function getUnreadCount(playerId: string): Promise<number> {
  const player = await getPlayerSummary(playerId);
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  return prisma.friendMail.count({
    where: { recipientId: player.accountId, isRead: false, isDeletedByRecipient: false },
  });
}
