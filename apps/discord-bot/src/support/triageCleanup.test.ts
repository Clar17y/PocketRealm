import { describe, expect, it, vi } from 'vitest';

import { cleanupSupportTriageMessages } from './triageCleanup.js';

const BOT_USER_ID = '123456789012345678';

describe('cleanupSupportTriageMessages', () => {
  it('previews duplicate cleanup without deleting messages', async () => {
    const older = triageMessage({ id: 'older', publicId: 'SUP-ABC12345', createdTimestamp: 1000 });
    const newest = triageMessage({ id: 'newest', publicId: 'SUP-ABC12345', createdTimestamp: 3000 });
    const channel = channelWithMessages([
      older,
      triageMessage({ id: 'other-ticket', publicId: 'SUP-DEF67890', createdTimestamp: 2000 }),
      newest,
    ]);

    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: BOT_USER_ID,
      publicId: 'SUP-ABC12345',
      scanLimit: 50,
      confirm: false,
    });

    expect(summary).toEqual({
      scanned: 3,
      matchedTickets: 1,
      duplicateTicketCount: 1,
      duplicateCandidates: 1,
      deleted: 0,
      skipped: 0,
      failed: 0,
      confirmed: false,
      scanLimit: 50,
      targetPublicId: 'SUP-ABC12345',
    });
    expect(older.delete).not.toHaveBeenCalled();
    expect(newest.delete).not.toHaveBeenCalled();
  });

  it('deletes older duplicate triage cards and keeps the newest card', async () => {
    const oldest = triageMessage({ id: 'oldest', publicId: 'SUP-ABC12345', createdTimestamp: 1000 });
    const middle = triageMessage({ id: 'middle', publicId: 'SUP-ABC12345', createdTimestamp: 2000 });
    const newest = triageMessage({ id: 'newest', publicId: 'SUP-ABC12345', createdTimestamp: 3000 });
    const normalMessage = message({ id: 'normal', content: 'New support ticket `SUP-ABC12345`', authorBot: false });
    const channel = channelWithMessages([oldest, middle, newest, normalMessage]);

    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: BOT_USER_ID,
      scanLimit: 100,
      confirm: true,
    });

    expect(summary.deleted).toBe(2);
    expect(summary.duplicateCandidates).toBe(2);
    expect(oldest.delete).toHaveBeenCalledWith('Duplicate support triage card for SUP-ABC12345');
    expect(middle.delete).toHaveBeenCalledWith('Duplicate support triage card for SUP-ABC12345');
    expect(newest.delete).not.toHaveBeenCalled();
    expect(normalMessage.delete).not.toHaveBeenCalled();
  });

  it('matches duplicate triage cards from nested Components V2 text', async () => {
    const older = v2TriageMessage({ id: 'older-v2', publicId: 'SUP-ABC12345', createdTimestamp: 1000 });
    const newest = v2TriageMessage({ id: 'newest-v2', publicId: 'SUP-ABC12345', createdTimestamp: 2000 });
    const channel = channelWithMessages([older, newest]);

    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: BOT_USER_ID,
      scanLimit: 100,
      confirm: true,
    });

    expect(summary.duplicateCandidates).toBe(1);
    expect(summary.deleted).toBe(1);
    expect(older.delete).toHaveBeenCalledWith('Duplicate support triage card for SUP-ABC12345');
    expect(newest.delete).not.toHaveBeenCalled();
  });

  it('dedupes multiple tickets independently', async () => {
    const firstOlder = triageMessage({ id: 'first-older', publicId: 'SUP-ABC12345', createdTimestamp: 1000 });
    const firstNewest = triageMessage({ id: 'first-newest', publicId: 'SUP-ABC12345', createdTimestamp: 2000 });
    const secondOlder = triageMessage({ id: 'second-older', publicId: 'SUP-DEF67890', createdTimestamp: 3000 });
    const secondNewest = triageMessage({ id: 'second-newest', publicId: 'SUP-DEF67890', createdTimestamp: 4000 });
    const channel = channelWithMessages([firstOlder, firstNewest, secondOlder, secondNewest]);

    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: BOT_USER_ID,
      scanLimit: 100,
      confirm: true,
    });

    expect(summary.duplicateTicketCount).toBe(2);
    expect(summary.deleted).toBe(2);
    expect(firstOlder.delete).toHaveBeenCalledOnce();
    expect(secondOlder.delete).toHaveBeenCalledOnce();
    expect(firstNewest.delete).not.toHaveBeenCalled();
    expect(secondNewest.delete).not.toHaveBeenCalled();
  });

  it('skips duplicate cards that Discord does not allow the bot to delete', async () => {
    const older = triageMessage({
      id: 'older',
      publicId: 'SUP-ABC12345',
      createdTimestamp: 1000,
      deletable: false,
    });
    const newest = triageMessage({ id: 'newest', publicId: 'SUP-ABC12345', createdTimestamp: 2000 });
    const channel = channelWithMessages([older, newest]);

    const summary = await cleanupSupportTriageMessages({
      channel,
      botUserId: BOT_USER_ID,
      scanLimit: 100,
      confirm: true,
    });

    expect(summary).toEqual(expect.objectContaining({
      duplicateCandidates: 1,
      deleted: 0,
      skipped: 1,
      failed: 0,
    }));
    expect(older.delete).not.toHaveBeenCalled();
  });
});

function channelWithMessages(messages: Array<ReturnType<typeof message>>) {
  return {
    messages: {
      fetch: vi.fn(async () => new Map(messages.map((entry) => [entry.id, entry]))),
    },
  };
}

function triageMessage(input: {
  id: string;
  publicId: string;
  createdTimestamp: number;
  deletable?: boolean;
}) {
  return message({
    id: input.id,
    content: `New support ticket \`${input.publicId}\``,
    embedTitle: `${input.publicId} - Inventory does not stack`,
    createdTimestamp: input.createdTimestamp,
    authorBot: true,
    deletable: input.deletable,
  });
}

function v2TriageMessage(input: {
  id: string;
  publicId: string;
  createdTimestamp: number;
}) {
  return message({
    id: input.id,
    content: '',
    components: [{
      components: [{
        content: `🎫 **Support ticket ${input.publicId}**\nInventory does not stack`,
      }],
    }],
    createdTimestamp: input.createdTimestamp,
    authorBot: true,
  });
}

function message(input: {
  id: string;
  content: string;
  components?: unknown[];
  embedTitle?: string;
  createdTimestamp?: number;
  authorBot?: boolean;
  deletable?: boolean;
}) {
  return {
    id: input.id,
    content: input.content,
    createdTimestamp: input.createdTimestamp ?? 0,
    author: {
      id: input.authorBot === false ? '999999999999999999' : BOT_USER_ID,
      bot: input.authorBot ?? true,
    },
    components: input.components ?? [],
    embeds: input.embedTitle ? [{ title: input.embedTitle }] : [],
    deletable: input.deletable ?? true,
    delete: vi.fn(async () => undefined),
  };
}
