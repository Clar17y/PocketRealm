# Discord Bot Message Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize player-facing Discord bot messages with semantic emoji, bold subjects, compact outcomes, and optional action links while preserving existing behavior.

**Architecture:** Add a bot-local semantic emoji catalog with Unicode fallbacks and optional custom emoji overrides from config. Add small formatting helpers, then migrate player-facing command and notification builders in focused passes. Staff/support operational messages stay out of scope except for shared routing types needed to pass config.

**Tech Stack:** TypeScript, discord.js 14, Vitest, Zod config parsing, monorepo package `apps/discord-bot`.

**Reference spec:** `docs/superpowers/specs/2026-06-18-discord-bot-message-polish-design.md`

**Worktree:** `D:\Code\Adventure\.worktrees\pocketrealm-codex_discord_bot_message_polish`

**Baseline:** `rtk npm run test -w apps/discord-bot` passed on 2026-06-18 with 23 files and 180 tests.

---

## File Structure

- Create `apps/discord-bot/src/discord/emojis.ts`: semantic emoji keys, fallbacks, custom emoji parsing, lookup helpers.
- Create `apps/discord-bot/src/discord/emojis.test.ts`: parser and lookup tests.
- Create `apps/discord-bot/src/discord/messageFormat.ts`: minimal headline/status helpers.
- Create `apps/discord-bot/src/discord/messageFormat.test.ts`: helper tests.
- Modify `apps/discord-bot/src/config.ts`: parse `DISCORD_EMOJI_MAP` into `BotConfig.emojiMap`.
- Modify `apps/discord-bot/src/config.test.ts`: valid and invalid emoji map tests.
- Modify `apps/discord-bot/.env.example`: document `DISCORD_EMOJI_MAP`.
- Modify `apps/discord-bot/src/notifications/notificationPoll.ts`: use semantic emoji for notification DMs.
- Modify `apps/discord-bot/src/notifications/notificationPoll.test.ts`: assert custom emoji override and existing rich copy.
- Modify `apps/discord-bot/src/index.ts`: pass `config.emojiMap` to notification poll.
- Modify `apps/discord-bot/src/interactions/interactionRouter.ts`: include `emojiMap` in routed config and pass config to `/link`, `/notify`, duel buttons, and report modal submit.
- Modify `apps/discord-bot/src/interactions/linkCommand.ts`: format `/link` messages.
- Modify `apps/discord-bot/src/interactions/notifyCommand.ts`: format `/notify` menu, confirmations, and errors.
- Modify `apps/discord-bot/src/interactions/wikiCommand.ts`: format wiki result header and links.
- Modify `apps/discord-bot/src/interactions/playerCommands.ts`: add `emojiMap` to its config type, then format `/turns`, `/skills`, profile embed, rank embed, and player-facing errors.
- Modify `apps/discord-bot/src/interactions/reportCommand.ts`: add `emojiMap` to command and modal-submit config, then format report user flow messages.
- Modify `apps/discord-bot/src/interactions/duelCommand.ts`: format duel challenge, result, replay headers, and user-facing errors.
- Modify corresponding existing tests in `apps/discord-bot/src/interactions/*.test.ts` and `apps/discord-bot/src/discord/welcome.test.ts`.

---

### Task 1: Add Semantic Emoji Catalog And Config Parsing

**Files:**
- Create: `apps/discord-bot/src/discord/emojis.ts`
- Create: `apps/discord-bot/src/discord/emojis.test.ts`
- Modify: `apps/discord-bot/src/config.ts`
- Modify: `apps/discord-bot/src/config.test.ts`
- Modify: `apps/discord-bot/.env.example`

- [ ] **Step 1: Write the failing emoji catalog tests**

Create `apps/discord-bot/src/discord/emojis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  DISCORD_EMOJI_KEYS,
  DEFAULT_DISCORD_EMOJIS,
  formatDiscordEmoji,
  parseDiscordEmojiMap,
} from './emojis.js';

describe('discord emoji catalog', () => {
  it('has a fallback for every semantic key', () => {
    for (const key of DISCORD_EMOJI_KEYS) {
      expect(DEFAULT_DISCORD_EMOJIS[key]).toBeTruthy();
    }
  });

  it('uses a custom emoji mention when configured', () => {
    const emojiMap = parseDiscordEmojiMap('duel=<:pr_duel:123456789012345678>,success=<a:pr_yes:234567890123456789>');

    expect(formatDiscordEmoji('duel', emojiMap)).toBe('<:pr_duel:123456789012345678>');
    expect(formatDiscordEmoji('success', emojiMap)).toBe('<a:pr_yes:234567890123456789>');
  });

  it('falls back to Unicode when a key is not configured', () => {
    const emojiMap = parseDiscordEmojiMap('duel=<:pr_duel:123456789012345678>');

    expect(formatDiscordEmoji('wiki', emojiMap)).toBe(DEFAULT_DISCORD_EMOJIS.wiki);
  });

  it('rejects unknown keys and invalid custom emoji mentions', () => {
    expect(() => parseDiscordEmojiMap('unknown=<:x:123456789012345678>')).toThrow('Unknown Discord emoji key');
    expect(() => parseDiscordEmojiMap('duel=:crossed_swords:')).toThrow('Invalid Discord custom emoji');
  });
});
```

- [ ] **Step 2: Write the failing config tests**

In `apps/discord-bot/src/config.test.ts`, add these cases inside `describe('parseBotConfig')`:

```ts
  it('parses optional custom Discord emoji overrides', () => {
    const config = parseBotConfig({
      ...validEnv,
      DISCORD_EMOJI_MAP: 'duel=<:pr_duel:123456789012345678>,success=<:pr_success:234567890123456789>',
    });

    expect(config.emojiMap).toEqual({
      duel: '<:pr_duel:123456789012345678>',
      success: '<:pr_success:234567890123456789>',
    });
  });

  it('rejects malformed custom Discord emoji overrides', () => {
    expect(() => parseBotConfig({ ...validEnv, DISCORD_EMOJI_MAP: 'duel=:swords:' })).toThrow();
    expect(() => parseBotConfig({ ...validEnv, DISCORD_EMOJI_MAP: 'notakey=<:x:123456789012345678>' })).toThrow();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/emojis.test.ts apps/discord-bot/src/config.test.ts
```

Expected: FAIL because `discord/emojis.ts` and `config.emojiMap` do not exist.

- [ ] **Step 4: Implement `discord/emojis.ts`**

Create `apps/discord-bot/src/discord/emojis.ts`:

```ts
export const DISCORD_EMOJI_KEYS = [
  'duel',
  'scout',
  'boss',
  'victory',
  'expedition',
  'turns',
  'link',
  'notify',
  'wiki',
  'profile',
  'skills',
  'support',
  'welcome',
  'success',
  'warning',
  'error',
  'info',
] as const;

export type DiscordEmojiKey = (typeof DISCORD_EMOJI_KEYS)[number];
export type DiscordEmojiMap = Partial<Record<DiscordEmojiKey, string>>;

export const DEFAULT_DISCORD_EMOJIS: Record<DiscordEmojiKey, string> = {
  duel: '⚔️',
  scout: '🔍',
  boss: '🐉',
  victory: '🏆',
  expedition: '🧭',
  turns: '⚡',
  link: '🔗',
  notify: '🔔',
  wiki: '📖',
  profile: '🧙',
  skills: '✨',
  support: '🛟',
  welcome: '👋',
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
};

const emojiKeys = new Set<string>(DISCORD_EMOJI_KEYS);
const customEmojiMentionPattern = /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/;

export function isDiscordEmojiKey(value: string): value is DiscordEmojiKey {
  return emojiKeys.has(value);
}

export function parseDiscordEmojiMap(raw: string | undefined): DiscordEmojiMap {
  const trimmed = raw?.trim();
  if (!trimmed) return {};

  const parsed: DiscordEmojiMap = {};
  for (const entry of trimmed.split(',')) {
    const [rawKey, rawValue, ...extra] = entry.split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key || !value || extra.length > 0) {
      throw new Error(`Invalid Discord emoji mapping: ${entry}`);
    }

    if (!isDiscordEmojiKey(key)) {
      throw new Error(`Unknown Discord emoji key: ${key}`);
    }

    if (!customEmojiMentionPattern.test(value)) {
      throw new Error(`Invalid Discord custom emoji for ${key}: ${value}`);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function formatDiscordEmoji(key: DiscordEmojiKey, emojiMap: DiscordEmojiMap = {}): string {
  return emojiMap[key] ?? DEFAULT_DISCORD_EMOJIS[key];
}
```

- [ ] **Step 5: Wire emoji parsing into config**

In `apps/discord-bot/src/config.ts`, import the type and parser:

```ts
import { parseDiscordEmojiMap, type DiscordEmojiMap } from './discord/emojis.js';
```

Add `DISCORD_EMOJI_MAP` to `envSchema`:

```ts
  DISCORD_EMOJI_MAP: z.string().optional(),
```

Add `emojiMap` to `BotConfig`:

```ts
  emojiMap: DiscordEmojiMap;
```

Add the parsed value in `parseBotConfig`:

```ts
    emojiMap: parseDiscordEmojiMap(parsed.DISCORD_EMOJI_MAP),
```

- [ ] **Step 6: Document the optional env var**

In `apps/discord-bot/.env.example`, add:

```text
DISCORD_EMOJI_MAP=
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/emojis.test.ts apps/discord-bot/src/config.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/discord-bot/src/discord/emojis.ts apps/discord-bot/src/discord/emojis.test.ts apps/discord-bot/src/config.ts apps/discord-bot/src/config.test.ts apps/discord-bot/.env.example
git commit -m "feat(bot): add semantic Discord emoji catalog"
```

---

### Task 2: Add Shared Message Formatting Helpers

**Files:**
- Create: `apps/discord-bot/src/discord/messageFormat.ts`
- Create: `apps/discord-bot/src/discord/messageFormat.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `apps/discord-bot/src/discord/messageFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { botHeadline, botStatus, compactLines } from './messageFormat.js';

describe('discord message formatting helpers', () => {
  it('formats a headline with semantic emoji and bold text', () => {
    expect(botHeadline('link', 'Link PocketRealm')).toBe('🔗 **Link PocketRealm**');
  });

  it('uses configured custom emoji in headlines', () => {
    expect(botHeadline('duel', 'Friendly simulation', { duel: '<:pr_duel:123456789012345678>' }))
      .toBe('<:pr_duel:123456789012345678> **Friendly simulation**');
  });

  it('formats short statuses as one line', () => {
    expect(botStatus('success', 'Saved', 'Boss defeated notifications are now ON.'))
      .toBe('✅ **Saved** - Boss defeated notifications are now ON.');
  });

  it('filters empty lines without trimming meaningful content', () => {
    expect(compactLines(['A', null, '', 'B'])).toBe('A\nB');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/messageFormat.test.ts
```

Expected: FAIL because `messageFormat.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `apps/discord-bot/src/discord/messageFormat.ts`:

```ts
import { formatDiscordEmoji, type DiscordEmojiKey, type DiscordEmojiMap } from './emojis.js';

export function botHeadline(
  emojiKey: DiscordEmojiKey,
  title: string,
  emojiMap: DiscordEmojiMap = {},
): string {
  return `${formatDiscordEmoji(emojiKey, emojiMap)} **${title}**`;
}

export function botStatus(
  emojiKey: DiscordEmojiKey,
  title: string,
  detail: string,
  emojiMap: DiscordEmojiMap = {},
): string {
  return `${botHeadline(emojiKey, title, emojiMap)} - ${detail}`;
}

export function compactLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => typeof line === 'string' && line.length > 0).join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/messageFormat.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/discord-bot/src/discord/messageFormat.ts apps/discord-bot/src/discord/messageFormat.test.ts
git commit -m "feat(bot): add Discord message formatting helpers"
```

---

### Task 3: Thread Emoji Config Through User-Facing Bot Routes

**Files:**
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.test.ts`
- Modify: `apps/discord-bot/src/notifications/notificationPoll.ts`
- Modify: `apps/discord-bot/src/notifications/notificationPoll.test.ts`
- Modify: `apps/discord-bot/src/index.ts`

- [ ] **Step 1: Update router tests to expect config in handlers that need formatting**

In `apps/discord-bot/src/interactions/interactionRouter.test.ts`, add `emojiMap` to `routerConfig`:

```ts
  emojiMap: { success: '<:pr_success:123456789012345678>' },
```

If the file does not already mock `linkCommand`, add the import and mock:

```ts
import { handleLinkCommand } from './linkCommand.js';

vi.mock('./linkCommand.js', () => ({
  handleLinkCommand: vi.fn(),
}));
```

Add a link routing test:

```ts
it('routes link commands to the link handler with config', async () => {
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'link',
  } as unknown as Interaction;
  const api = createApi(null);

  await routeInteraction(interaction, { api, config: routerConfig });

  expect(handleLinkCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
});
```

Update existing expectations:

```ts
expect(handleDuelButton).toHaveBeenCalledWith(interaction, api, routerConfig);
expect(handleNotifyCommand).toHaveBeenCalledWith(interaction, api, routerConfig);
expect(handleNotifyToggleButton).toHaveBeenCalledWith(interaction, api, routerConfig);
expect(handleReportModalSubmit).toHaveBeenCalledWith(interaction, api, routerConfig);
```

- [ ] **Step 2: Update notification tests for custom emoji support**

In `apps/discord-bot/src/notifications/notificationPoll.test.ts`, add this formatter test:

```ts
  it('uses configured custom emoji overrides', () => {
    const content = formatNotificationMessage(
      evt('pvp_attack', { attackerName: 'Rook' }),
      WEB_BASE_URL,
      { duel: '<:pr_duel:123456789012345678>' },
    );

    expect(content.startsWith('<:pr_duel:123456789012345678>')).toBe(true);
  });
```

Update the delivery assertion to include the map:

```ts
expect(send).toHaveBeenCalledWith({
  content: formatNotificationMessage(EVENT, WEB_BASE_URL, options.emojiMap),
});
```

Add `emojiMap: {},` to `createOptions`.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/interactionRouter.test.ts apps/discord-bot/src/notifications/notificationPoll.test.ts
```

Expected: FAIL because signatures have not been widened.

- [ ] **Step 4: Widen router config and pass it through**

In `apps/discord-bot/src/interactions/interactionRouter.ts`, add `emojiMap` to the `Pick<BotConfig, ...>` list:

```ts
    | 'emojiMap'
```

Update route calls:

```ts
await handleDuelButton(interaction, options.api, options.config);
await handleNotifyToggleButton(interaction, options.api, options.config);
await handleLinkCommand(interaction, options.api, options.config);
await handleNotifyCommand(interaction, options.api, options.config);
await handleReportModalSubmit(interaction, options.api, options.config);
```

- [ ] **Step 5: Widen notification poll options**

In `apps/discord-bot/src/notifications/notificationPoll.ts`, import `DiscordEmojiMap` and `formatDiscordEmoji`:

```ts
import { formatDiscordEmoji, type DiscordEmojiMap } from '../discord/emojis.js';
```

Add `emojiMap?: DiscordEmojiMap;` to `DiscordNotificationPollOptions`.

Change formatter signature:

```ts
export function formatNotificationMessage(
  event: DiscordNotificationEventView,
  webBaseUrl: string,
  emojiMap: DiscordEmojiMap = {},
): string {
```

Use semantic emoji in each branch, for example:

```ts
return `${formatDiscordEmoji('duel', emojiMap)} **${p.attackerName}** challenged you in the arena! [Fight back →](${arena})`;
```

Use these keys:

```ts
pvp_attack -> duel
pvp_scout -> scout
boss_appeared -> boss
boss_defeated -> victory
expedition_recruiting -> expedition
expedition_finished victory -> success
expedition_finished failed -> warning
turns_capped -> turns
default -> info
```

Update delivery:

```ts
await user.send({ content: formatNotificationMessage(event, options.webBaseUrl, options.emojiMap) });
```

- [ ] **Step 6: Pass config from `index.ts`**

In `apps/discord-bot/src/index.ts`, update the notification poll call:

```ts
await pollDiscordNotifications({
  api,
  logger,
  readyClient,
  redis,
  webBaseUrl: config.webBaseUrl,
  emojiMap: config.emojiMap,
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/interactionRouter.test.ts apps/discord-bot/src/notifications/notificationPoll.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/discord-bot/src/interactions/interactionRouter.ts apps/discord-bot/src/interactions/interactionRouter.test.ts apps/discord-bot/src/notifications/notificationPoll.ts apps/discord-bot/src/notifications/notificationPoll.test.ts apps/discord-bot/src/index.ts
git commit -m "feat(bot): thread custom emoji config into player messaging"
```

---

### Task 4: Polish Welcome, Link, Notify, And Wiki Messages

**Files:**
- Modify: `apps/discord-bot/src/discord/welcome.ts`
- Modify: `apps/discord-bot/src/discord/welcome.test.ts`
- Modify: `apps/discord-bot/src/interactions/linkCommand.ts`
- Modify: `apps/discord-bot/src/interactions/linkCommand.test.ts`
- Modify: `apps/discord-bot/src/interactions/notifyCommand.ts`
- Modify: `apps/discord-bot/src/interactions/notifyCommand.test.ts`
- Modify: `apps/discord-bot/src/interactions/wikiCommand.ts`
- Modify: `apps/discord-bot/src/interactions/wikiCommand.test.ts`

- [ ] **Step 1: Update tests for new copy shape**

In `welcome.test.ts`, assert the first line contains the welcome headline:

```ts
expect(payload.content).toContain('👋 **Welcome to PocketRealm');
```

In `linkCommand.test.ts`, update the successful link expectation:

```ts
expect(payload.content).toContain('🔗 **Link PocketRealm**');
expect(payload.content).toContain('`ABC12345`');
expect(payload.content).toContain('<t:1780574400:F>');
```

In `notifyCommand.test.ts`, update expectations:

```ts
expect(payload.content).toContain('🔔 **Discord notifications**');
expect(interaction.user.send).toHaveBeenCalledWith({
  content: expect.stringContaining('✅ **Notification enabled**'),
});
```

In `wikiCommand.test.ts`, update the successful result expectation:

```ts
expect(payload.content).toContain('📖 **Wiki results for "forge"**');
expect(payload.content).toContain('[Forge Guide 1]');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/welcome.test.ts apps/discord-bot/src/interactions/linkCommand.test.ts apps/discord-bot/src/interactions/notifyCommand.test.ts apps/discord-bot/src/interactions/wikiCommand.test.ts
```

Expected: FAIL because current copy is still plain.

- [ ] **Step 3: Implement welcome copy**

In `welcome.ts`, import `botHeadline` and change `createWelcomeMessage` to use:

```ts
content: [
  `${botHeadline('welcome', `Welcome to PocketRealm, <@${member.id}>`, config.emojiMap)}!`,
  'Use `/link` to connect your game account, `/wiki` for game help, and `/report` if you need support.',
  `Friendly duels live in <#${config.duelsChannelId}>.`,
  `Play: ${config.webBaseUrl}`,
].join('\n'),
```

- [ ] **Step 4: Implement `/link` copy**

In `linkCommand.ts`, accept `config: Pick<BotConfig, 'emojiMap'>`, import `botHeadline`, `botStatus`, and use:

```ts
content: [
  botHeadline('link', 'Link PocketRealm', config.emojiMap),
  `Enter this code in PocketRealm Settings: \`${response.code}\``,
  `Expires ${formatDiscordTimestamp(response.expiresAt, 'F', 'the listed expiry time')}.`,
].join('\n'),
```

For guild-only and failure messages:

```ts
content: botStatus('warning', 'Server only', '/link only works in the PocketRealm Discord server.', config.emojiMap)
content: botStatus('error', 'Link failed', 'Unable to create a PocketRealm link code right now. Please try again later.', config.emojiMap)
```

- [ ] **Step 5: Implement `/notify` copy**

In `notifyCommand.ts`, accept `config: Pick<BotConfig, 'emojiMap'>` in both handlers. Replace `NOTIFY_INTRO` with a function:

```ts
function notifyIntro(emojiMap: DiscordEmojiMap): string {
  return [
    botHeadline('notify', 'Discord notifications', emojiMap),
    'Choose which PocketRealm events DM you. Everything is off until you turn it on.',
  ].join('\n');
}
```

Use:

```ts
content: botStatus('success', 'Notification enabled', `I'll DM you when **${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]}** fires.`, config.emojiMap)
content: botStatus('success', 'Saved', `${DISCORD_NOTIFICATION_TYPE_LABELS[parsed.type]} is now ${enabled ? 'ON' : 'OFF'}. Run /notify again to refresh the menu.`, config.emojiMap)
content: botStatus('warning', 'DM blocked', 'I could not DM you, so that notification stays off. Enable "Allow direct messages from server members" for this server, then try again.', config.emojiMap)
content: botStatus('error', 'Update failed', 'Unable to update that notification setting right now. Please try again later.', config.emojiMap)
```

- [ ] **Step 6: Implement `/wiki` copy**

In `wikiCommand.ts`, import `botHeadline` and use:

Also widen its config type from `Pick<BotConfig, 'webBaseUrl'>` to `Pick<BotConfig, 'webBaseUrl' | 'emojiMap'>`.

```ts
content: botStatus('error', 'Wiki unavailable', 'Unable to search the PocketRealm wiki right now. Please try again later.', config.emojiMap)
content: botStatus('info', 'No wiki results', `No wiki results found for "${query}".`, config.emojiMap)
content: [
  botHeadline('wiki', `Wiki results for "${query}"`, config.emojiMap),
  ...results,
].join('\n')
```

Change result rows to markdown links:

```ts
return `- [${title}](${url})${snippet}`;
```

Where `snippet` remains ` - ${result.snippet}` when present.

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/discord/welcome.test.ts apps/discord-bot/src/interactions/linkCommand.test.ts apps/discord-bot/src/interactions/notifyCommand.test.ts apps/discord-bot/src/interactions/wikiCommand.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/discord-bot/src/discord/welcome.ts apps/discord-bot/src/discord/welcome.test.ts apps/discord-bot/src/interactions/linkCommand.ts apps/discord-bot/src/interactions/linkCommand.test.ts apps/discord-bot/src/interactions/notifyCommand.ts apps/discord-bot/src/interactions/notifyCommand.test.ts apps/discord-bot/src/interactions/wikiCommand.ts apps/discord-bot/src/interactions/wikiCommand.test.ts
git commit -m "feat(bot): polish welcome link notify and wiki messages"
```

---

### Task 5: Polish Player Profile, Turns, Skills, Rank, And Report Messages

**Files:**
- Modify: `apps/discord-bot/src/interactions/playerCommands.ts`
- Modify: `apps/discord-bot/src/interactions/playerCommands.test.ts`
- Modify: `apps/discord-bot/src/interactions/reportCommand.ts`
- Modify: `apps/discord-bot/src/interactions/reportCommand.test.ts`

- [ ] **Step 1: Update player command tests**

In `playerCommands.test.ts`, update representative assertions:

```ts
expect(payload.content).toContain('⚡ **Turns**');
expect(payload.content).toContain('34 turns available');
expect(payload.content).toContain('✨ **Skills**');
expect(payload.embeds[0].data.title).toContain('🧙');
expect(payload.embeds[0].data.title).toContain('Astra');
expect(payload.embeds[0].data.title).toContain('🏆');
```

For player-facing errors:

```ts
expect(payload.content).toContain('⚠️ **Link required**');
expect(payload.content).toContain('/link');
```

- [ ] **Step 2: Update report command tests**

In `reportCommand.test.ts`, update assertions:

```ts
expect(payload.content).toContain('🛟 **Report created**');
expect(payload.content).toContain('`SUP-ABC12345`');
expect(payload.content).toContain('⚠️ **Link required**');
expect(payload.content).toContain('❌ **Report failed**');
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/playerCommands.test.ts apps/discord-bot/src/interactions/reportCommand.test.ts
```

Expected: FAIL because current copy is still plain.

- [ ] **Step 4: Implement player command formatting**

In `playerCommands.ts`, import `botHeadline`, `botStatus`, and `formatDiscordEmoji`.

Widen its config type:

```ts
type PlayerCommandConfig = Pick<BotConfig, 'guildId' | 'emojiMap'>;
```

Change `formatTurns` signature:

```ts
function formatTurns(turns: TurnsResponse['turns'], emojiMap: DiscordEmojiMap): string {
  const lines = [botHeadline('turns', 'Turns', emojiMap), `${turns.currentTurns} turns available.`];
```

Change `formatSkills` signature:

```ts
function formatSkills(skills: SkillsResponse['skills'], emojiMap: DiscordEmojiMap): string {
  if (skills.length === 0) {
    return botStatus('info', 'Skills', 'No PocketRealm skills found yet.', emojiMap);
  }

  return [
    botHeadline('skills', 'Skills', emojiMap),
    ...skills.map((skill) => `${formatLabel(skill.skillType)} Lv ${skill.level} (${skill.xp} XP)`),
  ].join('\n');
}
```

Pass `config.emojiMap` from `handleTurnsCommand` and `handleSkillsCommand`.

Update embed titles:

```ts
.setTitle(`${formatDiscordEmoji('profile', emojiMap)} ${profile.username}`)
.setTitle(`${formatDiscordEmoji('victory', emojiMap)} ${formatLabel(rank.category)} Rank`)
```

Update player errors:

```ts
content: botStatus('warning', 'Link required', isSelectedUser ? LINK_OTHER_COPY : LINK_SELF_COPY, config.emojiMap)
content: botStatus('warning', 'Character missing', PLAYER_NOT_FOUND_COPY, config.emojiMap)
content: botStatus('warning', 'Unknown rank', INVALID_RANK_CATEGORY_COPY, config.emojiMap)
content: botStatus('error', 'Player data unavailable', 'Unable to load PocketRealm player data right now. Please try again later.', config.emojiMap)
```

- [ ] **Step 5: Implement report command formatting**

In `reportCommand.ts`, import `botStatus`.

Widen its config type and modal submit signature:

```ts
type ReportCommandConfig = Pick<BotConfig, 'guildId' | 'emojiMap'>;

export async function handleReportModalSubmit(
  interaction: ModalSubmitInteraction,
  api: ReportApiClient,
  config: Pick<BotConfig, 'emojiMap'>,
): Promise<void> {
```

Format user-visible replies:

```ts
content: botStatus('warning', 'Server only', 'Reports only work in the PocketRealm Discord server.', config.emojiMap)
content: botStatus('warning', 'Link required', LINK_REQUIRED_COPY, config.emojiMap)
content: botStatus('support', 'Report created', `Report \`${response.ticket.publicId}\` created with status \`${response.ticket.status}\`.`, config.emojiMap)
content: reportErrorCopy(error, config.emojiMap)
```

Change `reportErrorCopy`:

```ts
function reportErrorCopy(error: unknown, emojiMap: DiscordEmojiMap): string {
  if (error instanceof PocketRealmApiError && error.code === 'DISCORD_LINK_REQUIRED') {
    return botStatus('warning', 'Link required', LINK_REQUIRED_COPY, emojiMap);
  }

  return botStatus('error', 'Report failed', 'Unable to create a report right now. Please try again later.', emojiMap);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/playerCommands.test.ts apps/discord-bot/src/interactions/reportCommand.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/discord-bot/src/interactions/playerCommands.ts apps/discord-bot/src/interactions/playerCommands.test.ts apps/discord-bot/src/interactions/reportCommand.ts apps/discord-bot/src/interactions/reportCommand.test.ts
git commit -m "feat(bot): polish player and report command messages"
```

---

### Task 6: Polish Duel Messages Without Reworking Replay Logic

**Files:**
- Modify: `apps/discord-bot/src/interactions/duelCommand.ts`
- Modify: `apps/discord-bot/src/interactions/duelCommand.test.ts`

- [ ] **Step 1: Update duel tests for new copy shape**

In `duelCommand.test.ts`, update representative expectations:

```ts
expect(send).toHaveBeenCalledWith(expect.objectContaining({
  content: expect.stringContaining('⚔️ **Friendly simulation challenge**'),
}));
expect(editReply).toHaveBeenCalledWith({ content: '✅ **Posted** - Friendly simulation challenge posted.' });
expect(payload.content).toContain('🏆 **Friendly simulation complete**');
expect(payload.content).toContain('⚔️ **Friendly simulation replay - page 2**');
expect(payload.content).toContain('❌ **Replay unavailable**');
```

For existing exact error assertions, switch to containing the meaningful detail:

```ts
expect(payload.content).toContain('Use /duel in');
expect(payload.content).toContain('Challenge another player');
expect(payload.content).toContain('Both players need linked PocketRealm accounts');
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/duelCommand.test.ts
```

Expected: FAIL because current duel copy is mostly plain.

- [ ] **Step 3: Widen handler signatures**

In `duelCommand.ts`, change:

```ts
export async function handleDuelButton(
  interaction: ButtonInteraction,
  api: DuelApiClient,
  config: Pick<BotConfig, 'emojiMap'>,
): Promise<void> {
```

Keep `handleDuelCommand` config as `Pick<BotConfig, 'duelsChannelId' | 'emojiMap'>`.

- [ ] **Step 4: Format duel command messages**

Import `botHeadline`, `botStatus`, and `compactLines`. Use:

```ts
content: botStatus('warning', 'Wrong channel', `Use /duel in <#${config.duelsChannelId}>.`, config.emojiMap)
content: botStatus('warning', 'Server only', '/duel only works in the PocketRealm Discord server.', config.emojiMap)
content: botStatus('warning', 'Choose an opponent', 'Challenge another player, not yourself.', config.emojiMap)
content: botStatus('warning', 'Choose a player', 'Challenge a player, not a bot.', config.emojiMap)
content: [
  botHeadline('duel', 'Friendly simulation challenge', config.emojiMap),
  `<@${opponent.id}>, ${interaction.user} challenged you to a friendly simulation.`,
].join('\n')
content: botStatus('success', 'Posted', 'Friendly simulation challenge posted.', config.emojiMap)
```

Change `createDuelErrorCopy(error, emojiMap)` and `resolveDuelErrorCopy(error, emojiMap)` to return `botStatus(...)` strings.

- [ ] **Step 5: Format duel result and replay headers**

Change `buildDuelResultMessage(response, emojiMap)` and call it with `config.emojiMap`:

```ts
content: compactLines([
  botHeadline(duel.isDraw ? 'duel' : 'victory', 'Friendly simulation complete', emojiMap),
  outcome,
  summary,
]),
```

Change `formatReplay(replay, emojiMap)`:

```ts
return `${botHeadline('duel', `Friendly simulation replay - page ${replay.page}`, emojiMap)}\n${lines.join('\n')}`;
```

Change replay load error:

```ts
content: botStatus('error', 'Replay unavailable', 'Unable to load the friendly simulation replay right now.', config.emojiMap)
```

- [ ] **Step 6: Run tests to verify they pass**

Run:

```powershell
npx vitest run apps/discord-bot/src/interactions/duelCommand.test.ts apps/discord-bot/src/interactions/interactionRouter.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/discord-bot/src/interactions/duelCommand.ts apps/discord-bot/src/interactions/duelCommand.test.ts apps/discord-bot/src/interactions/interactionRouter.test.ts
git commit -m "feat(bot): polish duel command messages"
```

---

### Task 7: Full Bot Verification And Copy Audit

**Files:**
- No planned source edits unless verification finds a regression.

- [ ] **Step 1: Run the full Discord bot test suite**

Run:

```powershell
rtk npm run test -w apps/discord-bot
```

Expected: PASS, including all existing 23 test files plus the new emoji/message-format tests.

- [ ] **Step 2: Build the Discord bot**

Run:

```powershell
rtk npm run build:discord-bot
```

Expected: PASS, including `packages/shared` build and `apps/discord-bot` TypeScript compilation.

- [ ] **Step 3: Search for remaining plain player-facing strings**

Run:

```powershell
rg -n "content: '|\bcontent: `|formatNotificationMessage|channel\.send|editReply|followUp|reply" apps/discord-bot/src/interactions apps/discord-bot/src/discord apps/discord-bot/src/notifications -g "*.ts"
```

Expected: Remaining plain strings are either staff/support out-of-scope, modal labels, command definitions, tests, or intentionally compact internal/health messages. If a player-facing command reply remains plain, migrate it using `botHeadline` or `botStatus`.

- [ ] **Step 4: Run focused tests again if Step 3 changed code**

Run:

```powershell
rtk npm run test -w apps/discord-bot
```

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if any were needed**

```powershell
git add apps/discord-bot/src
git commit -m "chore(bot): finish Discord message polish verification" || Write-Host "nothing to commit"
```

---

## Implementation Notes

- Do not start dev servers for this task unless the user explicitly requests browser or live Discord verification.
- Do not include staff command summaries, support triage cards, support thread actions, bot health pings, XP logs, or command registration descriptions in this polish pass.
- Prefer exact string tests only for helpers and representative formatted output. For long command flows, assert the semantic pieces: emoji headline, bold subject, preserved key detail, and unchanged routing/API behavior.
- Custom emoji IDs are not secrets, but keeping them in `DISCORD_EMOJI_MAP` avoids hardcoding server-specific assets in source.
- If the live Discord server lacks a reusable custom emoji for a high-frequency concept after implementation, create or upload only a small additional set for repeated concepts such as `turns`, `duel`, `boss`, `expedition`, `success`, `warning`, and `error`.
