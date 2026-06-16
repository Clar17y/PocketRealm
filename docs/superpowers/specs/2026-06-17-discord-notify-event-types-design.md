# Discord `/notify` — Event-Driven Notification Types — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Branch:** `discord-notify-event-types`
**Supersedes:** PR #337 (`discord-notification-fanout`, closed)

## Summary

Extend the existing Discord notification pipeline (shipped in #322 / #336 for the
single `turns_capped` alert) to cover six additional, **event-driven** game
notifications. Players opt in **inside Discord** with `/notify`, per type, all
off by default. Delivery reuses the existing durable outbox + bot poll
(suppression, dedup, attempts cap, retention) — no new transport.

Each DM carries **rich, Discord-specific copy** (emoji, bold names, and a
clickable deep link into the relevant game screen), formatted in the bot from a
small structured payload — the same pattern `turns_capped` already uses.

## Background — why this supersedes #337

PR #337 mirrored the **web-push** system to Discord via a Redis queue, gated on
the web `Player.notify*` preferences (default **on**, configured in web
Settings). That meant linking a Discord account would implicitly enroll a player
into DMs — the opposite of an opt-in. Meanwhile #336 established the intended
model: opt in **in Discord** via `/notify` (default **off**), delivered through a
DB outbox + poll. This design adopts the #336 model as the single Discord
notification system. (This branch is cut fresh from `main`, so there is no #337
code to remove.)

## Goals

- Let players opt into Discord DMs, per event type, via `/notify` (default off).
- Cover the six event-driven notification types the game already raises.
- Reuse #336's delivery infrastructure (outbox, poll, suppression, dedup,
  attempts cap, retention) unchanged.
- Rich, native-feeling DM copy with a deep link into the game.
- Keep web push and Discord as independent channels, each reading its own opt-in
  store, without duplicated wiring for targeted events.

## Non-goals

- **Web-push behavior is unchanged.** Browser/PWA push keeps its own `notify*`
  toggles (default on), Settings UI, `sendPush`, and subscriptions.
- **No new transport.** Reuse the existing outbox + `/api/v1/discord/notifications/*`
  routes.
- **No new DB migration.** The `type` columns are already `VarChar(32)`; we widen
  only the set of valid type strings at the application layer.
- **`turns_capped` stays sweep-driven.** Only the six new types are produced by
  game events.

## Notification types

Discord type slugs are snake_case (matching the existing `turns_capped`).

| Discord type | Source event (web `NotificationType`) | Delivery shape |
| --- | --- | --- |
| `turns_capped` *(existing)* | `turnBankFull` | API sweep (unchanged) |
| `pvp_attack` | `pvpAttack` | targeted (defender) |
| `pvp_scout` | `pvpScout` | targeted (scouted player) |
| `boss_appeared` | `bossAppeared` | **broadcast** (all opted-in users) |
| `boss_defeated` | `bossKilled` | targeted (each contributor) |
| `expedition_recruiting` | `expeditionStarted` | targeted (guild members) |
| `expedition_finished` | `expeditionFinished` | targeted (expedition members) |

**Targeted vs broadcast matters for audience.** Targeted events fire for a known
player (or set of players), so each channel can gate internally. `boss_appeared`
is a true broadcast — the existing web-push path loops over **push subscribers**,
which is a different audience from **Discord-opted-in users**. So the Discord
broadcast must iterate its own audience (the preference table), not piggyback the
web-push subscriber loop. (See Architecture.)

## Copy & deep links

Formatted in the bot from a structured payload. Names are **bold**; each ends
with a markdown deep link built from `config.webBaseUrl` (mirrors the service
worker's existing push deep links in `apps/web/src/app/sw.ts`):

| Type | Structured payload | DM (`{base}` = `config.webBaseUrl`) |
| --- | --- | --- |
| `pvp_attack` | `{ attackerName }` | ⚔️ **{attackerName}** challenged you in the arena! [Fight back →]({base}/game?screen=arena) |
| `pvp_scout` | `{ scouterName }` | 🔍 **{scouterName}** is sizing you up in the arena. [Check the arena →]({base}/game?screen=arena) |
| `boss_appeared` | `{ bossName, zoneName }` | 🐉 **{bossName}** has appeared in **{zoneName}**! [Join the fight →]({base}/game?screen=worldEvents) |
| `boss_defeated` | `{ bossName }` | 🏆 **{bossName}** has been slain! [Claim your spoils →]({base}/game?screen=worldEvents) |
| `expedition_recruiting` | `{ tier }` | 🧭 A Tier {tier} guild expedition is recruiting — [sign up →]({base}/game?screen=guild&tab=expeditions) |
| `expedition_finished` (victory) | `{ tier, outcome: 'victory' }` | 🎉 Your Tier {tier} expedition was victorious! [Collect rewards →]({base}/game?screen=guild&tab=expeditions) |
| `expedition_finished` (failed) | `{ tier, outcome: 'failed', attempts }` | 💀 Your Tier {tier} expedition failed after {attempts} attempts. [View expeditions →]({base}/game?screen=guild&tab=expeditions) |

Deep-link screen mapping (identical to web push): pvp → `arena`, boss →
`worldEvents`, expedition → `guild&tab=expeditions`.

## Architecture (two independent channels)

```
Targeted event (pvp / boss defeated / expedition)
   └─ notifyPlayer(playerId, webType, push, discordPayload)
        ├─ [web push]  sendPush(playerId, webType, push)         (gated on Player.notify*)
        └─ [discord]   enqueueDiscordNotificationEvent(playerId, discordType, discordPayload)
                          ├─ resolve playerId → active link { discordUserId, discordGuildId }
                          ├─ gated on discord_notification_preferences.enabled (default off)
                          └─ insert outbox row { ..., type, payload: discordPayload, dedupKey }

Broadcast event (boss appeared)
   ├─ [web push]  loop push subscribers → sendPush(...)          (unchanged)
   └─ [discord]   broadcastDiscordNotification(discordType, discordPayload)
                     └─ for each enabled pref of that type → insert outbox row

Bot poll (existing) ── GET /notifications/pending ──> format per type (rich copy + link) ──> DM ──> ack
```

- **API** owns DB access (link resolution, preference checks, outbox inserts).
- **Bot** owns the Discord token, delivery, and all message copy.
- They communicate only through the existing outbox table + `/notifications/*`
  routes.

## Components

### 1. Shared — `packages/shared/src/discord/discordNotifications.ts`

- Extend `DISCORD_NOTIFICATION_TYPES` to include the six new slugs.
- Add `DISCORD_NOTIFICATION_TYPE_LABELS` entries (auto-populate `/notify`
  buttons): `PvP attack`, `PvP scout`, `Boss appeared`, `Boss defeated`,
  `Expedition recruiting`, `Expedition finished`.
- Add `WEB_TO_DISCORD_NOTIFICATION_TYPE` mapping the six web `NotificationType`
  values → Discord slugs (`turnBankFull` intentionally absent).
- Define a structured payload type per event type and make
  `DiscordNotificationEventView.payload` a union of all of them plus the existing
  `DiscordTurnsCappedPayload`. Payload shapes per the Copy table above.

### 2. API — `enqueueDiscordNotificationEvent` (targeted, in `discordNotificationService.ts`)

`enqueueDiscordNotificationEvent(playerId, type, payload): Promise<void>`:

1. Resolve `playerId` → active `discordAccountLink` → `{ discordUserId,
   discordGuildId }` via a new `resolveDiscordTarget(playerId)` helper (active
   link predicate `unlinkedAt: null`, newest by `linkedAt`; mirrors
   `discordLinkedPlayer.ts` / the sweep). Returns early if unlinked.
2. Look up `discord_notification_preferences (discordGuildId, discordUserId,
   type)`. If missing or `enabled = false`, **stop**.
3. Insert an outbox row `{ discordGuildId, discordUserId, type, payload,
   dedupKey }`. `dedupKey` best-effort where a natural id exists (e.g.
   `pvp_attack:${defenderId}:${matchId}`, `boss_defeated:${encounterId}:${playerId}`).
4. Fully wrapped/fire-and-forget — never affects the originating game request.

### 2b. API — `broadcastDiscordNotification` (broadcast, in `discordNotificationService.ts`)

`broadcastDiscordNotification(type, payload): Promise<void>`:

- Query `discord_notification_preferences WHERE type = type AND enabled = true`.
- Insert one outbox row per opted-in `(discordGuildId, discordUserId)` with the
  shared structured `payload` and a `dedupKey` like
  `boss_appeared:${eventId}:${discordUserId}`.
- Used by `boss_appeared` (one call per boss spawn). Fire-and-forget.

### 3. API — `notifyPlayer` chokepoint (new `playerNotifier.ts`)

`notifyPlayer(playerId, type, push, discordPayload): void` for **targeted**
events. Fans out:

- `void sendPush(playerId, type, push)` — unchanged web push.
- If `WEB_TO_DISCORD_NOTIFICATION_TYPE[type]` is defined,
  `void enqueueDiscordNotificationEvent(playerId, discordType, discordPayload)`.

Each channel independently consults its own opt-in store; `notifyPlayer` does no
gating. (Typing ties `discordPayload`'s shape to the mapped Discord type — the
plan resolves the exact generics.)

### 4. API — call-site migration

**Targeted** — replace `sendPush(...)` with `notifyPlayer(...)`, adding the
structured Discord payload:
- `routes/pvp.ts` — `pvpScout` (`{ scouterName: req.player.username }`),
  `pvpAttack` (`{ attackerName: result.attackerName }`).
- `services/bossEncounter/resolution.ts` — `bossKilled`, per contributor
  (`{ bossName: encounter.mobTemplate.name }`).
- `services/expeditionService.ts` — `expeditionStarted` (`{ tier }`).
- `services/expeditionTransitionService.ts` — `expeditionFinished` ×2
  (`{ tier, outcome: 'failed', attempts }` / `{ tier, outcome: 'victory' }`).

**Broadcast** — leave the existing web-push subscriber loop calling `sendPush`
**unchanged**, and add one `broadcastDiscordNotification('boss_appeared', {
bossName, zoneName })`:
- `services/admin/eventAdminService.ts` and `services/eventSchedulerService.ts`.

### 5. API — preference listing covers all types

Ensure `listDiscordNotificationPreferences` returns a row for **every** type in
`DISCORD_NOTIFICATION_TYPES` (existing or synthesized default-off), so `/notify`
shows all seven toggles before any are persisted.

### 6. Bot — per-type rich formatter

In `apps/discord-bot/src/notifications/notificationPoll.ts`, replace the single
`formatNotificationMessage` with a per-type formatter that takes the event +
`config.webBaseUrl` and renders the copy from the Copy table:
- `turns_capped` → existing structured message (unchanged).
- the six event types → rich copy + deep link.

`config.webBaseUrl` is already loaded (`POCKETREALM_WEB_BASE_URL`, required) and
must be threaded into the poll's formatting call.

### 7. `/notify` command — no change required

Already maps over the API's preference list using
`DISCORD_NOTIFICATION_TYPE_LABELS`. Widening the registry (1) and the listing (5)
extends it automatically.

## Opt-in / consent model

- **Discord DM:** off by default; enabled per type with `/notify` in the server.
  Stored in `discord_notification_preferences`.
- **Web push:** unchanged — `Player.notify*` (default on), Settings toggles.
- Linking a Discord account does **not** enroll a player into any DM.

## Edge cases

- **Unlinked player** → `resolveDiscordTarget` returns null; nothing enqueued.
- **Pref off / no row** → nothing enqueued (the gate).
- **DMs closed / blocked** → handled by the existing poll delivery path.
- **Bot down** → outbox preserves events; drained on reconnect; attempts cap +
  retention unchanged.
- **Duplicate event fire** → best-effort `dedupKey` (unique) prevents a second
  outbox row.
- **Broadcast scale** → one outbox row per opted-in user; the poll already
  throttles/batches delivery (`PENDING_BATCH_LIMIT`).
- **Multiple links / re-links** → newest active link wins.

## What is explicitly NOT changed

- Web push: `sendPush`, push subscriptions, VAPID, `Player.notify*`, Settings UI,
  and the web-push subscriber loops (including for `boss_appeared`).
- The `turns_capped` sweep, its payload, and its message copy.
- The outbox schema, poll cadence, suppression, ack, attempts cap, retention.
- `/notify` command structure (only the type list it renders grows).

## Testing

### API
- `enqueueDiscordNotificationEvent` inserts an outbox row only when the player is
  linked **and** the matching pref is `enabled`; nothing when unlinked or off.
- `broadcastDiscordNotification` inserts one row per enabled pref and none when
  there are no opted-in users.
- `notifyPlayer` calls `sendPush` for every type and additionally enqueues for
  each of the six mapped types; does not enqueue for an unmapped type.
- One routing assertion per event type (correct Discord slug + payload).
- `listDiscordNotificationPreferences` returns all seven types (default off).

### Bot
- The per-type formatter renders the structured `turns_capped` message and the
  rich copy + correct deep link for each of the six event types (assert the
  `screen=` target and bolded name).
- Poll delivery / suppression / ack behavior unchanged (existing tests stay
  green).

## Changelog

Add a `0.66` (2026-06-17) entry:

> **More Discord Alerts** — `/notify` now lets you opt into Discord DMs for PvP
> attacks, PvP scouts, bosses appearing, bosses being defeated, expeditions
> recruiting, and expeditions finishing — in addition to turns capped. Each DM
> links straight to the right screen in-game. Everything is off until you turn it
> on; link with `/link`, then run `/notify` in the Pocketrealm Discord.

## Rollout / config

- No new env vars — `POCKETREALM_WEB_BASE_URL` is already required by the bot.
- No DB migration.
- Operational note (pre-existing, unrelated): the live bot token and support
  webhook secret currently in the untracked `docs/Discord.txt` should be rotated
  and moved to a secrets store.
```
