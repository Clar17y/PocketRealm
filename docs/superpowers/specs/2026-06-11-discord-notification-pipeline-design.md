# Discord Notification Pipeline Design

Issue: #322 (part of tracking issue #321).

## Overview

An API-to-bot event pipeline so PocketRealmBot can proactively message linked users when game events happen, plus a `/notify` command where users opt in or out per notification type. The first concrete notification type is **turns capped**: a DM telling a linked player their turn bank is full and regen is being wasted.

This is the backbone for later notification types (boss/world event/season announcements #323, expedition and guild pings #324, weekly digest #325). Those issues add event producers and channel targets; they reuse the outbox, preferences, delivery loop, and ack flow defined here.

## Architecture Decision

**Postgres outbox + bot poll** (chosen over Redis pub/sub and direct webhooks):

- The API writes notification events to a `discord_notification_events` outbox table.
- The bot polls an internal API endpoint for pending events, sends DMs, and acks delivery — the same shape as the existing support triage poll (`apps/discord-bot/src/support/triagePoll.ts`), including Redis suppression keys to prevent double-sends.
- Durable across bot restarts and deploys; events written while the bot is down are delivered when it returns.
- Latency is poll-interval bound (~30s) which is irrelevant for these notification types.

Rejected alternatives: Redis pub/sub is fire-and-forget (events published during bot downtime are lost, so an outbox is needed anyway); a direct API-to-bot webhook adds an inbound HTTP surface, auth, and retry queues to the bot for no benefit at this scale.

### Boundary rules (unchanged from the persistent-bot design)

- The bot has **no Postgres connection**. `architectureBoundaries.test.ts` continues to enforce this. Both new tables are API-owned.
- All bot access goes through internal `/api/v1/discord/*` routes authenticated with the existing internal API key.
- All notifications are **opt-in**. Notification payloads contain no sensitive data beyond turn counts and friendly copy.

## Turns-Capped Semantics

- Fire **once** when the player's turn bank reaches its cap.
- **Re-arm on spend**: no further notification until the player drops below cap (by spending turns), after which hitting cap again fires again.
- Turn regen is lazy (computed on read from `lastRegenAt` + `regenProgress`; see `apps/api/src/services/turnBankService.ts`), so there is no server-side "hit cap" moment to hook. Detection is a periodic API-side sweep over opted-in players.

## Data Model

Two new API-owned tables following existing `discord_*` conventions (uuid PKs, snake_case `@map`, VarChar(32) Discord snowflakes).

### `DiscordNotificationPreference` (`discord_notification_preferences`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `discordUserId` | VarChar(32) | |
| `discordGuildId` | VarChar(32) | |
| `type` | VarChar(32) | `turns_capped` is the only v1 value |
| `enabled` | Boolean, default `false` | everything opt-in |
| `armed` | Boolean, default `true` | one-shot re-arm state (see sweep) |
| `lastFiredAt` | DateTime? | |
| `createdAt` / `updatedAt` | DateTime | |

- `@@unique([discordGuildId, discordUserId, type])`
- Keyed by Discord user, **not** accountId: the active `DiscordAccountLink` remains the single source of truth for linkage, resolved at sweep time. Unlink/relink does not strand preferences.
- `armed` generalizes to future one-shot condition types; event-driven types (expedition complete) simply never disarm.

### `DiscordNotificationEvent` (`discord_notification_events`) — the outbox

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `discordGuildId` | VarChar(32) | |
| `discordUserId` | VarChar(32)? | DM target; nullable for future channel announcements |
| `type` | VarChar(32) | |
| `payload` | Json | pre-built message content (current turns, cap, copy) |
| `dedupKey` | String? `@unique` | e.g. `turns_capped:<playerId>:<lastRegenAt epoch ms>` |
| `attempts` | Int, default 0 | |
| `createdAt` | DateTime | |
| `deliveredAt` | DateTime? | |
| `failedAt` | DateTime? | set after max attempts; excluded from pending |

- Index on `(deliveredAt, createdAt)` for the pending query.
- Delivered rows are prunable after ~30 days (cleanup can ride the sweep job).
- **No new state on `TurnBank`** — cap detection reads game tables, never writes them.

## API Endpoints

Internal, bot-key authenticated, alongside existing `/api/v1/discord/*` routes. Zod-validated; business logic in a new `apps/api/src/services/discordNotificationService.ts`.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/discord/notifications/preferences?guildId=&discordUserId=` | All known types with enabled state, for the `/notify` UI |
| `POST /api/v1/discord/notifications/preferences` | Upsert one toggle `{discordGuildId, discordUserId, type, enabled}`; 404 without an active account link. (POST not PUT: all existing internal discord mutations are POST and the bot API client implements only get/post.) |
| `GET /api/v1/discord/notifications/pending?limit=50` | Undelivered, non-failed outbox events, oldest first |
| `POST /api/v1/discord/notifications/ack` | `{deliveredIds: [], failedIds: []}` — batch mark `deliveredAt` / bump `attempts`; events reaching max attempts (5) get `failedAt` |

## Turns-Capped Sweep (API-side)

New interval job `runDiscordTurnsCappedSweep()` registered in `apps/api/src/index.ts` next to the existing premium reconciliation / weekly leaderboard timers. Interval: **5 minutes**.

1. Query enabled `turns_capped` preferences joined through active `DiscordAccountLink` -> account -> active player -> `TurnBank` + premium entitlement. Only opted-in linked players are examined.
2. Compute `currentTurns` with the same pure game-engine functions `getTurnState` uses (`calculateCurrentTurns`), and the player's real cap via the premium-aware turn config (`PREMIUM_CONSTANTS.TURN_BANK_CAP` vs `TURN_CONSTANTS.BANK_CAP`).
3. State machine per preference row, each transition in one transaction:
   - **At cap AND `armed`** -> insert outbox event AND set `armed = false`, `lastFiredAt = now`.
   - **Below cap AND NOT `armed`** -> set `armed = true`.
4. `dedupKey = turns_capped:<playerId>:<lastRegenAt epoch ms>`: any spend/refund updates `lastRegenAt`, so the key identifies one cap episode. The unique constraint makes a crashed-mid-sweep retry a no-op, and two API instances sweeping concurrently cannot double-notify (relevant to the horizontal-scaling work in #297). The outbox insert must tolerate the conflict (`createMany({skipDuplicates: true})` or equivalent) so the `armed = false` update still commits when another instance already inserted the event — otherwise a losing racer would retry the same insert every sweep.
5. Payload is built at sweep time (current turns, cap, nudge copy); the bot only renders it.

Worst-case notification latency is sweep interval + poll interval (~6 minutes after hitting an 18-hour cap), which is acceptable.

## `/notify` Command (bot)

`/notify` with no options replies **ephemerally**:

- Not linked -> prompt to use `/link` first; stop.
- Linked -> one toggle button per notification type (v1: "Turns capped: ON/OFF"). Button click -> `PUT` preference upsert -> button updates in place. Uses the existing component-interaction pattern (`apps/discord-bot/src/discord/components.ts`, routed via `interactionRouter.ts`).
- On enabling a DM type, the bot immediately sends a confirmation DM ("You'll be notified here when your turns are full"). If the DM fails (user blocks server DMs), the toggle is reverted and the user is told ephemerally how to fix it — catching the dominant DM failure mode at opt-in time rather than delivery time.

## Delivery Loop (bot)

Third poll loop in `apps/discord-bot/src/index.ts`, every **30 seconds**, mirroring `triagePoll.ts`:

1. `GET /api/v1/discord/notifications/pending?limit=50`.
2. Per event: claim a Redis suppression key (`SET NX EX`, 1h TTL, same shape as triage suppression) to prevent double-sends across overlapping polls -> send the DM -> collect id into `deliveredIds`. DM failure -> `failedIds`.
3. Batch `POST /api/v1/discord/notifications/ack`. Events failing 5 attempts get `failedAt` and stop being served; the bot logs a warning (visible via `#bot-health` logging path).

## Error Handling

- **API down**: delivery poll fails, logs, retries next tick. Outbox rows wait; nothing is lost.
- **Bot/Discord down**: sweep keeps writing outbox rows; the bot drains the backlog on restart. Suppression keys prevent replays of sent-but-unacked events.
- **DM blocked after opt-in**: counts as failed attempts; after 5 the event is marked failed and dropped. The opt-in confirmation DM catches most of these upfront.
- **Send succeeds, ack fails**: the 1h suppression key stops the immediate resend; if the key expires before the API recovers, the worst case is one duplicate DM — the same trade-off the triage poll makes.
- **Unlink while events pending**: the sweep joins through active links so no new events are produced; already-queued events still deliver (earned while linked, no sensitive content).
- **Redis down**: delivery fails open (same graceful degradation as `claimTriagePosting`), relying on the ack cycle for dedup.

## Testing

Unit tests (Vitest, colocated):

- Preference upsert: requires active link; unique per (guild, user, type); defaults off.
- Sweep state machine: fires at cap when armed; disarms; does not refire while capped; re-arms below cap; dedupKey idempotency; premium cap respected; unlinked players skipped.
- Pending/ack endpoints: ordering, limit, attempts increment, `failedAt` after max attempts, failed events excluded from pending.
- Bot delivery loop: suppression claim/release, DM failure -> `failedIds`, batch ack payload (mirrors `triagePoll.test.ts` structure).
- `/notify` interaction: unlinked rejection, toggle round-trip, confirmation-DM failure reverts the toggle.

Integration test: opt in -> force a capped turn bank -> run sweep -> assert outbox row -> run delivery loop with stubbed Discord client -> assert ack marks delivery.

## Build Order

1. Prisma schema + migration for the two tables.
2. `discordNotificationService` + the four routes.
3. Sweep job wired into the API index.
4. Bot delivery poll loop.
5. `/notify` command + toggle buttons + confirmation DM.
6. Integration test and `#bot-health` logging polish.

## Out of Scope (later issues)

- Channel announcements and additional event types (#323, #324).
- Weekly digest aggregation (#325).
- User-configurable "warn before cap" timing.
- Any web/Settings UI for these preferences (Discord-only for now).
