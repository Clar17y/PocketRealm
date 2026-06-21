# Discord Announcement Rich Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/announcement` from raw Discord text into a Components V2 rich-text changelog card while keeping the existing single-message command shape.

**Architecture:** Keep the feature inside `apps/discord-bot`. Add a focused `announcementCard` formatter that parses a small changelog markdown subset into one V2 text display, then update the existing command handler to send that payload and surface formatter validation errors ephemerally. Mention safety stays inside the formatter so the command handler only orchestrates permission checks, channel fetch, send, and confirmation.

**Tech Stack:** TypeScript, discord.js 14 Components V2 builders, Vitest, existing Pocketrealm Discord bot V2 card test helpers.

---

## File Structure

- Modify `apps/discord-bot/src/discord/emojis.ts`: add the semantic `announcement` emoji key with a `📜` fallback.
- Create `apps/discord-bot/src/discord/announcementCard.ts`: parse and render changelog-style announcement text as a Components V2 payload.
- Create `apps/discord-bot/src/discord/announcementCard.test.ts`: unit-test markdown preservation, mention behavior, validation, and V2 payload shape.
- Modify `apps/discord-bot/src/interactions/announcementCommand.ts`: replace raw `content` send payloads with the card builder and handle formatter validation failures.
- Modify `apps/discord-bot/src/interactions/announcementCommand.test.ts`: assert the command sends V2 card payloads and preserves existing permission/channel/error behavior.

## Task 1: Add The Announcement Card Formatter Tests

**Files:**
- Modify: `apps/discord-bot/src/discord/emojis.ts`
- Create: `apps/discord-bot/src/discord/announcementCard.test.ts`
- Create in Task 2: `apps/discord-bot/src/discord/announcementCard.ts`

- [ ] **Step 1: Add the semantic emoji key**

In `apps/discord-bot/src/discord/emojis.ts`, add `announcement` after `notify`:

```ts
  'notify',
  'announcement',
  'wiki',
```

Add the fallback in `DEFAULT_DISCORD_EMOJIS` after `notify`:

```ts
  notify: '🔔',
  announcement: '📜',
  wiki: '📖',
```

- [ ] **Step 2: Write the failing formatter tests**

Create `apps/discord-bot/src/discord/announcementCard.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import {
  AnnouncementCardValidationError,
  MAX_ANNOUNCEMENT_TEXT_LENGTH,
  buildAnnouncementCard,
} from './announcementCard.js';

const zeroWidthSpace = '\u200B';

describe('buildAnnouncementCard', () => {
  it('renders changelog markdown as a readable Components V2 card', () => {
    const card = buildAnnouncementCard({
      message: [
        '# Weekly Realm Update',
        '',
        '## Combat',
        '⚔️ Raid bosses now show threat progress.',
        '- Duel replay damage order is fixed.',
        '',
        '## Fixes',
        '🛠️ Inventory sync is faster after crafting and selling.',
        '',
        'Read more: https://pocketrealm.app/changelog',
      ].join('\n'),
      everyone: false,
    });

    expectV2Card(card);
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    expect(card.allowedMentions).toEqual({ parse: [] });
    expect(cardText(card)).toBe([
      '📜 **Weekly Realm Update**',
      '',
      '**Combat**',
      '⚔️ Raid bosses now show threat progress.',
      '• Duel replay damage order is fixed.',
      '',
      '**Fixes**',
      '🛠️ Inventory sync is faster after crafting and selling.',
      '',
      'Read more: https://pocketrealm.app/changelog',
    ].join('\n'));
  });

  it('falls back to Announcement when no top-level heading is provided', () => {
    const card = buildAnnouncementCard({
      message: [
        '## Combat',
        '* Buffed raid boss rewards.',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toBe([
      '📜 **Announcement**',
      '',
      '**Combat**',
      '• Buffed raid boss rewards.',
    ].join('\n'));
  });

  it('allows a title-only card when the input has a meaningful title', () => {
    const card = buildAnnouncementCard({
      message: '# Server restart at 20:00 UTC',
      everyone: false,
    });

    expect(cardText(card)).toBe('📜 **Server restart at 20:00 UTC**');
  });

  it('keeps unsupported markdown as text instead of interpreting it', () => {
    const card = buildAnnouncementCard({
      message: [
        '# Patch Notes',
        '',
        '> Quoted text stays as text.',
        '| Area | Change |',
        '| --- | --- |',
        '| Combat | Faster logs |',
      ].join('\n'),
      everyone: false,
    });

    expect(cardText(card)).toContain('> Quoted text stays as text.');
    expect(cardText(card)).toContain('| Area | Change |');
    expect(cardText(card)).toContain('| Combat | Faster logs |');
  });

  it('prefixes one intentional everyone mention and neutralizes body mass mentions', () => {
    const card = buildAnnouncementCard({
      message: 'Event now @here @everyone <@123456789012345678> <@&234567890123456789>',
      everyone: true,
    });

    expect(card.allowedMentions).toEqual({ parse: ['everyone'] });
    expect(cardText(card)).toBe([
      '@everyone',
      '',
      '📜 **Announcement**',
      '',
      `Event now @${zeroWidthSpace}here @${zeroWidthSpace}everyone <@123456789012345678> <@&234567890123456789>`,
    ].join('\n'));
  });

  it('uses custom announcement emoji overrides', () => {
    const card = buildAnnouncementCard(
      {
        message: '# Patch Notes',
        everyone: false,
      },
      {
        emojiMap: { announcement: '<:pr_scroll:123456789012345678>' },
      },
    );

    expect(cardText(card)).toBe('<:pr_scroll:123456789012345678> **Patch Notes**');
  });

  it('rejects empty announcement text', () => {
    expect(() => buildAnnouncementCard({ message: '   ', everyone: false })).toThrow(AnnouncementCardValidationError);
    expect(() => buildAnnouncementCard({ message: '#   ', everyone: false })).toThrow('Announcement message cannot be empty.');
  });

  it('rejects output that exceeds the card text limit', () => {
    const oversized = `# Patch Notes\n${'x'.repeat(MAX_ANNOUNCEMENT_TEXT_LENGTH)}`;

    expect(() => buildAnnouncementCard({ message: oversized, everyone: false })).toThrow(
      'Announcement message is too long. Shorten it and try again.',
    );
  });
});
```

- [ ] **Step 3: Run the formatter tests to verify they fail**

Run: `npm run test -w apps/discord-bot -- src/discord/announcementCard.test.ts src/discord/emojis.test.ts`

Expected: FAIL because `./announcementCard.js` does not exist.

## Task 2: Implement The Announcement Card Formatter

**Files:**
- Create: `apps/discord-bot/src/discord/announcementCard.ts`
- Verify: `apps/discord-bot/src/discord/announcementCard.test.ts`
- Verify: `apps/discord-bot/src/discord/emojis.test.ts`

- [ ] **Step 1: Add the formatter implementation**

Create `apps/discord-bot/src/discord/announcementCard.ts`:

```ts
import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type MessageMentionOptions,
} from 'discord.js';

import type { DiscordEmojiMap } from './emojis.js';
import { botHeadline } from './messageFormat.js';
import type { V2CardPayload } from './v2Card.js';

export const MAX_ANNOUNCEMENT_TEXT_LENGTH = 3900;

const ANNOUNCEMENT_ACCENT_COLOR = 0x57f287;
const massMentionPattern = /@(everyone|here)\b/g;
const neutralizedMentionPrefix = '@\u200B';
const headingPattern = /^(#{1,3})\s*(.*)$/;
const bulletPattern = /^[-*•]\s+(.+)$/;

export class AnnouncementCardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnouncementCardValidationError';
  }
}

interface AnnouncementCardInput {
  message: string;
  everyone: boolean;
}

interface AnnouncementCardOptions {
  emojiMap?: DiscordEmojiMap;
}

interface ParsedAnnouncement {
  title: string;
  bodyLines: string[];
}

export function buildAnnouncementCard(
  input: AnnouncementCardInput,
  options: AnnouncementCardOptions = {},
): V2CardPayload {
  const normalized = normalizeAnnouncementText(input.message);
  if (!normalized) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  const parsed = parseAnnouncement(normalized);
  const bodyLines = input.everyone
    ? parsed.bodyLines.map(neutralizeMassMentions)
    : parsed.bodyLines;
  const content = renderAnnouncementText({
    title: parsed.title,
    bodyLines,
    everyone: input.everyone,
    emojiMap: options.emojiMap ?? {},
  });

  if (content.length > MAX_ANNOUNCEMENT_TEXT_LENGTH) {
    throw new AnnouncementCardValidationError('Announcement message is too long. Shorten it and try again.');
  }

  const container = new ContainerBuilder()
    .setAccentColor(ANNOUNCEMENT_ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: allowedMentionsForAnnouncement(input.everyone),
  };
}

function normalizeAnnouncementText(message: string): string {
  return message.replace(/\r\n?/g, '\n').trim();
}

function parseAnnouncement(message: string): ParsedAnnouncement {
  const rawLines = message.split('\n');
  const firstContentIndex = rawLines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  let title = 'Announcement';
  let bodyStartIndex = 0;
  const firstContentLine = rawLines[firstContentIndex].trim();
  const firstHeading = headingPattern.exec(firstContentLine);
  if (firstHeading?.[1] === '#') {
    title = firstHeading[2]?.trim() || 'Announcement';
    bodyStartIndex = firstContentIndex + 1;
  }

  const bodyLines = normalizeBodyLines(rawLines.slice(bodyStartIndex));
  if (title === 'Announcement' && bodyLines.length === 0) {
    throw new AnnouncementCardValidationError('Announcement message cannot be empty.');
  }

  return { title, bodyLines };
}

function normalizeBodyLines(lines: string[]): string[] {
  const normalized: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== '') {
        normalized.push('');
      }
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading && (heading[1] === '##' || heading[1] === '###') && heading[2]?.trim()) {
      normalized.push(`**${heading[2].trim()}**`);
      continue;
    }

    const bullet = bulletPattern.exec(line);
    if (bullet?.[1]) {
      normalized.push(`• ${bullet[1].trim()}`);
      continue;
    }

    normalized.push(line);
  }

  while (normalized[normalized.length - 1] === '') {
    normalized.pop();
  }

  return normalized;
}

function renderAnnouncementText(input: {
  title: string;
  bodyLines: string[];
  everyone: boolean;
  emojiMap: DiscordEmojiMap;
}): string {
  const lines = [
    ...(input.everyone ? ['@everyone', ''] : []),
    botHeadline('announcement', input.title, input.emojiMap),
    ...(input.bodyLines.length > 0 ? ['', ...input.bodyLines] : []),
  ];

  return lines.join('\n');
}

function allowedMentionsForAnnouncement(everyone: boolean): MessageMentionOptions {
  return everyone ? { parse: ['everyone'] } : { parse: [] };
}

function neutralizeMassMentions(message: string): string {
  return message.replace(massMentionPattern, `${neutralizedMentionPrefix}$1`);
}
```

- [ ] **Step 2: Run the formatter tests to verify they pass**

Run: `npm run test -w apps/discord-bot -- src/discord/announcementCard.test.ts src/discord/emojis.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit the formatter slice**

```powershell
git add -- apps/discord-bot/src/discord/emojis.ts apps/discord-bot/src/discord/announcementCard.ts apps/discord-bot/src/discord/announcementCard.test.ts
git commit -m "feat(discord): add announcement rich text card"
```

## Task 3: Update Announcement Command Tests For V2 Cards

**Files:**
- Modify: `apps/discord-bot/src/interactions/announcementCommand.test.ts`
- Modify later: `apps/discord-bot/src/interactions/announcementCommand.ts`

- [ ] **Step 1: Add card assertion imports and remove obsolete raw-content constants**

At the top of `apps/discord-bot/src/interactions/announcementCommand.test.ts`, add:

```ts
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
```

Remove this line because the card formatter owns zero-width-space assertions:

```ts
const zeroWidthSpace = '\u200B';
```

- [ ] **Step 2: Replace the default send assertion with V2 card assertions**

In `posts trimmed announcements with mentions suppressed by default`, replace the `channel.send` assertion with:

```ts
expect(channel.send).toHaveBeenCalledTimes(1);
const payload = channel.send.mock.calls[0]?.[0];
expectV2Card(payload);
expect(payload).toEqual(expect.objectContaining({
  allowedMentions: { parse: [] },
}));
expect(cardText(payload)).toBe([
  '📜 **Announcement**',
  '',
  'Patch notes are live @everyone <@123456789012345678>',
].join('\n'));
```

- [ ] **Step 3: Replace the `everyone` send assertion with V2 card assertions**

In `prepends and permits @everyone when the toggle is enabled`, replace the `channel.send` assertion with:

```ts
expect(channel.send).toHaveBeenCalledTimes(1);
const payload = channel.send.mock.calls[0]?.[0];
expectV2Card(payload);
expect(payload).toEqual(expect.objectContaining({
  allowedMentions: { parse: ['everyone'] },
}));
expect(cardText(payload)).toBe([
  '@everyone',
  '',
  '📜 **Announcement**',
  '',
  'The realm event starts now.',
].join('\n'));
```

- [ ] **Step 4: Replace the body mass-mention test assertion**

In `neutralizes everyone mentions inside the body when the toggle is enabled`, replace the `channel.send` assertion with:

```ts
expect(channel.send).toHaveBeenCalledTimes(1);
const payload = channel.send.mock.calls[0]?.[0];
expectV2Card(payload);
expect(payload).toEqual(expect.objectContaining({
  allowedMentions: { parse: ['everyone'] },
}));
expect(cardText(payload)).toBe([
  '@everyone',
  '',
  '📜 **Announcement**',
  '',
  'Event now @\u200Bhere @\u200Beveryone <@123456789012345678> <@&234567890123456789>',
].join('\n'));
```

- [ ] **Step 5: Add command-level rich text and oversized validation tests**

Add these tests after the default send test:

```ts
it('posts changelog rich text as a Components V2 announcement card', async () => {
  const channel = createAnnouncementChannel();
  const interaction = createAnnouncementInteraction({
    member: memberWithRoles([staffRoleId]),
    message: [
      '# Weekly Realm Update',
      '',
      '## Combat',
      '⚔️ Raid bosses now show threat progress.',
      '- Duel replay damage order is fixed.',
    ].join('\n'),
    everyone: false,
    announcementChannel: channel,
  });

  await handleAnnouncementCommand(interaction, { config });

  expect(channel.send).toHaveBeenCalledTimes(1);
  const payload = channel.send.mock.calls[0]?.[0];
  expectV2Card(payload);
  expect(cardText(payload)).toBe([
    '📜 **Weekly Realm Update**',
    '',
    '**Combat**',
    '⚔️ Raid bosses now show threat progress.',
    '• Duel replay damage order is fixed.',
  ].join('\n'));
});

it('rejects oversized announcements before fetching the channel', async () => {
  const channel = createAnnouncementChannel();
  const interaction = createAnnouncementInteraction({
    member: memberWithRoles([staffRoleId]),
    message: `# Patch Notes\n${'x'.repeat(4000)}`,
    announcementChannel: channel,
  });

  await handleAnnouncementCommand(interaction, { config });

  expect(interaction.reply).toHaveBeenCalledWith({
    ephemeral: true,
    content: 'Announcement message is too long. Shorten it and try again.',
  });
  expect(interaction.client.channels.fetch).not.toHaveBeenCalled();
  expect(interaction.deferReply).not.toHaveBeenCalled();
  expect(channel.send).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run the command tests to verify they fail**

Run: `npm run test -w apps/discord-bot -- src/interactions/announcementCommand.test.ts`

Expected: FAIL because `announcementCommand.ts` still sends raw `content` payloads.

## Task 4: Update The Announcement Command Handler

**Files:**
- Modify: `apps/discord-bot/src/interactions/announcementCommand.ts`
- Verify: `apps/discord-bot/src/interactions/announcementCommand.test.ts`

- [ ] **Step 1: Replace raw content payload types and imports**

In `apps/discord-bot/src/interactions/announcementCommand.ts`, replace:

```ts
import type { ChatInputCommandInteraction, MessageMentionOptions } from 'discord.js';
```

with:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';
```

Add these imports under the config import:

```ts
import {
  AnnouncementCardValidationError,
  buildAnnouncementCard,
} from '../discord/announcementCard.js';
import type { V2CardPayload } from '../discord/v2Card.js';
```

Delete these constants and interfaces:

```ts
const massMentionPattern = /@(everyone|here)\b/g;
const neutralizedMentionPrefix = '@\u200B';
```

```ts
interface AnnouncementPayload {
  content: string;
  allowedMentions: MessageMentionOptions;
}
```

Change the sendable channel interface to:

```ts
interface SendableAnnouncementChannel {
  isSendable(): boolean;
  send(payload: V2CardPayload): Promise<unknown>;
}
```

- [ ] **Step 2: Build the V2 card before deferring or fetching**

In `handleAnnouncementCommand`, keep the existing empty check and then add:

```ts
  const everyone = interaction.options.getBoolean('everyone') ?? false;
  let announcementPayload: V2CardPayload;
  try {
    announcementPayload = buildAnnouncementCard({ message, everyone });
  } catch (error) {
    if (error instanceof AnnouncementCardValidationError) {
      await interaction.reply({
        ephemeral: true,
        content: error.message,
      });
      return;
    }

    throw error;
  }
```

Place that block immediately before:

```ts
  await interaction.deferReply({ ephemeral: true });
```

- [ ] **Step 3: Send the V2 card payload**

Remove the later `everyone` declaration:

```ts
  const everyone = interaction.options.getBoolean('everyone') ?? false;
```

Replace:

```ts
    await channel.send(buildAnnouncementPayload(message, everyone));
```

with:

```ts
    await channel.send(announcementPayload);
```

Delete the now-unused helper functions:

```ts
function buildAnnouncementPayload(message: string, everyone: boolean): AnnouncementPayload {
  const allowedMentions: MessageMentionOptions = everyone ? { parse: ['everyone'] } : { parse: [] };
  const body = everyone ? neutralizeMassMentions(message) : message;

  return {
    content: everyone ? `@everyone\n\n${body}` : body,
    allowedMentions,
  };
}

function neutralizeMassMentions(message: string): string {
  return message.replace(massMentionPattern, `${neutralizedMentionPrefix}$1`);
}
```

- [ ] **Step 4: Run the announcement command tests to verify they pass**

Run: `npm run test -w apps/discord-bot -- src/interactions/announcementCommand.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the formatter and command tests together**

Run: `npm run test -w apps/discord-bot -- src/discord/announcementCard.test.ts src/interactions/announcementCommand.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the command integration slice**

```powershell
git add -- apps/discord-bot/src/interactions/announcementCommand.ts apps/discord-bot/src/interactions/announcementCommand.test.ts
git commit -m "feat(discord): send announcement cards"
```

## Task 5: Final Cleanup And Verification

**Files:**
- Review touched diff only.

- [ ] **Step 1: Invoke the required simplify skill**

Before final handoff, invoke `superpowers:simplify` as required by `AGENTS.md` for code-changing tasks. Review only the touched files:

```text
apps/discord-bot/src/discord/emojis.ts
apps/discord-bot/src/discord/announcementCard.ts
apps/discord-bot/src/discord/announcementCard.test.ts
apps/discord-bot/src/interactions/announcementCommand.ts
apps/discord-bot/src/interactions/announcementCommand.test.ts
```

Keep only simplifications that reduce duplication or clarify the parser without changing behavior.

- [ ] **Step 2: Run focused verification after simplification**

Run: `npm run test -w apps/discord-bot -- src/discord/announcementCard.test.ts src/interactions/announcementCommand.test.ts src/discord/emojis.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full Discord bot tests**

Run: `rtk npm run test -w apps/discord-bot`

Expected: PASS.

- [ ] **Step 4: Run the Discord bot build**

Run: `rtk npm run build:discord-bot`

Expected: PASS.

- [ ] **Step 5: Check for whitespace errors**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 6: Commit any simplification changes**

If Step 1 changed files, commit them:

```powershell
git add -- apps/discord-bot/src/discord/announcementCard.ts apps/discord-bot/src/discord/announcementCard.test.ts apps/discord-bot/src/interactions/announcementCommand.ts apps/discord-bot/src/interactions/announcementCommand.test.ts apps/discord-bot/src/discord/emojis.ts
git commit -m "refactor(discord): simplify announcement card formatter"
```

If Step 1 made no changes, do not create an empty commit.

## Spec Coverage Checklist

- Single-message command shape is preserved by Tasks 3 and 4.
- Components V2 card output is implemented by Tasks 1 through 4.
- Changelog headings, bullets, blank lines, emojis, links, and inline Discord markdown are covered by Task 1 tests and Task 2 implementation.
- Safe default mentions and explicit `@everyone` behavior are covered by Task 1 formatter tests and Task 3 command tests.
- Empty and oversized validation are covered by Tasks 1, 2, and 3.
- Existing permission, channel unavailable, send failure, and confirmation behavior stay covered by the existing command tests updated in Task 3.
- Final verification and the required simplify pass are covered by Task 5.
