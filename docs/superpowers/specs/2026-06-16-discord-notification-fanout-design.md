# Discord Notification Fan-out — Design

**Date:** 2026-06-16
**Status:** Approved (design); pending implementation plan
**Branch:** `discord-notification-fanout`

## Summary

Mirror the existing web-push notifications to Discord DMs. Today the API fires
`sendPush(playerId, type, payload)` at real event points for 7 notification
types. This feature fans those same events out to a Discord DM for any player
who has linked their Discord account and opted in — with no new event triggers
and no new opt-in surface. The Discord bot's only current proactive-notification
to a player ("you have max turns") is replaced/subsumed by this general path.

## Goals

- Deliver time-sensitive ("don't-miss-it") alerts to Discord DMs in real time.
- Reuse the existing event triggers and per-player notification preferences.
- Keep the change to a single chokepoint so all current and future
  `sendPush` types are covered automatically.

## Non-goals (deferred)

- **Per-channel opt-in controls** — the MVP reuses the existing single `notify*`
  preference for both web push and Discord. A player cannot yet choose "web off,
  Discord on". Adding separate Discord toggles (or a `/notifications` command) is
  a follow-up.
- **Daily digest / summary DMs** — out of scope for this iteration.
- **New personal triggers** (HP recovered, KO'd in PvP, achievement/level-up,
  rank change) — these have no existing `sendPush` hook and are out of scope.
- **Channel posts / social hype** — DMs only.

## Notification types covered

All 7 existing `NotificationType` values, by virtue of hooking `sendPush`:
`pvpAttack`, `pvpScout`, `bossAppeared`, `bossKilled`, `turnBankFull`,
`expeditionStarted`, `expeditionFinished`.

## Architecture & data flow

Hook into the single existing chokepoint — `sendPush()` in
`apps/api/src/services/pushNotificationService.ts`. After it confirms the
player's `notify*` preference is enabled (the check already present), it
additionally fans the event out to Discord.

```
API event (pvp / boss / expedition / turns)
   └─ sendPush(playerId, type, payload)
        ├─ [existing] pref check  ──► if off, stop entirely
        ├─ [existing] web-push to PWA subscriptions
        └─ [NEW] resolve playerId → linked discordUserId
                  └─ if linked: LPUSH notification onto Redis queue
                                          │
Discord bot ── BRPOP loop on Redis queue ─┘
   └─ client.users.fetch(discordUserId) → user.send(DM)
```

Boundaries:
- **API** is the only component that touches the database (resolving the link).
- **Bot** is the only component that holds the Discord token and can DM.
- They communicate over the **already-shared Redis** (`REDIS_URL`). No new HTTP
  endpoint, no polling for this path.

## Components

### 1. API — `apps/api/src/services/discordNotifier.ts` (new)

- `resolveDiscordTarget(playerId): Promise<{ discordUserId, guildId } | null>`
  - Looks up the player's `accountId`, then the active `discordAccountLink`
    (`unlinkedAt: null`, newest by `linkedAt`). Returns `null` when the player
    is unlinked. Reuses the same query shape as
    `apps/api/src/services/discordLinkedPlayer.ts`.
- `publishDiscordNotification(payload): Promise<void>`
  - `LPUSH`es a JSON message onto a Redis list (e.g. key
    `discord:notifications`). Payload: `{ discordUserId, type, title, body }`.
  - Applies a max-length cap (`LTRIM` or `LPUSH` + length guard) so an offline
    bot cannot let the queue grow without bound.

### 2. API — `pushNotificationService.ts` (modified)

- After the pref check passes (and independent of whether web-push
  subscriptions exist), call:
  `void resolveDiscordTarget(playerId).then(target => target && publishDiscordNotification(...))`.
- Fire-and-forget and fully wrapped: a Discord/Redis failure must never affect
  web-push delivery or the originating request.
- The Discord fan-out runs **even when the player has zero web-push
  subscriptions** — it must sit before/independent of the existing
  `subs.length === 0` early return.

### 3. Bot — `apps/discord-bot/src/notifications/notificationConsumer.ts` (new)

- Started from `ClientReady` in `apps/discord-bot/src/index.ts`, mirroring how
  the support-triage loop and role sync are wired (long-lived Redis client,
  guarded against overlapping runs, cleared on shutdown).
- Runs a `BRPOP` loop on the Redis queue. For each message:
  - `client.users.fetch(discordUserId)` then `user.send({ content })`.
  - Catches "cannot send to this user" (DMs closed / bot blocked) and logs at
    `debug`; never throws out of the loop.
  - Applies a light throttle between sends to respect Discord's global DM rate
    limit during burst fan-outs (boss-appeared / expedition loop over many
    players).

## Transport decision

**Durable Redis list queue** (`LPUSH` from API, `BRPOP` in bot), chosen over
pub/sub. Pub/sub silently drops messages whenever the bot is restarting or
deploying — precisely when a "you're being attacked" alert would be lost. A list
costs roughly the same code and provides at-least-once delivery. A max-length
cap bounds growth if the bot stays down.

## Preferences / opt-in (MVP)

Reuse the existing `notify*` columns on `Player`. One toggle per type governs
**both** web push and Discord delivery. No schema change, no new command.
Tradeoff documented under non-goals.

## Edge cases

- **DMs closed / bot blocked** → catch, debug-log, continue.
- **Bot down during deploy** → list queue preserves messages; drained on
  reconnect; max-length cap prevents unbounded growth.
- **Burst fan-out** → bot drains sequentially with a light throttle.
- **Unlinked player / no active link** → `resolveDiscordTarget` returns `null`;
  nothing is published.
- **Multiple links / re-links** → newest active link (`unlinkedAt: null`,
  ordered by `linkedAt desc`) wins, consistent with existing lookup behavior.

## Testing

### API
- `discordNotifier.resolveDiscordTarget` returns the linked target when an
  active link exists and `null` when unlinked.
- `sendPush` publishes to the Redis queue when the player is linked and the
  pref is on; does **not** publish when the pref is off or the player is
  unlinked. (Mock Redis, following the existing `sendPush` test patterns.)
- Discord fan-out still occurs when the player has zero web-push subscriptions.

### Bot
- Consumer fetches the user and sends a DM for a queued message.
- Consumer swallows "cannot DM user" errors without breaking the loop.
- Consumer drains multiple queued messages in order.

## Rollout / config

- No new env vars required (API and bot already share `REDIS_URL`).
- Operational note (separate from this feature): the live bot token and support
  webhook secret currently sitting in the untracked `docs/Discord.txt` should be
  rotated and moved to a secrets store; they should not live in the repo tree.
