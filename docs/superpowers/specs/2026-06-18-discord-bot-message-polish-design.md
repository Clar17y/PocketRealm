# Discord Bot Message Polish - Design

**Date:** 2026-06-18
**Status:** Approved direction; pending implementation
**Branch:** `codex/discord-bot-message-polish`

## Summary

Standardize the Discord bot's player-facing messages around the richer style
introduced by the improved duel and notification work: a clear semantic emoji,
bold primary subject, compact outcome copy, and an obvious next action when one
exists.

The scope is the Discord bot only. This does not change in-game chat, web UI
copy, API errors, staff command summaries, support triage cards, bot health
pings, or internal logs.

## Goals

- Give all player-facing Discord bot messages a consistent PocketRealm voice.
- Use uploaded custom Discord emoji where configured, with Unicode fallbacks so
  local tests and non-production servers keep working.
- Keep simple messages simple: content strings and existing embeds remain the
  default unless an embed already fits the information shape.
- Preserve Discord limits, ephemeral/public behavior, button behavior, and
  current routing.
- Keep formatting testable with pure unit tests.

## Non-goals

- No new game features or notification types.
- No image generation in this pass.
- No broad support/staff rewrite. Staff and triage workflows keep dense
  operational summaries, with only obvious status prefixes considered later.
- No runtime Discord emoji lookup. Message formatting should not depend on
  cached guild state or client readiness.

## Message Structure

Player-facing content should use this pattern where it helps comprehension:

```text
{emoji} **{primary subject}**
{short outcome or instruction}
{optional action/link}
```

Examples:

```text
🔗 **Link PocketRealm**
Enter this code in PocketRealm Settings: `ABC12345`
Expires <t:1780574400:F>.
```

```text
📖 **Wiki results for "forge"**
- [Forge Guide](https://pocketrealm.test/wiki/forge) - Craft stronger weapons.
```

Short one-line confirmations may stay one line:

```text
✅ **Saved** - Boss defeated notifications are now ON.
```

## Emoji Model

Create a semantic emoji catalog in the bot package. Call sites request keys such
as `duel`, `turns`, `wiki`, `support`, `success`, or `error`; they never hardcode
custom emoji IDs.

Each key has a Unicode fallback. Production can override keys with custom emoji
mentions through an optional env var.

Recommended env shape:

```text
DISCORD_EMOJI_MAP=duel=<:pr_duel:123456789012345678>,success=<:pr_success:234567890123456789>
```

Rules:

- Unknown keys are rejected during config parsing.
- Values must be valid static or animated custom emoji mentions:
  `<:name:snowflake>` or `<a:name:snowflake>`.
- Missing keys fall back to Unicode.
- The plan inventories code wiring only. If the live server lacks an important
  reusable concept after implementation, create new custom emoji for repeated
  concepts only, not for every status line.

Initial semantic keys:

| Key | Fallback | Used for |
| --- | --- | --- |
| `duel` | ⚔️ | Duel challenge, duel result, arena actions |
| `scout` | 🔍 | PvP scout DMs |
| `boss` | 🐉 | Boss appeared |
| `victory` | 🏆 | Boss defeated, wins, ranks |
| `expedition` | 🧭 | Expedition recruiting and completion |
| `turns` | ⚡ | Turns capped and `/turns` |
| `link` | 🔗 | `/link` |
| `notify` | 🔔 | `/notify` |
| `wiki` | 📖 | `/wiki` |
| `profile` | 🧙 | `/profile` |
| `skills` | ✨ | `/skills` |
| `support` | 🛟 | `/report` player flow |
| `welcome` | 👋 | Welcome message |
| `success` | ✅ | Successful save/create/posted state |
| `warning` | ⚠️ | Recoverable user action needed |
| `error` | ❌ | Failed command/action |
| `info` | ℹ️ | Neutral fallback or unsupported action |

## Bot Surfaces In Scope

Player-facing:

- `apps/discord-bot/src/notifications/notificationPoll.ts`
- `apps/discord-bot/src/discord/welcome.ts`
- `apps/discord-bot/src/interactions/linkCommand.ts`
- `apps/discord-bot/src/interactions/notifyCommand.ts`
- `apps/discord-bot/src/interactions/wikiCommand.ts`
- `apps/discord-bot/src/interactions/playerCommands.ts`
- `apps/discord-bot/src/interactions/reportCommand.ts`
- `apps/discord-bot/src/interactions/duelCommand.ts`
- `apps/discord-bot/src/interactions/interactionRouter.ts` where config must be
  threaded into handlers.

Out of scope for this pass:

- `apps/discord-bot/src/interactions/staffCommands.ts`
- `apps/discord-bot/src/support/triageCards.ts`
- `apps/discord-bot/src/support/threadActions.ts`
- `apps/discord-bot/src/support/triagePoll.ts`
- Bot health "ready" ping in `index.ts`
- XP internals and logs in `xp/messageXp.ts`

## Architecture

Add two small bot-local modules:

- `discord/emojis.ts`: semantic keys, Unicode fallbacks, custom emoji parser,
  and formatter.
- `discord/messageFormat.ts`: tiny helpers for headlines and status lines so
  handlers do not repeat punctuation and bolding rules.

Extend `BotConfig` with `emojiMap` parsed from `DISCORD_EMOJI_MAP`. Thread the
config or `emojiMap` into player-facing handlers that need it. Keep formatter
functions pure so unit tests can assert exact strings without a Discord client.

## Testing

- Add unit tests for emoji parsing, fallback lookup, custom override lookup, and
  invalid config rejection.
- Update existing command tests to assert the new structure for representative
  success, warning, and error states.
- Keep existing behavior assertions for API paths, ephemeral replies, buttons,
  embeds, and acknowledgements.
- Run `npm run test -w apps/discord-bot` and `npm run build:discord-bot` before
  implementation handoff is considered complete.

