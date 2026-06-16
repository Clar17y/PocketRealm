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

A single new `notifyPlayer()` chokepoint in the API fans each notification out
to **both** existing channels — web push and the Discord outbox — with each
channel gating on its **own** opt-in store. This keeps the two channels fully
independent while ensuring every current and future notification type covers
both without duplicated call sites.

## Background — why this supersedes #337

PR #337 mirrored the **web-push** system to Discord via a Redis queue, gated on
the web `Player.notify*` preferences (default **on**, configured in web
Settings). That meant linking a Discord account would implicitly enroll a player
into DMs — the opposite of an opt-in. Meanwhile #336 established the intended
model: opt in **in Discord** via `/notify` (default **off**), delivered through a
DB outbox + poll. This design adopts the #336 model as the single Discord
notification system and retires the #337 approach. (This branch is cut fresh
from `main`, so there is no #337 code to remove.)

## Goals

- Let players opt into Discord DMs, per event type, via `/notify` (default off).
- Cover the six event-driven notification types the game already raises.
- Reuse #336's delivery infrastructure (outbox, poll, suppression, dedup,
  attempts cap, retention) unchanged.
- Route every event through one chokepoint so web push and Discord stay in sync
  without duplicated wiring.

## Non-goals

- **Web-push behavior is unchanged.** Browser/PWA push keeps its own `notify*`
  toggles (default on), Settings UI, `sendPush`, and subscriptions. We only add a
  parallel Discord path; we do not couple the two opt-in models.
- **No new transport.** No Redis queue, no new HTTP endpoint; reuse the existing
  outbox + `/api/v1/discord/notifications/*` routes.
- **No new DB migration.** The `type` columns are already `VarChar(32)`; we widen
  only the set of valid type strings at the application layer.
- **`turns_capped` stays sweep-driven.** "Turns full" is a *state* with no
  discrete trigger, so it keeps its API sweep. Only the six event types flow
  through the chokepoint.
- **No per-type message customization beyond reusing existing copy** (see
  Formatting). Rich Discord-specific copy per type is a possible follow-up.

## Notification types

Discord type slugs are snake_case (matching the existing `turns_capped`).

| Discord type (`discord_notification_preferences.type`) | Source event (web `NotificationType`) | Trigger |
| --- | --- | --- |
| `turns_capped` *(existing)* | `turnBankFull` | API sweep (unchanged) |
| `pvp_attack` | `pvpAttack` | event |
| `pvp_scout` | `pvpScout` | event |
| `boss_appeared` | `bossAppeared` | event |
| `boss_defeated` | `bossKilled` | event |
| `expedition_recruiting` | `expeditionStarted` | event |
| `expedition_finished` | `expeditionFinished` | event |

The six event types map to existing `sendPush` call sites (eight in total —
`boss_appeared` and `expedition_finished` each fire from two places).
`turns_capped` is **not** in the chokepoint map — it is produced solely by the
existing sweep.

## Architecture (two independent channels)

```
Game event (pvp / boss / expedition)
   └─ notifyPlayer(playerId, webType, { title, body, ...pushExtras })
        ├─ [web push]  sendPush(playerId, webType, payload)
        │                └─ gated on Player.notify* (default on); → push subscriptions
        └─ [discord]   enqueueDiscordNotificationEvent(playerId, discordType, { title, body })
                          ├─ resolve playerId → active link { discordUserId, discordGuildId }
                          ├─ gated on discord_notification_preferences.enabled (default off, via /notify)
                          └─ insert discord_notification_events outbox row
                                   │
Bot poll (existing) ── GET /notifications/pending ──┘
   └─ format per type → users.fetch(discordUserId).send(DM) → ack
```

- **API** owns DB access (link resolution, preference check, outbox insert).
- **Bot** owns the Discord token and delivery (existing poll, unchanged except
  the formatter).
- They communicate only through the existing outbox table + `/notifications/*`
  routes.

## Components

### 1. Shared — `packages/shared/src/discord/discordNotifications.ts`

- Extend `DISCORD_NOTIFICATION_TYPES` from `['turns_capped']` to include the six
  new slugs above.
- Add `DISCORD_NOTIFICATION_TYPE_LABELS` entries (these auto-populate the
  `/notify` buttons): e.g. `pvp_attack: 'PvP attack'`, `pvp_scout: 'PvP scout'`,
  `boss_appeared: 'Boss appeared'`, `boss_defeated: 'Boss defeated'`,
  `expedition_recruiting: 'Expedition recruiting'`,
  `expedition_finished: 'Expedition finished'`.
- Add `WEB_TO_DISCORD_NOTIFICATION_TYPE: Partial<Record<NotificationType,
  DiscordNotificationType>>` mapping the six web types to their Discord slugs.
  `turnBankFull` is intentionally absent.
- Payload typing: introduce `DiscordEventCopyPayload = { title: string; body:
  string }` and make `DiscordNotificationEventView.payload` a union of
  `DiscordTurnsCappedPayload | DiscordEventCopyPayload`.

> Note: `NotificationType` currently lives in
> `apps/api/src/services/pushNotificationService.ts`. The map needs the web type
> values; if importing the union into shared is awkward, key the map by string
> and assert against `NotificationType` at the call boundary. The plan resolves
> the exact placement.

### 2. API — `enqueueDiscordNotificationEvent` (in `discordNotificationService.ts`)

New exported function `enqueueDiscordNotificationEvent(playerId, type:
DiscordNotificationType, copy: { title, body }): Promise<void>`:

1. Resolve `playerId` → active `discordAccountLink` → `{ discordUserId,
   discordGuildId }` via a new `resolveDiscordTarget(playerId)` helper (active
   link predicate: `unlinkedAt: null`, newest by `linkedAt`; mirrors
   `discordLinkedPlayer.ts` / the sweep). Returns early if unlinked.
2. Look up `discord_notification_preferences (discordGuildId, discordUserId,
   type)`. If missing or `enabled = false`, **stop** (the opt-in gate).
3. Insert a `discord_notification_events` outbox row: `{ discordGuildId,
   discordUserId, type, payload: { title, body }, dedupKey }`.
   - `dedupKey` best-effort, where a natural id exists, e.g.
     `pvp_attack:${defenderId}:${attackId}`. Where none exists, omit (null is
     allowed and unique-distinct in Postgres).
4. Fully wrapped/fire-and-forget — a Discord/Redis/DB failure here must never
   affect the originating game request.

### 3. API — `notifyPlayer` chokepoint (new `playerNotifier.ts`)

`notifyPlayer(playerId, type: NotificationType, payload): void` fans out:

- `void sendPush(playerId, type, payload)` — unchanged web-push behavior.
- If `WEB_TO_DISCORD_NOTIFICATION_TYPE[type]` is defined,
  `void enqueueDiscordNotificationEvent(playerId, discordType, { title:
  payload.title, body: payload.body })`.

Each channel independently consults its own opt-in store; `notifyPlayer` itself
does no gating.

### 4. API — call-site migration

Replace the eight existing `sendPush(...)` calls with `notifyPlayer(...)` (same
arguments) in:
`routes/pvp.ts` (pvpScout, pvpAttack), `services/admin/eventAdminService.ts`
(bossAppeared), `services/eventSchedulerService.ts` (bossAppeared),
`services/bossEncounter/resolution.ts` (bossKilled),
`services/expeditionService.ts` (expeditionStarted),
`services/expeditionTransitionService.ts` (expeditionFinished ×2).

### 5. API — preference listing covers all types

Ensure `listDiscordNotificationPreferences` returns a row for **every** type in
`DISCORD_NOTIFICATION_TYPES` (existing row, or a synthesized default-off entry),
so `/notify` shows all seven toggles even before any are persisted. (If it
already synthesizes defaults, no change beyond the widened type list.)

### 6. Bot — `formatNotificationMessage` per type

In `apps/discord-bot/src/notifications/notificationPoll.ts`, branch on
`event.type`:

- `turns_capped` → existing structured message (unchanged).
- the six event types → `${payload.title}\n${payload.body}`.

### 7. `/notify` command — no change required

`handleNotifyCommand` already maps over the preferences returned by the API and
renders a toggle per type using `DISCORD_NOTIFICATION_TYPE_LABELS`. Widening the
type registry (component 1) and the listing (component 5) extends it
automatically.

## Opt-in / consent model

- **Discord DM:** off by default; the player enables each type with `/notify`
  inside the Discord server. Stored in `discord_notification_preferences`.
- **Web push:** unchanged — `Player.notify*` (default on), Settings toggles.
- Linking a Discord account does **not** enroll a player into any DM; they must
  toggle each type on via `/notify`.

## Edge cases

- **Unlinked player** → `resolveDiscordTarget` returns null; nothing enqueued.
- **Pref off / no pref row** → nothing enqueued (the gate).
- **DMs closed / blocked** → handled by the existing poll delivery path
  (unchanged).
- **Bot down** → outbox preserves events; drained on reconnect; attempts cap +
  retention unchanged.
- **Duplicate event fire** → best-effort `dedupKey` (unique) prevents a second
  outbox row where a natural id exists.
- **Multiple links / re-links** → newest active link wins (consistent with the
  sweep and existing lookups).

## What is explicitly NOT changed

- Web push: `sendPush`, push subscriptions, VAPID, `Player.notify*`, Settings UI.
- The `turns_capped` sweep, its payload, and its message copy.
- The outbox schema, poll cadence, suppression, ack, attempts cap, retention.
- `/notify` command structure (only the type list it renders grows).

## Testing

### API
- `enqueueDiscordNotificationEvent` inserts an outbox row only when the player is
  linked **and** the matching pref is `enabled`; inserts nothing when unlinked or
  the pref is off/missing. (Mock Prisma, following existing service test
  patterns.)
- `notifyPlayer` calls `sendPush` for every type and additionally enqueues a
  Discord event for each of the six mapped types; does not enqueue for an
  unmapped type (e.g. `turnBankFull`).
- One routing assertion per event type (correct Discord slug + title/body).
- `listDiscordNotificationPreferences` returns all seven types (default off).

### Bot
- `formatNotificationMessage` renders the structured `turns_capped` message and
  the `${title}\n${body}` form for each event type.
- Poll delivery / suppression / ack behavior unchanged (existing tests stay
  green).

## Changelog

Add a `0.66` (2026-06-17) entry describing the real feature:

> **More Discord Alerts** — `/notify` now lets you opt into Discord DMs for PvP
> attacks, PvP scouts, bosses appearing, bosses being defeated, expeditions
> recruiting, and expeditions finishing — in addition to turns capped. Everything
> is off until you turn it on; link with `/link`, then run `/notify` in the
> Pocketrealm Discord and toggle the alerts you want.

## Rollout / config

- No new env vars (API and bot already share `REDIS_URL` / the internal API).
- No DB migration.
- Operational note (pre-existing, unrelated to this feature): the live bot token
  and support webhook secret currently in the untracked `docs/Discord.txt` should
  be rotated and moved to a secrets store.
```
