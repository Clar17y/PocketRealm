# Discord Bot Components V2 Message Design

**Date:** 2026-06-19
**Status:** Implementation target
**Branch:** `codex/discord-bot-message-polish`

## Summary

Convert the Discord bot's outbound messages to Discord Components V2 cards.
Every bot-authored message payload should use `MessageFlags.IsComponentsV2`
with `ContainerBuilder`/`TextDisplayBuilder` content instead of plain
`content` strings or legacy embeds, except Discord protocol interactions that
are not messages, such as autocomplete responses and modal display calls.

This supersedes the earlier "message polish" direction. Emoji-backed status
copy remains useful, but the delivery structure must be Components V2 cards.

## Goals

- Use Components V2 cards for command replies, deferred edits, follow-ups,
  channel sends, DMs, welcome messages, staff messages, support triage cards,
  support thread messages, notification DMs, and bot operational ready pings.
- Remove legacy embeds from bot-authored message payloads by converting profile,
  rank, and support triage views into V2 containers.
- Preserve existing visibility and routing: public wiki replies stay public,
  private command replies stay ephemeral, notification messages still DM users,
  and support/staff flows keep their current permissions.
- Preserve interactive behavior by nesting existing action rows inside V2
  containers for notify menus, duel cards, and support triage cards.
- Keep semantic custom emoji support through `DISCORD_EMOJI_MAP`, with Unicode
  fallbacks for local development and tests.
- Suppress accidental mentions by default. Explicit mentions are allowed only
  where the current behavior intentionally pings a user, such as duel
  challenges, welcome messages, and support follow-up thread updates.

## Non-Goals

- No new command functionality, notification type, support workflow, or game
  feature.
- No runtime guild emoji discovery. Custom emoji IDs still come from config.
- No visual asset generation.
- No conversion of non-message Discord protocol calls: autocomplete
  `respond(...)`, modal `showModal(...)`, and role/member mutations are not
  message payloads.

## Components V2 Card Contract

Shared bot cards should produce payloads shaped like:

```ts
{
  flags: MessageFlags.IsComponentsV2,
  components: [new ContainerBuilder()],
  allowedMentions: { parse: [] },
}
```

Cards that need private interaction delivery may additionally include
`ephemeral: true` for existing call sites that already use that option. Cards
that intentionally ping users must pass a narrower `allowedMentions`, for
example `{ users: [targetDiscordUserId] }`.

Cards must not include top-level `content` or `embeds`. Text belongs in
`TextDisplayBuilder` components. Buttons belong in action rows added to the
container with `addActionRowComponents(...)`.

## Shared Card Helpers

Add a bot-local V2 helper module:

- `apps/discord-bot/src/discord/v2Card.ts`

Responsibilities:

- Build generic status cards from semantic emoji, title, and detail copy.
- Build text cards from a headline and body lines.
- Build cards with optional action rows for menus and support triage.
- Provide a default mention policy of `{ parse: [] }`.
- Provide test helpers or pure extraction functions only if production code
  benefits from them; tests may keep local extraction helpers.

Keep duel-specific visual logic in `discord/duelCard.ts`. That file already
uses Components V2 and should continue to own duel challenge/result/replay card
layout. Shared helpers may be used for duel fallback/status notices.

## Emoji Model

Continue using the semantic emoji catalog added by this branch:

| Key | Fallback | Used for |
| --- | --- | --- |
| `duel` | ⚔️ | Duel and PvP challenge cards |
| `scout` | 🔍 | Scout notifications |
| `boss` | 🐉 | Boss notifications |
| `victory` | 🏆 | Wins, ranks, successful outcomes |
| `expedition` | 🧭 | Expedition notifications |
| `turns` | ⚡ | Turns command and capped-turn notifications |
| `link` | 🔗 | Account linking |
| `notify` | 🔔 | Notification preferences |
| `wiki` | 📖 | Wiki search |
| `profile` | 🧙 | Profile cards |
| `skills` | ✨ | Skill cards |
| `support` | 🛟 | Reports and support cards |
| `welcome` | 👋 | Welcome cards |
| `success` | ✅ | Completed action status |
| `warning` | ⚠️ | Recoverable user action needed |
| `error` | ❌ | Failed action status |
| `info` | ℹ️ | Neutral information |

`DISCORD_EMOJI_MAP` remains optional and keeps this shape:

```text
DISCORD_EMOJI_MAP=duel=<:pr_duel:123456789012345678>,success=<:pr_success:234567890123456789>
```

## In-Scope Bot Message Surfaces

All of these must emit Components V2 payloads with no top-level `content` or
`embeds`:

- `apps/discord-bot/src/index.ts` ready-channel ping
- `apps/discord-bot/src/discord/welcome.ts`
- `apps/discord-bot/src/notifications/notificationPoll.ts`
- `apps/discord-bot/src/interactions/interactionRouter.ts`
- `apps/discord-bot/src/interactions/linkCommand.ts`
- `apps/discord-bot/src/interactions/notifyCommand.ts`
- `apps/discord-bot/src/interactions/wikiCommand.ts`
- `apps/discord-bot/src/interactions/playerCommands.ts`
- `apps/discord-bot/src/interactions/reportCommand.ts`
- `apps/discord-bot/src/interactions/duelCommand.ts`
- `apps/discord-bot/src/interactions/staffCommands.ts`
- `apps/discord-bot/src/support/triageCards.ts`
- `apps/discord-bot/src/support/threadActions.ts`
- `apps/discord-bot/src/support/triagePoll.ts`

`apps/discord-bot/src/xp/messageXp.ts` analyzes user message text and does not
send bot messages; it is out of scope.

## Testing Requirements

- Add tests for the shared V2 helper proving:
  - cards set `MessageFlags.IsComponentsV2`;
  - default allowed mentions suppress parsing;
  - custom emoji overrides render in card text;
  - action rows are nested inside the container;
  - status cards do not expose top-level `content` or `embeds`.
- Update command, notification, support, staff, and welcome tests to inspect
  V2 card text/components instead of top-level `content` or embeds.
- Keep behavior assertions for API calls, permission checks, defer/reply mode,
  public versus ephemeral delivery, buttons, and mention policy.
- Add a guard test or static unit assertion that representative bot-authored
  payload factories do not return `content` or `embeds`.
- Before completion, run:
  - `rtk npm run test -w apps/discord-bot`
  - `rtk npm run build:discord-bot`
  - `git diff --check`

## Completion Criteria

- `rg "content:|embeds:" apps/discord-bot/src` shows no bot-authored outbound
  message payloads using top-level content or embeds. Remaining matches must be
  non-outbound types, tests, cleanup logic reading historical messages, or
  Discord API inputs that are not messages.
- Every command or button response that sends a message uses a V2 card payload.
- Every DM and channel send initiated by the bot uses a V2 card payload.
- Every legacy embed payload owned by the bot is converted to a V2 container.
- Full Discord bot tests and build pass.
