# Discord XP API Migration Design

## Overview

Move every durable Discord XP mutation out of the Discord bot worker and behind PocketRealm's internal API. The bot remains the Discord Gateway and interaction process, but the API becomes the only process that writes `DiscordCommunityProfile`, `DiscordXpEvent`, `DiscordBotAuditEvent`, and `lastRoleSyncAt`.

This closes the architectural gap left in PR 315: the current bot grants automatic message XP and handles `/staff xp-adjust` by importing Prisma through `apps/discord-bot/src/prismaTypes.ts`. That bypasses the API boundary described in the persistent bot design and keeps database-write privileges in the worker. After this migration, the bot may still read/process Discord events and assign Discord roles, but all PocketRealm-owned state changes go through authenticated internal endpoints.

## Goals

- Route automatic chat XP grants through the existing `/api/v1/discord` internal bot API.
- Route `/staff xp-adjust` through the same API boundary.
- Keep Discord XP separate from gameplay XP, turns, gold, items, achievements, and combat power.
- Preserve current anti-farming behavior: cooldowns, ignored channels, support/staff exclusions, duplicate fingerprint suppression, daily soft cap, idempotent message IDs, and excluded-user checks.
- Preserve privacy by never sending raw Discord message content to the API.
- Keep Discord role assignment in the bot, because only the Discord bot can call Discord member role APIs.
- Remove the bot's direct Prisma dependency and add a boundary guard so it does not return accidentally.

## Non-Goals

- No gameplay XP or player progression API changes.
- No changes to the Discord XP balance constants.
- No new Discord level-role policy beyond the existing "highest qualifying configured role" behavior.
- No implementation of the separate unresolved triage-card/GitHub/known-issue feature scope.
- No broad support-ticket route refactor beyond adding XP endpoints under the existing Discord router.

## Current State

The worktree already has:

- Internal bot auth in `apps/api/src/middleware/internalBotAuth.ts`.
- Existing internal Discord routes in `apps/api/src/routes/discord.ts`.
- A bot API client in `apps/discord-bot/src/api/pocketRealmApi.ts`.
- Automatic message XP in `apps/discord-bot/src/xp/messageXp.ts`.
- Staff XP adjustment in `apps/discord-bot/src/interactions/staffCommands.ts`.
- Narrow Prisma structural types in `apps/discord-bot/src/prismaTypes.ts`.
- Prisma models `DiscordCommunityProfile`, `DiscordXpEvent`, and `DiscordBotAuditEvent`.

The two direct write paths are:

1. `grantXpForMessage` creates/updates `DiscordCommunityProfile` and inserts `DiscordXpEvent`.
2. `/staff xp-adjust` creates/updates `DiscordCommunityProfile` and inserts `DiscordBotAuditEvent`.

Both paths also update `lastRoleSyncAt` after successful Discord role assignment.

## Recommended Architecture

Use the existing internal bot API boundary.

```text
Discord Gateway event or interaction
  -> apps/discord-bot
  -> PocketRealmApiClient with x-pocketrealm-bot-key
  -> /api/v1/discord/xp/*
  -> apps/api/src/services/discordXpService.ts
  -> Prisma transaction
  -> bot assigns Discord role if API response says a level role is now due
  -> bot reports successful role sync back to API
```

The API owns every durable state mutation. The bot owns Discord-only behavior:

- receiving Discord events and interactions
- checking whether a message is obviously ineligible without touching the database
- normalizing and fingerprinting message content
- using Redis for short-lived message cooldowns
- assigning roles in Discord
- releasing Redis cooldowns if the API rejects or fails the grant

The API repeats every database-backed check before mutating:

- message ID idempotency
- duplicate fingerprint window
- excluded user
- daily soft cap
- profile create/update
- XP event insert
- staff adjustment audit insert

## API Surface

All endpoints use `requireInternalBotAuth` and live under `apps/api/src/routes/discord.ts`.

### `POST /api/v1/discord/xp/messages`

Request body:

```ts
{
  discordGuildId: string;
  discordUserId: string;
  channelId: string;
  messageId: string;
  messageFingerprint: string;
}
```

Validation:

- every Discord ID is a snowflake
- `messageFingerprint` is a 64-character lowercase hex SHA-256 digest
- no raw content field is accepted
- body is strict, so extra fields return 400

Response:

```ts
{
  result: {
    eligible: boolean;
    reason:
      | 'granted'
      | 'already_processed'
      | 'duplicate_fingerprint'
      | 'excluded_from_xp'
      | 'daily_cap';
    xpGranted?: number;
    previousLevel?: number;
    newLevel?: number;
    profileId?: string;
  }
}
```

The API returns `eligible: false` for normal non-exception grant denials so the bot can release the cooldown and continue quietly. Unexpected service failures still surface as errors so the bot logs them and releases cooldown in its existing failure path.

### `POST /api/v1/discord/xp/adjustments`

Request body:

```ts
{
  discordGuildId: string;
  actorDiscordUserId: string;
  targetDiscordUserId: string;
  amount: number;
  reason: string;
}
```

Validation:

- Discord IDs are snowflakes
- `amount` is an integer and can be positive or negative
- `reason` is trimmed and capped to the existing 500-character staff-note behavior

Response:

```ts
{
  adjustment: {
    profileId: string | null;
    targetDiscordUserId: string;
    amount: number;
    previousXp: number;
    newXp: number;
    previousLevel: number;
    newLevel: number;
    reason: string;
  }
}
```

Behavior:

- positive adjustments create the profile when it does not exist
- negative adjustments never create a profile and never reduce XP below zero
- negative adjustments use guarded compare-and-update semantics, preserving the current race protection
- every successful adjustment writes a `DiscordBotAuditEvent`
- failed service operations write a failed audit event when enough context is available

### `POST /api/v1/discord/xp/role-sync`

Request body:

```ts
{
  profileId: string;
  discordGuildId: string;
  discordUserId: string;
  roleId: string;
  level: number;
  syncedAt?: string;
}
```

Validation:

- `profileId` is a UUID
- Discord IDs are snowflakes
- `level` is a positive integer
- `syncedAt`, if present, is an ISO timestamp

Behavior:

- updates `DiscordCommunityProfile.lastRoleSyncAt`
- requires the `profileId`, guild ID, and user ID to match the same profile
- returns 404 if the profile is missing
- does not call Discord; it only records that the bot successfully did so

## API Service

Create `apps/api/src/services/discordXpService.ts`.

Responsibilities:

- import `levelForDiscordXp` from a shared Discord XP helper
- grant message XP in a transaction
- apply staff XP adjustments in a transaction
- record staff XP adjustment failures best-effort
- mark role sync after bot role assignment

The service should use `DISCORD_XP_CONSTANTS` from `@pocketrealm/shared/constants/gameConstants` so the current balance remains unchanged.

### Shared Helper Placement

Move reusable pure helpers out of the bot:

- `levelForDiscordXp`
- `highestRoleIdForLevel`

Preferred location:

- `packages/shared/src/discord/discordXp.ts`

Add a package subpath export in `packages/shared/package.json`:

- `@pocketrealm/shared/discord/discordXp`

This lets API and bot share the exact level calculation without making either side depend on the other. The message fingerprinting function can stay in the bot because the API should not receive raw Discord message content.

## Bot Changes

### Automatic Message XP

`apps/discord-bot/src/xp/messageXp.ts` keeps:

- `evaluateXpMessage`
- channel and content eligibility checks
- fingerprint generation
- Redis cooldown NX check
- cooldown release helper
- role assignment through Discord guild/member APIs

It no longer receives or imports a Prisma client. Instead, `GrantXpMessageDeps` receives an API client capable of:

```ts
post<T>(path: string, body: unknown): Promise<T>
```

Grant flow:

1. evaluate local ineligibility
2. set Redis cooldown
3. call `POST /api/v1/discord/xp/messages`
4. release cooldown if API returns `eligible: false`
5. if level increased, assign the highest configured level role
6. after successful Discord role assignment, call `POST /api/v1/discord/xp/role-sync`

The bot logs skipped grant reasons exactly as it does now.

### Staff XP Adjustment

`apps/discord-bot/src/interactions/staffCommands.ts` keeps:

- staff role authorization
- slash-command orchestration
- Discord role assignment after adjustment
- user-facing ephemeral replies

It no longer imports `getDefaultDiscordPrisma`, `StaffPrismaClient`, or `DiscordCommunityProfileRecord`.

Adjustment flow:

1. validate staff member
2. call `POST /api/v1/discord/xp/adjustments`
3. if the API returns a higher level and a configured role exists, assign the role
4. after successful role assignment, call `/xp/role-sync`
5. edit the deferred reply with the API-returned XP total and level

If the API call fails, the bot replies with the current generic failure copy. The API service should be responsible for success audit rows and best-effort failure audit rows.

### Bot Startup

`apps/discord-bot/src/index.ts` should instantiate `createMessageXpService` with the existing `PocketRealmApiClient` instead of `getDefaultDiscordPrisma()`.

After migration, no production bot source should import:

- `@pocketrealm/database`
- `apps/discord-bot/src/prismaTypes.ts`

Delete `apps/discord-bot/src/prismaTypes.ts` once tests no longer need it.

## Data And Privacy

The API must never accept or store raw Discord message content for XP. The bot sends only:

- guild ID
- user ID
- channel ID
- message ID
- normalized content fingerprint

The existing `DiscordXpEvent` model remains sufficient. No Prisma migration is planned for this migration. The existing unique constraint on `(discordGuildId, messageId)` remains the idempotency guard.

## Error Handling

- Local bot ineligibility returns quiet skipped results.
- API business denials return `eligible: false` with a reason.
- API validation errors are logged by the bot as failures because they indicate a contract bug.
- API/server failures cause the bot to release the Redis cooldown and log a warning.
- Role assignment failures do not roll back XP, matching current behavior. They are logged and can be repaired by role sync.
- Role sync timestamp updates are best effort. A failure to mark `lastRoleSyncAt` should not fail the original XP grant or staff adjustment.

## Boundary Guard

Add a test to prevent regression:

- scan `apps/discord-bot/src/**/*.ts`
- fail if any production source imports `@pocketrealm/database`
- fail if any production source imports `./prismaTypes` or `../prismaTypes`

The test may allow fixture text inside tests if needed, but the preferred implementation is to remove all test dependency on `prismaTypes` too.

Also remove `@pocketrealm/database` from `apps/discord-bot/package.json`. The bot build should depend on `@pocketrealm/shared`, Discord, Redis, logging, and Zod, but not the generated Prisma client.

## Testing

### API Tests

Add `apps/api/src/services/discordXpService.test.ts` covering:

- message XP creates a profile and event for a new user
- message XP updates an existing profile and recalculates level
- existing message ID returns `already_processed`
- duplicate fingerprint within the configured window returns `duplicate_fingerprint`
- excluded profile returns `excluded_from_xp`
- daily cap returns `daily_cap`
- partial grant at the daily cap stores the partial XP
- no raw message content is accepted by route validation
- positive staff adjustment creates/updates profile and writes a success audit event
- negative staff adjustment clamps at zero and writes the applied amount
- failed staff adjustment records a failed audit event best-effort
- role sync updates `lastRoleSyncAt` only for the matching profile/guild/user

Update `apps/api/src/routes/discord.test.ts` for the three new endpoints and strict validation behavior.

### Bot Tests

Update `apps/discord-bot/src/xp/messageXp.test.ts`:

- use a fake API client instead of fake Prisma
- assert the API receives fingerprint-only payloads
- assert cooldown release on API business denial and thrown API failure
- assert role sync endpoint is called only after successful Discord role assignment

Update `apps/discord-bot/src/interactions/staffCommands.test.ts`:

- use a fake API client for `xp-adjust`
- assert the adjustment endpoint receives actor, target, amount, and reason
- assert the reply uses API-returned totals
- assert level-role assignment still happens
- assert role-sync reporting happens after successful role assignment
- assert non-staff rejection still happens before any API call

Add a bot boundary test for no database imports.

## Verification

Focused verification:

```powershell
npm test -w apps/api -- --run src/routes/discord.test.ts src/services/discordXpService.test.ts
npm test -w apps/discord-bot -- --run src/xp/messageXp.test.ts src/interactions/staffCommands.test.ts
npm test -w packages/shared -- --run src/packageExports.test.ts
rtk npm run typecheck
```

Broader verification if focused tests or typecheck touch shared exports:

```powershell
npm run build:api
npm run build:discord-bot
```

## Rollout Notes

This is a code-boundary migration, not a database migration. Deployment should be safe as a single PR as long as the API and bot deploy together. If they can deploy separately, deploy the API first so the new endpoints exist before the bot starts calling them.

If the bot runs against an older API during rollout, message XP and staff XP adjustment will fail closed with warning logs rather than writing directly to the database. That is acceptable because Discord XP is cosmetic and can tolerate a short outage.

## Open Follow-Ups

- The unresolved support triage buttons and `/staff repair-ticket`, `/staff sync-ticket`, `/staff known-issue` commands remain separate feature scope.
- A future Discord XP leaderboard endpoint can reuse `discordXpService`, but it is not required for this migration.
- A future repair command could resync `lastRoleSyncAt` and missing level roles using the same role-sync endpoint.
