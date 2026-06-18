# Discord Bot Components V2 Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all Discord bot-authored outbound messages to Components V2 cards while preserving behavior, visibility, buttons, DMs, and custom emoji support.

**Architecture:** Keep duel-specific cards in `discord/duelCard.ts` and add a shared `discord/v2Card.ts` helper for generic status, text, menu, notification, staff, and support cards. Replace top-level `content` and legacy `embeds` payloads with V2 containers, nesting existing action rows inside containers and suppressing mentions by default.

**Tech Stack:** TypeScript, discord.js 14 Components V2 builders, Vitest, Zod config parsing, monorepo package `apps/discord-bot`.

**Reference spec:** `docs/superpowers/specs/2026-06-18-discord-bot-message-polish-design.md`

**Worktree:** `D:\Code\Adventure\.worktrees\pocketrealm-codex_discord_bot_message_polish`

---

## File Structure

- Create `apps/discord-bot/src/discord/v2Card.ts`: shared Components V2 card builders and payload types.
- Create `apps/discord-bot/src/discord/v2Card.test.ts`: helper behavior tests.
- Modify `apps/discord-bot/src/discord/messageFormat.ts`: keep string helpers only where needed by card builders or tests.
- Modify `apps/discord-bot/src/discord/duelCard.ts`: keep duel card layout; align mention policy and shared type names if useful.
- Modify `apps/discord-bot/src/notifications/notificationPoll.ts`: return/send V2 notification cards.
- Modify `apps/discord-bot/src/discord/welcome.ts`: send a V2 welcome card.
- Modify `apps/discord-bot/src/index.ts`: send a V2 ready card.
- Modify `apps/discord-bot/src/interactions/*.ts`: convert all command/button/modal message replies to V2 cards.
- Modify `apps/discord-bot/src/support/triageCards.ts`: replace content/embed triage payload with a V2 support card.
- Modify `apps/discord-bot/src/support/threadActions.ts`: convert support action replies, thread intro messages, status posts, and triage message edits to V2 cards.
- Modify existing tests under `apps/discord-bot/src/**/*test.ts` to assert V2 flags, text content, action rows, visibility, and mention policy.

---

### Task 1: Shared Components V2 Card Helper

**Files:**
- Create: `apps/discord-bot/src/discord/v2Card.ts`
- Create: `apps/discord-bot/src/discord/v2Card.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create tests proving `statusCard(...)` and `textCard(...)` return `MessageFlags.IsComponentsV2`, suppress mentions by default, include no top-level `content` or `embeds`, render custom emoji text, and nest supplied action rows in the container.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/discord/v2Card.test.ts
```

Expected: fail because `discord/v2Card.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Implement builders around `ContainerBuilder`, `TextDisplayBuilder`, and optional `ActionRowBuilder<ButtonBuilder>` rows:

```ts
export function statusCard(
  emojiKey: DiscordEmojiKey,
  title: string,
  detail: string,
  emojiMap?: DiscordEmojiMap,
  options?: V2CardOptions,
): V2CardPayload;

export function textCard(input: {
  emojiKey?: DiscordEmojiKey;
  title: string;
  lines: string[];
  emojiMap?: DiscordEmojiMap;
  actionRows?: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions?: MessageMentionOptions;
  ephemeral?: boolean;
  accentColor?: number;
}): V2CardPayload;
```

Default `allowedMentions` to `{ parse: [] }`.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npx vitest run src/discord/v2Card.test.ts
```

Expected: pass.

### Task 2: Convert Player Commands And Public Wiki Flow

**Files:**
- Modify: `apps/discord-bot/src/interactions/linkCommand.ts`
- Modify: `apps/discord-bot/src/interactions/wikiCommand.ts`
- Modify: `apps/discord-bot/src/interactions/playerCommands.ts`
- Modify: `apps/discord-bot/src/interactions/reportCommand.ts`
- Modify tests for the same files.

- [ ] **Step 1: Write failing tests**

Update tests to assert reply/edit payloads have `flags: MessageFlags.IsComponentsV2`, no top-level `content` or `embeds`, and expected text inside Text Display components.

- [ ] **Step 2: Verify RED**

Run focused tests for these command files and confirm they fail on the old payload shape.

- [ ] **Step 3: Convert handlers**

Use `statusCard(...)` for warning/error/success states and `textCard(...)` for multi-line result cards. Replace profile/rank embeds with V2 cards containing the same title and detail lines.

- [ ] **Step 4: Verify GREEN**

Run the same focused tests and confirm they pass.

### Task 3: Convert Notification, Welcome, Ready, Notify, And Duel Status Surfaces

**Files:**
- Modify: `apps/discord-bot/src/notifications/notificationPoll.ts`
- Modify: `apps/discord-bot/src/discord/welcome.ts`
- Modify: `apps/discord-bot/src/index.ts`
- Modify: `apps/discord-bot/src/interactions/notifyCommand.ts`
- Modify: `apps/discord-bot/src/interactions/duelCommand.ts`
- Modify tests for the same files.

- [ ] **Step 1: Write failing tests**

Assert notification DMs, welcome sends, ready sends, notify menus/toggle follow-ups, notify confirmation DMs, and duel fallback/status notices are Components V2 cards.

- [ ] **Step 2: Verify RED**

Run focused tests and confirm failures are due to plain `content` payloads.

- [ ] **Step 3: Convert handlers**

Build notification and welcome cards with `textCard(...)`. Build notify preference menus by passing existing action rows to `textCard(...)`. Keep existing duel challenge/result/replay cards from `duelCard.ts`, but convert all duel status/fallback notices to shared V2 status cards.

- [ ] **Step 4: Verify GREEN**

Run the focused tests and confirm they pass.

### Task 4: Convert Staff And Support Operational Messages

**Files:**
- Modify: `apps/discord-bot/src/interactions/staffCommands.ts`
- Modify: `apps/discord-bot/src/support/triageCards.ts`
- Modify: `apps/discord-bot/src/support/threadActions.ts`
- Modify: `apps/discord-bot/src/support/triageCleanup.ts` only if historical duplicate detection needs a V2-compatible fingerprint.
- Modify support and staff tests.

- [ ] **Step 1: Write failing tests**

Update staff/support tests to require V2 payloads for staff command replies, triage cards, thread action replies, follow-up thread intro messages, support status posts, and triage message edits.

- [ ] **Step 2: Verify RED**

Run staff/support focused tests and confirm failures are due to content/embed payloads.

- [ ] **Step 3: Convert support/staff payloads**

Replace triage embeds with V2 text cards plus existing support action rows. Update triage status editing to edit the full V2 card instead of mutating embed fields. Convert thread action replies and thread sends to status/text cards.

- [ ] **Step 4: Verify GREEN**

Run focused staff/support tests and confirm they pass.

### Task 5: Static Audit, Simplify, Review, And Verification

**Files:**
- Modify tests or helpers if the audit reveals missed message payloads.

- [ ] **Step 1: Static message audit**

Run:

```powershell
rg -n "content:|embeds:" apps/discord-bot/src -g "*.ts"
```

Review every remaining match. Outbound bot-authored messages must be converted. Historical message readers, test fixture fields, and non-message data may remain.

- [ ] **Step 2: Run simplify**

Use `$simplify` on the touched diff and keep only behavior-preserving cleanup.

- [ ] **Step 3: Run code review**

Use `$superpowers:requesting-code-review` against the full branch diff. Fix Critical and Important findings.

- [ ] **Step 4: Full verification**

Run:

```powershell
rtk npm run test -w apps/discord-bot
rtk npm run build:discord-bot
git diff --check
```

Expected: all pass with no whitespace errors.

- [ ] **Step 5: Push**

Commit and push the updated branch after verification passes.
