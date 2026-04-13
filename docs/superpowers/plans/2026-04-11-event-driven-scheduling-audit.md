# Cancellation Audit - Event-Driven Scheduling

Generated during Task 1. Classifies production write paths that affect `BossEncounter.nextRoundAt`, `GuildExpedition.nextRoundAt`, or related scheduled status transitions.

The plan's broad `rg` commands also matched test mocks and assertions. Those test-only hits are intentionally excluded from the classification tables below; all non-test production matches from Steps 1-2 are represented.

## Legend

- **S** - schedules a new timer or leaves an active scheduled row with non-null `nextRoundAt`
- **C** - cancels a timer because the row becomes terminal/unscheduled, sets `nextRoundAt: null`, moves out of scheduled status, or is deleted
- **N** - intentionally no timer action

## Boss write paths

| File:Line | Code snippet (short) | Classification | Notes |
|---|---|---|---|
| `routes/admin.ts:12` | `import { createBossEncounter } ...` | N | Import only. |
| `routes/admin.ts:371` | `prisma.worldEvent.update({ data: { status: 'expired', expiresAt: new Date() } })` | C | Admin event cancellation must also cancel a related active boss encounter timer when the event is a boss. |
| `routes/admin.ts:414` | `prisma.worldEvent.update({ data: { expiresAt: null } })` | N | Boss event is made non-expiring before encounter creation. |
| `routes/admin.ts:416` | `createBossEncounter(event.id, mobTemplateId, ...)` | N | Creates a `waiting` encounter; timer starts when signup moves it to `in_progress`. |
| `services/bossEncounterService.ts:156` | `export async function createBossEncounter(...)` | N | Function definition. Runtime write is the create at line 165. |
| `services/bossEncounterService.ts:165` | `prisma.bossEncounter.create({ status: 'waiting', nextRoundAt })` | N | Waiting boss has a future signup deadline but no resolver timer until first signup starts the encounter. |
| `services/bossEncounterService.ts:242` | `prisma.bossEncounter.update({ data: { status: 'in_progress' } })` | S | First signup starts the encounter; existing `nextRoundAt` becomes a pending due time. |
| `services/bossEncounterService.ts:323` | `prisma.bossEncounter.update({ data: { maxHp, currentHp, scaledAt } })` | N | Rescale-only update; does not affect scheduling fields. |
| `services/bossEncounterService.ts:454` | `prisma.bossEncounter.updateMany({ data: { nextRoundAt, status } })` | S/C | Normal round schedules the next round. Boss defeat should cancel; current code keeps `nextRoundAt` while setting `defeated`, so Task 4 must make the cancel explicit. |
| `services/bossEncounterService.ts:581` | `prisma.bossEncounter.update({ status: 'waiting', nextRoundAt, scaledAt: null })` | C | Raid wipe exits `in_progress`; any active round timer must be cancelled until signup restarts the encounter. |
| `services/bossEncounterService.ts:602` | `prisma.worldEvent.updateMany({ data: { status: 'completed' } })` | N | Boss event completion marker. Encounter timer cancellation is handled by the defeat path. |
| `services/bossEncounterService.ts:646` | `prisma.bossEncounter.update({ data: { rewardsByPlayer } })` | N | Reward payload update only. |
| `services/eventSchedulerService.ts:11` | `import { createBossEncounter, checkAndResolveDueBossRounds } ...` | N | Import only. Task 10 removes fixed scheduler usage but keeps activity-triggered catch-up. |
| `services/eventSchedulerService.ts:237` | `prisma.worldEvent.update({ data: { expiresAt: null } })` | N | Boss event is made non-expiring. |
| `services/eventSchedulerService.ts:244` | `createBossEncounter(event.id, bossMob.id, bossHp)` | N | Creates waiting boss encounter; no timer until signup. |
| `services/explorationOutcomeService.ts:30` | `import { createBossEncounter } ...` | N | Import only. |
| `services/explorationOutcomeService.ts:629` | `createBossEncounter(bossEvent.id, bossMob.id, bossHp)` | N | Player-discovery boss starts in `waiting`; no resolver timer until signup. |
| `services/worldEventService.ts:316` | `prisma.worldEvent.updateMany({ data: { status: 'expired' } })` | N | Stale world-event expiration. Boss events use `expiresAt: null`, so this is not a boss-round timer path. |

## Expedition write paths

| File:Line | Code snippet (short) | Classification | Notes |
|---|---|---|---|
| `routes/admin.ts:661` | `prisma.guildExpedition.updateMany({ status: { in: ['completed', 'failed'] }, data: { completedAt } })` | N | Admin cooldown reset only touches terminal rows. |
| `routes/expedition.ts:13` | `forceStartExpedition` import | N | Import only. |
| `routes/expedition.ts:19` | `abandonExpedition` import | N | Import only. |
| `routes/expedition.ts:209` | `forceStartExpedition(id, req.player!.playerId)` | N | Route delegates; scheduling write is in `expeditionService.ts:323`. |
| `routes/expedition.ts:295` | `abandonExpedition(id, req.player!.playerId)` | N | Route delegates; cancellation write is in `expeditionService.ts:418`. |
| `routes/guild.ts:12` | `disbandGuild` import | N | Import only. |
| `routes/guild.ts:96` | `disbandGuild(req.player!.playerId, req.params.id)` | N | Route delegates; cascade concern is in `guildMembershipService.ts:321`. |
| `services/expeditionRoundService.ts:30` | `import { handleRoomCleared, handleWipe } ...` | N | Import only. |
| `services/expeditionRoundService.ts:249` | `guildExpedition.update({ status: 'in_progress', nextRoundAt })` | S | Recruiting window succeeds and schedules first combat round. |
| `services/expeditionRoundService.ts:266` | `guildExpedition.update({ status: 'failed', completedAt, nextRoundAt: null })` | C | Recruiting window fails; cancel signup timer. |
| `services/expeditionRoundService.ts:309` | `handleWipe(expeditionId)` | S/C | Delegates to wipe handling, which either reschedules signup or fails terminally. |
| `services/expeditionRoundService.ts:369` | `guildExpedition.updateMany({ nextRoundAt })` | S/C | Combat round schedules next round when room continues; clears due time before room-clear/wipe transition. |
| `services/expeditionRoundService.ts:417` | `handleWipe(expeditionId)` | S/C | Delegates to wipe handling. |
| `services/expeditionRoundService.ts:446` | `guildExpedition.update({ data: { nextRoundAt: null } })` | C | Auto-resolve takes ownership of room resolution; cancel existing round timer. |
| `services/expeditionRoundService.ts:459` | `handleWipe(expeditionId)` | S/C | Delegates to wipe handling. |
| `services/expeditionRoundService.ts:545` | `guildExpedition.updateMany({ nextRoundAt: null })` | C | Auto-resolve completion clears active round due time before transition. |
| `services/expeditionRoundService.ts:609` | `handleWipe(expeditionId)` | S/C | Delegates to wipe handling. |
| `services/expeditionService.ts:40` | `export { handleRoomCleared, handleWipe, completeExpedition } ...` | N | Re-export only. |
| `services/expeditionService.ts:150` | `tx.guildExpedition.create({ status: 'recruiting', nextRoundAt })` | S | Launch schedules signup-window resolution. |
| `services/expeditionService.ts:289` | `export async function forceStartExpedition(...)` | N | Function definition. Runtime write is at line 323. |
| `services/expeditionService.ts:323` | `guildExpedition.update({ status: 'in_progress', nextRoundAt })` | S | Force start schedules first combat round. |
| `services/expeditionService.ts:389` | `export async function abandonExpedition(...)` | N | Function definition. Runtime write is at line 418. |
| `services/expeditionService.ts:418` | `guildExpedition.update({ status: 'failed', completedAt, nextRoundAt: null })` | C | Abandon terminally cancels expedition timer. |
| `services/expeditionTransitionService.ts:65` | `completeExpedition(expeditionId)` | C | Last room delegates to terminal completion. |
| `services/expeditionTransitionService.ts:107` | `guildExpedition.update({ currentRoom, roundNumber: 0, nextRoundAt })` | S | Room clear advances to rest/next room and schedules the next combat start. |
| `services/expeditionTransitionService.ts:122` | `export async function handleWipe(...)` | N | Function definition. Runtime writes are below. |
| `services/expeditionTransitionService.ts:137` | `guildExpedition.update({ status: 'failed', completedAt, nextRoundAt: null })` | C | Max attempts reached; terminal failure. |
| `services/expeditionTransitionService.ts:188` | `tx.guildExpedition.update({ status: 'recruiting', nextRoundAt })` | S | Wipe retry resets to signup window and schedules recruiting timeout. |
| `services/expeditionTransitionService.ts:224` | `export async function completeExpedition(...)` | N | Function definition. Runtime write is at line 235. |
| `services/expeditionTransitionService.ts:235` | `guildExpedition.update({ status: 'completed', completedAt, nextRoundAt: null })` | C | Successful expedition completion terminally cancels timer. |

## Guild disband cascade

| File:Line | Code snippet | Classification | Notes |
|---|---|---|---|
| `services/guildMembershipService.ts:308` | `export async function disbandGuild(...)` | N | Function definition. |
| `services/guildMembershipService.ts:321` | `prisma.guild.delete({ where: { id: guildId } })` | C | Must cancel timers for all active/recruiting expeditions owned by the guild before cascade delete removes rows. |

## Mob HP write paths

- `routes/combat/start.ts:43` - imports `persistMobHp`
- `routes/combat/start.ts:44` - imports `checkPersistedMobReencounter`
- `routes/combat/start.ts:193` - `checkPersistedMobReencounter(playerId, zoneId, prefixedMob.id)`
- `routes/combat/start.ts:280` - `persistMobHp(playerId, prefixedMob.id, zoneId, remainingHp, prefixedMob.hp)`
- `services/explorationOutcomeService.ts:28` - imports `persistMobHp`
- `services/explorationOutcomeService.ts:415` - `persistMobHp(playerId, prefixedMob.id, zoneId, remainingHp, prefixedMob.hp)`
- `services/persistedMobService.ts:26` - `persistMobHp(...)`
- `services/persistedMobService.ts:39` - `prisma.persistedMob.update(...)`
- `services/persistedMobService.ts:44` - `prisma.persistedMob.create(...)`
- `services/persistedMobService.ts:50` - `checkPersistedMobReencounter(...)`
- `services/persistedMobService.ts:70` - `prisma.persistedMob.delete(...)`
- `services/persistedMobService.ts:79` - `prisma.persistedMob.deleteMany(...)`
- `services/persistedMobService.ts:86` - `prisma.persistedMob.deleteMany(...)`

## Auth token write paths

- `routes/auth.ts:19` - imports email/password token helpers
- `routes/auth.ts:180` - `prisma.refreshToken.create(...)` in register
- `routes/auth.ts:203` - `createEmailVerificationToken(player.id)` after register
- `routes/auth.ts:251` - `prisma.refreshToken.create(...)` in login
- `routes/auth.ts:312` - `prisma.refreshToken.create(...)` in refresh transaction
- `routes/auth.ts:378` - `createEmailVerificationToken(playerId)` in resend verification
- `routes/auth.ts:399` - `createPasswordResetToken(player.id)` in forgot password
- `services/authService.ts:4` - imports `createEmailVerificationToken`
- `services/authService.ts:76` - `createEmailVerificationToken(playerId)` after email change
- `services/authTokenService.ts:16` - `createEmailVerificationToken(...)`
- `services/authTokenService.ts:23` - `prisma.emailVerificationToken.create(...)`
- `services/authTokenService.ts:46` - `createPasswordResetToken(...)`
- `services/authTokenService.ts:53` - `prisma.passwordResetToken.create(...)`

## Route handler locations

| Endpoint | File:Line |
|---|---|
| `POST /api/v1/auth/register` | `routes/auth.ts:67` |
| `POST /api/v1/auth/login` | `routes/auth.ts:208` |
| `POST /api/v1/auth/refresh` | `routes/auth.ts:274` |
| `GET /api/v1/events` | `routes/worldEvents.ts:21` |

## Known hot-spot callouts from spec review

- `resolveBossRoundInner` - boss defeat (**C**) and boss wipe back to `waiting` (**C**)
- `routes/admin.ts` - boss event admin cancellation (**C** for related encounter)
- `checkAndResolveExpeditionRounds` - recruiting failure (**C**)
- `handleWipe` - max-attempt failure (**C**), wipe-with-retry (**S** at new `nextRoundAt`)
- `completeExpedition` (**C**)
- `abandonExpedition` (**C**)
- `disbandGuild` in `guildMembershipService.ts` (**C** for every owned active/recruiting expedition)
- `forceStartExpedition` (**S** at new combat `nextRoundAt`)
