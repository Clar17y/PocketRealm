# Expedition Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 9 expedition UX/gameplay issues: cooldown UI gating, wipe-to-recruiting reset, buff/debuff visibility, expedition lockout, configurable round timers, heal targeting, potion support, force-start next room, and cooldown rework.

**Architecture:** Changes span all layers — shared constants/types, game-engine raid resolver, API services/routes, Prisma schema, and frontend components. Each task is self-contained and can be committed independently. Tasks are ordered by dependency: schema first, then constants, then engine, then services, then routes, then frontend.

**Tech Stack:** TypeScript, Prisma 6, Express 4, Next.js 16, Vitest

> **CRITICAL — Worktree:** All work MUST be done in the existing expedition worktree at `D:/Code/Adventure/.worktrees/pocketrealm-guild-expeditions` (branch: `guild-expeditions`). Do NOT create a new worktree. Do NOT run `setup-worktree.sh`. The worktree already exists with the expedition feature code, database, and dependencies. Just `cd` into it and start working. All file paths in this plan are relative to this worktree root.

**Design doc:** `docs/plans/2026-03-09-expedition-improvements-design.md`

---

## Task 1: Schema Changes (wipeCount, attemptLogs, healTarget)

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (lines 931-984)
- Create: new migration via `npm run db:migrate`

**Step 1: Add new fields to GuildExpedition model**

In `schema.prisma`, find the `GuildExpedition` model (line 931). Add after `launchedBy` (line 945):

```prisma
  wipeCount              Int      @default(0)
  expeditionAttemptLogs  Json?
```

**Step 2: Add healTargetPlayerId to GuildExpeditionMember model**

In `GuildExpeditionMember` (line 957), add after `targetMobId` (line 975):

```prisma
  healTargetPlayerId  String?
```

**Step 3: Generate migration and apply**

Run:
```bash
cd /d/Code/Adventure/.worktrees/pocketrealm-guild-expeditions
npx prisma migrate dev --name add_expedition_wipe_count_heal_target --schema packages/database/prisma/schema.prisma
```
Expected: Migration created and applied successfully.

**Step 4: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma Client generated successfully.

**Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add wipeCount, attemptLogs, healTargetPlayerId to expedition schema"
```

---

## Task 2: Constants — Round Timers, Cooldown Rework, Max Attempts

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (lines 1350-1393, `EXPEDITION_CONSTANTS`)

**Step 1: Update EXPEDITION_CONSTANTS**

Replace lines 1362, 1368-1369, and 1392 in `EXPEDITION_CONSTANTS`:

```typescript
// Remove: ROUND_INTERVAL_MS: 5 * 60 * 1000,
// Add:
ROUND_INTERVAL_BY_ROOM_TYPE: {
  trash: 2 * 60 * 1000,
  elite: 2 * 60 * 1000,
  mini_boss: 3 * 60 * 1000,
  event: 2 * 60 * 1000,
  final_boss: 3 * 60 * 1000,
} as Record<string, number>,

// Change 24h → 18h:
BETWEEN_EXPEDITION_COOLDOWN_MS: 18 * 60 * 60 * 1000,

// Rename and reduce 5 → 3:
MAX_ATTEMPTS: 3,
// Remove: MAX_WIPES_PER_EXPEDITION: 5,
```

**Step 2: Verify shared package builds**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds with no errors.

**Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: configurable round timers, 18h cooldown, max 3 attempts"
```

---

## Task 3: Shared Types — Update ExpeditionMobInfo, ExpeditionMemberData, RaidRoundInput

**Files:**
- Modify: `packages/shared/src/types/expedition.types.ts`

**Step 1: Add activeEffects to ExpeditionMobInfo**

Find `ExpeditionMobInfo` (used by `ExpeditionData.currentRoomMobs`). Add `activeEffects`:

```typescript
export interface ExpeditionMobInfo {
  id: string;
  name: string;
  prefix: string | null;
  hp: number;
  maxHp: number;
  activeEffects: BossActiveEffect[];
}
```

**Step 2: Add activeEffects and healTargetPlayerId to ExpeditionMemberData**

```typescript
export interface ExpeditionMemberData {
  // ... existing fields ...
  activeEffects: BossActiveEffect[];
  healTargetPlayerId: string | null;
}
```

**Step 3: Add healTargetPlayerId to RaidParticipant**

In `RaidParticipant` interface, add:

```typescript
  healTargetPlayerId: string | null;
```

**Step 4: Add potions to RaidParticipant and results**

In `RaidParticipant`, add:

```typescript
  availablePotions: CombatPotion[];
```

In `RaidParticipantResult`, add:

```typescript
  potionsConsumed: PotionConsumed[];
```

In `RaidRoundResult`, add:

```typescript
  allPotionsConsumed: PotionConsumed[];
```

**Step 5: Add wipeCount and expeditionAttemptLogs to ExpeditionData**

```typescript
export interface ExpeditionData {
  // ... existing fields ...
  wipeCount: number;
  attemptNumber: number; // wipeCount + 1
}
```

**Step 6: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds. Downstream packages may have type errors — that's expected, we fix them in later tasks.

**Step 7: Commit**

```bash
git add packages/shared/src/types/expedition.types.ts
git commit -m "feat: expose activeEffects, healTarget, potions in expedition types"
```

---

## Task 4: Game Engine — Heal Targeting + Potions in Raid Resolver

**Files:**
- Modify: `packages/game-engine/src/combat/combatHelpers.ts` (lines 98-135)
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts` (lines 240-271)
- Modify: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Update resolveSupportiveActions to accept healTargetPlayerId**

In `combatHelpers.ts`, update `CombatParticipantInput` (line 17) to add:

```typescript
  healTargetPlayerId?: string | null;
```

In `resolveSupportiveActions` (line 98), change the `heal_ally` block (lines 122-133):

```typescript
    // heal_ally — use manual target if set, else lowest HP player
    if (def.actionType === 'heal_ally') {
      const manualTarget = p.healTargetPlayerId;
      let targetId: string | null = null;

      // Priority: manual target (if alive) > lowest HP player
      if (manualTarget && alivePlayerIds.has(manualTarget)) {
        targetId = manualTarget;
      } else {
        // Fall back to lowest HP player (excluding self)
        let lowestHp = Infinity;
        for (const ps of pState) {
          if (ps.hp <= 0 || ps.playerId === s.playerId) continue;
          if (ps.hp < lowestHp) {
            lowestHp = ps.hp;
            targetId = ps.playerId;
          }
        }
        // If no other player needs healing, heal self
        if (!targetId) targetId = s.playerId;
      }

      const healAmount = (def.healFlat ?? 0) + Math.floor((def.healPercent ?? 0) * p.maxHp);
      const targetState = pState.find(ps => ps.playerId === targetId);
      const targetParticipant = participants.find(pp => pp.playerId === targetId);
      if (targetState && targetParticipant) {
        const actualHeal = Math.min(healAmount, targetParticipant.maxHp - targetState.hp);
        targetState.hp += actualHeal;
        s.healingDone = actualHeal;
        addHealThreat(threatTable, s.playerId, actualHeal);
      }
    }
```

**Step 2: Add potion handling to raidRoundResolver**

In `raidRoundResolver.ts`, after the supportive phase (after line 271), add potion handling. Import `CombatPotion`, `PotionConsumed`, `COMBAT_ACTION_CONSTANTS` from shared.

In the supportive phase section (Step 5, lines 241-271), add after the existing heal_ally handling:

```typescript
  // --- Step 5b: Potion actions ---
  const allPotionsConsumed: PotionConsumed[] = [];

  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const p = input.participants[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def || def.actionType !== 'use_potion') continue;

    const potionType = def.potionType ?? 'hp';
    const potions = p.availablePotions ?? [];

    // Check potion sickness
    const hasSickness = (p.activeEffects ?? []).some(
      e => e.stat === 'potionSickness',
    );
    if (hasSickness) continue;

    // Find matching potion
    const potionIndex = potions.findIndex(pt => pt.potionType === potionType);
    if (potionIndex === -1) continue;

    const potion = potions[potionIndex];
    let actualRestore = 0;

    if (potionType === 'hp') {
      actualRestore = Math.min(potion.healAmount, p.maxHp - s.hp);
      s.hp += actualRestore;
      s.healingDone = actualRestore;
    } else if (potionType === 'stamina') {
      actualRestore = Math.min(potion.healAmount, p.maxStamina - s.stamina);
      s.stamina += actualRestore;
    } else {
      actualRestore = Math.min(potion.healAmount, p.maxMana - s.mana);
      s.mana += actualRestore;
    }

    // Consume potion
    potions.splice(potionIndex, 1);
    allPotionsConsumed.push({ templateId: potion.templateId, name: potion.name });

    // Apply potion sickness
    participantEffectsToApply.push({
      participantIndex: i,
      effect: {
        name: 'Potion Sickness',
        stat: 'potionSickness',
        modifier: 0,
        roundsRemaining: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      },
    });

    // Log healing
    if (potionType === 'hp' && actualRestore > 0) {
      logHealing.push({
        playerId: s.playerId,
        username: getUsername(s.playerId),
        actionLabel: potion.name,
        amountHealed: actualRestore,
        targetPlayerId: s.playerId,
        targetUsername: getUsername(s.playerId),
      });
    }
  }
```

Add `allPotionsConsumed` to the return `RaidRoundResult`.

Also update `participantEffectsAfter` (lines 435-444) to merge in potion sickness effects before decrementing durations.

**Step 3: Update heal_ally log to use actual target**

In the healing log section (lines 246-271), update `heal_ally` to use the actual resolved target instead of always `preHealAggroHolder`. The `resolveSupportiveActions` function now handles targeting internally — but the log needs to know who was actually healed. Simplest approach: capture the target in the log by tracking who received healing in each iteration.

**Step 4: Write tests for heal targeting**

In `raidRoundResolver.test.ts`, add tests:
- Test heal_ally with manual `healTargetPlayerId` set → heals specified player
- Test heal_ally with no manual target → heals lowest HP player
- Test heal_ally with manual target that's dead → falls back to lowest HP

**Step 5: Write tests for potion handling**

- Test `use_hp_potion` with potions available → heals player, consumes potion
- Test `use_hp_potion` with potion sickness → no heal
- Test `use_hp_potion` with no potions → no action
- Test potion sickness persists across rounds

**Step 6: Run tests**

Run: `npm run test:engine`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add packages/game-engine/src/combat/
git commit -m "feat: add heal targeting and potion support to raid resolver"
```

---

## Task 5: API Service — Cooldown Endpoint

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/routes/expedition.ts`

**Step 1: Add getExpeditionCooldowns function**

In `expeditionService.ts`, add:

```typescript
export async function getExpeditionCooldowns(guildId: string): Promise<{
  weeklyCooldowns: Record<number, string | null>;
  betweenCooldown: string | null;
  hasActiveExpedition: boolean;
}> {
  const weeklyAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  const betweenAgo = new Date(Date.now() - EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS);

  const [activeExp, recentCompleted, recentAny] = await Promise.all([
    prisma.guildExpedition.findFirst({
      where: { guildId, status: { in: ['recruiting', 'in_progress'] } },
    }),
    // Weekly: only completed expeditions trigger tier lockout
    prisma.guildExpedition.findMany({
      where: {
        guildId,
        status: 'completed',
        completedAt: { gt: weeklyAgo },
      },
      select: { tier: true, completedAt: true },
    }),
    // Between: both completed and failed trigger 18h cooldown
    prisma.guildExpedition.findFirst({
      where: {
        guildId,
        status: { in: ['completed', 'failed'] },
        completedAt: { gt: betweenAgo },
      },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
    }),
  ]);

  const weeklyCooldowns: Record<number, string | null> = { 1: null, 2: null, 3: null };
  for (const exp of recentCompleted) {
    if (exp.completedAt) {
      const expiry = new Date(exp.completedAt.getTime() + EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
      if (!weeklyCooldowns[exp.tier] || expiry > new Date(weeklyCooldowns[exp.tier]!)) {
        weeklyCooldowns[exp.tier] = expiry.toISOString();
      }
    }
  }

  const betweenCooldown = recentAny?.completedAt
    ? new Date(recentAny.completedAt.getTime() + EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS).toISOString()
    : null;

  return {
    weeklyCooldowns,
    betweenCooldown,
    hasActiveExpedition: !!activeExp,
  };
}
```

**Step 2: Add route handler**

In `expedition.ts`, add before the existing `GET /active` handler:

```typescript
router.get('/cooldowns', authMiddleware, async (req, res) => {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId: req.player!.id },
    select: { guildId: true },
  });
  if (!membership) {
    return res.json({ data: { weeklyCooldowns: {}, betweenCooldown: null, hasActiveExpedition: false } });
  }
  const cooldowns = await getExpeditionCooldowns(membership.guildId);
  res.json({ data: cooldowns });
});
```

**Step 3: Update launchExpedition — weekly cooldown only on completed**

In `expeditionService.ts` `launchExpedition()` (line 174-176), change the weekly cooldown query:

```typescript
    // Weekly cooldown: only completed expeditions count
    prisma.guildExpedition.findFirst({
      where: { guildId, tier, status: 'completed', completedAt: { gt: weeklyAgo } },
    }),
```

(Change `status: { in: ['completed', 'failed'] }` to just `status: 'completed'`)

**Step 4: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/routes/expedition.ts
git commit -m "feat: add cooldown endpoint, weekly cooldown only on completion"
```

---

## Task 6: API Service — Wipe → Reset to Recruiting

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts` (handleWipe function, lines 865-961)

**Step 1: Rewrite handleWipe**

Replace the `handleWipe` function with:

```typescript
export async function handleWipe(expeditionId: string): Promise<void> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: { members: { include: { player: { select: { username: true } } } } },
  });
  if (!expedition) return;

  const newWipeCount = (expedition.wipeCount ?? 0) + 1;

  // Archive current attempt logs
  const currentLogs = (Array.isArray(expedition.roundSummaries)
    ? expedition.roundSummaries
    : []) as unknown as ExpeditionRoundLog[];
  const existingAttempts = (Array.isArray(expedition.expeditionAttemptLogs)
    ? expedition.expeditionAttemptLogs
    : []) as unknown as Array<unknown>;
  const attemptLog = {
    attempt: newWipeCount,
    roomReached: expedition.currentRoom,
    participants: expedition.members.map(m => ({
      playerId: m.playerId,
      username: m.player?.username,
      totalDamage: Number(m.totalDamage),
      totalHealing: Number(m.totalHealing),
    })),
    rounds: currentLogs,
    wipedAt: new Date().toISOString(),
  };
  const updatedAttempts = [...existingAttempts, attemptLog];

  if (newWipeCount >= EXPEDITION_CONSTANTS.MAX_ATTEMPTS) {
    // Auto-abandon: failed status, 18h cooldown (no weekly)
    await prisma.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        nextRoundAt: null,
        wipeCount: newWipeCount,
        roundSummaries: [],
        expeditionAttemptLogs: JSON.parse(JSON.stringify(updatedAttempts)),
      },
    });
    await addGuildLog(
      expedition.guildId,
      'expedition_failed',
      `Expedition abandoned after ${newWipeCount} failed attempts`,
      { expeditionId, wipeCount: newWipeCount },
    );
    return;
  }

  // Reset to recruiting: clear members, reset rooms, fresh signup window
  const rooms = generateExpeditionRooms(
    expedition.tier - 1,
    // Re-fetch mob pool for fresh room generation
    await fetchMobPool(expedition.tier),
  );

  await prisma.$transaction(async (tx) => {
    // Delete all member records
    await tx.guildExpeditionMember.deleteMany({ where: { expeditionId } });

    // Reset expedition to recruiting
    await tx.guildExpedition.update({
      where: { id: expeditionId },
      data: {
        status: 'recruiting',
        currentRoom: 0,
        roundNumber: 0,
        wipeCount: newWipeCount,
        roomDefinitions: JSON.parse(JSON.stringify(rooms)),
        roomStartSnapshot: null,
        roundSummaries: [],
        expeditionAttemptLogs: JSON.parse(JSON.stringify(updatedAttempts)),
        totalRooms: rooms.length,
        nextRoundAt: new Date(Date.now() + EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS),
      },
    });
  });

  await addGuildLog(
    expedition.guildId,
    'expedition_wipe',
    `Expedition wiped in room ${expedition.currentRoom + 1} (attempt ${newWipeCount}/${EXPEDITION_CONSTANTS.MAX_ATTEMPTS}). Recruiting new party.`,
    { expeditionId, roomIndex: expedition.currentRoom, attempt: newWipeCount },
  );
}
```

**Step 2: Extract fetchMobPool helper**

Extract the mob template query from `launchExpedition` (lines 199-241) into a reusable `fetchMobPool(tier)` function so `handleWipe` can regenerate rooms.

**Step 3: Add abandon endpoint**

In `expeditionService.ts`, add:

```typescript
export async function abandonExpedition(
  expeditionId: string,
  playerId: string,
): Promise<void> {
  const [expedition, membership] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildMember.findUnique({ where: { playerId }, select: { guildId: true, role: true } }),
  ]);

  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }
  if (expedition.status !== 'recruiting' && expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }

  // Archive logs
  const currentLogs = Array.isArray(expedition.roundSummaries) ? expedition.roundSummaries : [];
  const existingAttempts = Array.isArray(expedition.expeditionAttemptLogs)
    ? expedition.expeditionAttemptLogs : [];
  const updatedAttempts = currentLogs.length > 0
    ? [...existingAttempts, { attempt: (expedition.wipeCount ?? 0) + 1, rounds: currentLogs, abandonedAt: new Date().toISOString() }]
    : existingAttempts;

  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      status: 'failed',
      completedAt: new Date(),
      nextRoundAt: null,
      roundSummaries: [],
      expeditionAttemptLogs: JSON.parse(JSON.stringify(updatedAttempts)),
    },
  });

  await addGuildLog(
    expedition.guildId,
    'expedition_abandoned',
    `Expedition manually abandoned by officer`,
    { expeditionId },
  );
}
```

In `expedition.ts` routes, add:

```typescript
router.post('/:id/abandon', authMiddleware, async (req, res) => {
  await abandonExpedition(req.params.id, req.player!.id);
  res.json({ data: { success: true } });
});
```

**Step 4: Update toExpeditionData to include wipeCount/attemptNumber**

In `toExpeditionData` (line 61), add:

```typescript
    wipeCount: exp.wipeCount ?? 0,
    attemptNumber: (exp.wipeCount ?? 0) + 1,
```

**Step 5: Write tests for handleWipe**

- Test wipe count < 3 → status becomes 'recruiting', members deleted, rooms regenerated
- Test wipe count reaches 3 → status becomes 'failed', completedAt set
- Test attempt logs are archived correctly

**Step 6: Run tests**

Run: `npm run test:api`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/routes/expedition.ts
git commit -m "feat: wipe resets to recruiting, max 3 attempts, leader abandon"
```

---

## Task 7: API Service — Expedition Lockout

**Files:**
- Create: `apps/api/src/services/expeditionLockoutService.ts`
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Create lockout service**

```typescript
// apps/api/src/services/expeditionLockoutService.ts
import { prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';

export async function checkExpeditionLockout(playerId: string): Promise<void> {
  const activeMembership = await prisma.guildExpeditionMember.findFirst({
    where: {
      playerId,
      expedition: { status: 'in_progress' },
    },
    select: { expeditionId: true },
  });

  if (activeMembership) {
    throw new AppError(
      400,
      'Cannot perform this action while on an active expedition',
      'EXPEDITION_LOCKED',
    );
  }
}
```

**Step 2: Add lockout checks to combat route**

In `apps/api/src/routes/combat/start.ts`, at the top of the combat start handler (after auth validation), add:

```typescript
import { checkExpeditionLockout } from '../../services/expeditionLockoutService';
// ... inside handler:
await checkExpeditionLockout(playerId);
```

**Step 3: Add lockout checks to exploration route**

In `apps/api/src/routes/exploration/start.ts`, at the top of the exploration start handler, add:

```typescript
await checkExpeditionLockout(playerId);
```

**Step 4: Add lockout checks to zone travel**

In `apps/api/src/routes/zones.ts`, in the POST `/travel` handler (around line 194 where `isRecovering` is checked), add:

```typescript
await checkExpeditionLockout(playerId);
```

**Step 5: Write tests**

Test in `expeditionLockoutService.test.ts`:
- Player in `in_progress` expedition → throws EXPEDITION_LOCKED
- Player in `recruiting` expedition → no error (not locked)
- Player not in any expedition → no error

**Step 6: Commit**

```bash
git add apps/api/src/services/expeditionLockoutService.ts apps/api/src/routes/combat/start.ts apps/api/src/routes/exploration/start.ts apps/api/src/routes/zones.ts
git commit -m "feat: block combat/exploration/travel during active expedition"
```

---

## Task 8: API Service — Round Timer by Room Type

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`

**Step 1: Replace ROUND_INTERVAL_MS references**

Find all uses of `EXPEDITION_CONSTANTS.ROUND_INTERVAL_MS` in `expeditionService.ts`. Replace with a helper:

```typescript
function getRoundInterval(rooms: ExpeditionRoomDefinition[], currentRoom: number): number {
  const roomType = rooms[currentRoom]?.roomType ?? 'trash';
  return EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE[roomType]
    ?? EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE.trash;
}
```

Update these locations:
- `forceStartExpedition` (line 422): `getRoundInterval(rooms, 0)`
- `checkAndResolveExpeditionRounds` recruiting→in_progress transition (line 576): `getRoundInterval(rooms, 0)`
- `resolveExpeditionRound` next round scheduling (line 765): `getRoundInterval(rooms, expedition.currentRoom)`

**Step 2: Update MAX_WIPES_PER_EXPEDITION → MAX_ATTEMPTS**

Find and replace `EXPEDITION_CONSTANTS.MAX_WIPES_PER_EXPEDITION` with `EXPEDITION_CONSTANTS.MAX_ATTEMPTS` in `handleWipe`.

**Step 3: Build API to verify**

Run: `npm run build:api`
Expected: No type errors.

**Step 4: Commit**

```bash
git add apps/api/src/services/expeditionService.ts
git commit -m "feat: room-type-based round timers, rename MAX_ATTEMPTS"
```

---

## Task 9: API Service — Potion Support in Round Resolution

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts` (buildRaidParticipant, resolveExpeditionRound)

**Step 1: Add potion pool to buildRaidParticipant**

In `buildRaidParticipant` (line 483), after getting the combat prep, add potion pool fetching:

```typescript
import { buildPotionPool, templateHasPotionActions, deductConsumedPotions } from './potionService';

// Inside buildRaidParticipant, after getting prep:
const potionPool = templateHasPotionActions(prep.playerTemplate)
  ? await buildPotionPool(member.playerId, maxHp)
  : [];
```

Add `availablePotions: potionPool` to the returned `RaidParticipant`.

**Step 2: Handle consumed potions after round resolution**

In `resolveExpeditionRound` (line 627), after calling `resolveRaidRound(input)` and updating member records, add:

```typescript
// Deduct consumed potions from player inventories
if (result.allPotionsConsumed.length > 0) {
  // Group by player
  for (const pr of result.participantResults) {
    if (pr.potionsConsumed.length > 0) {
      await deductConsumedPotions(pr.playerId, pr.potionsConsumed);
    }
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/services/expeditionService.ts
git commit -m "feat: wire potion pool into raid round resolution"
```

---

## Task 10: API Service — Heal Target Endpoint + Data Exposure

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`
- Modify: `apps/api/src/routes/expedition.ts`

**Step 1: Add setHealTarget function**

In `expeditionService.ts`, add (similar pattern to `setTargetMob`):

```typescript
export async function setHealTarget(
  expeditionId: string,
  playerId: string,
  healTargetPlayerId: string | null,
): Promise<void> {
  const [expedition, member] = await Promise.all([
    prisma.guildExpedition.findUnique({ where: { id: expeditionId } }),
    prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId } },
    }),
  ]);

  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') throw new AppError(400, 'Expedition is not in progress', 'NOT_IN_PROGRESS');
  if (!member) throw new AppError(400, 'Not a member of this expedition', 'NOT_A_MEMBER');
  if (member.isKnockedOut) throw new AppError(400, 'Cannot set target while knocked out', 'KNOCKED_OUT');

  // Validate target is a member and alive
  if (healTargetPlayerId !== null) {
    const target = await prisma.guildExpeditionMember.findUnique({
      where: { expeditionId_playerId: { expeditionId, playerId: healTargetPlayerId } },
    });
    if (!target) throw new AppError(400, 'Target is not a member', 'INVALID_TARGET');
    if (target.isKnockedOut) throw new AppError(400, 'Target is knocked out', 'TARGET_KNOCKED_OUT');
  }

  await prisma.guildExpeditionMember.update({
    where: { expeditionId_playerId: { expeditionId, playerId } },
    data: { healTargetPlayerId },
  });
}
```

**Step 2: Add route**

```typescript
router.patch('/:id/heal-target', authMiddleware, async (req, res) => {
  const { healTargetPlayerId } = req.body;
  await setHealTarget(req.params.id, req.player!.id, healTargetPlayerId ?? null);
  res.json({ data: { success: true } });
});
```

**Step 3: Update toExpeditionMemberData to include new fields**

In `toExpeditionMemberData` (line 117), add:

```typescript
    activeEffects: (Array.isArray(m.activeEffects) ? m.activeEffects : []) as BossActiveEffect[],
    healTargetPlayerId: m.healTargetPlayerId ?? null,
```

**Step 4: Update toExpeditionData to include activeEffects on mobs**

In `toExpeditionData` (line 87), change `currentRoomMobs` mapping:

```typescript
    currentRoomMobs: aliveMobs.map(m => ({
      id: m.id,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: m.activeEffects ?? [],
    })),
```

**Step 5: Wire healTargetPlayerId into buildRaidParticipant**

In `buildRaidParticipant`, pass `member.healTargetPlayerId` through to the `RaidParticipant`:

```typescript
    healTargetPlayerId: member.healTargetPlayerId ?? null,
```

**Step 6: Add API client function**

In `apps/web/src/lib/api/expedition.ts`, add:

```typescript
export async function setExpeditionHealTarget(id: string, healTargetPlayerId: string | null) {
  return fetchApi<{ success: boolean }>(
    `/api/v1/expedition/${id}/heal-target`,
    { method: 'PATCH', body: JSON.stringify({ healTargetPlayerId }) },
  );
}
```

**Step 7: Commit**

```bash
git add apps/api/src/services/expeditionService.ts apps/api/src/routes/expedition.ts apps/web/src/lib/api/expedition.ts
git commit -m "feat: heal target endpoint, expose activeEffects and healTarget in data"
```

---

## Task 11: Frontend — Cooldown UI on Launch Buttons

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (IdleView, lines 341-406)
- Modify: `apps/web/src/lib/api/expedition.ts`

**Step 1: Add cooldown API client**

In `apps/web/src/lib/api/expedition.ts`, add:

```typescript
export async function getExpeditionCooldowns() {
  return fetchApi<{
    weeklyCooldowns: Record<number, string | null>;
    betweenCooldown: string | null;
    hasActiveExpedition: boolean;
  }>('/api/v1/expedition/cooldowns');
}
```

**Step 2: Fetch cooldowns in IdleView**

In `GuildExpeditionsTab.tsx`, update `IdleView` to fetch cooldowns on mount and display them on each tier's launch button.

For each tier button, check:
1. `weeklyCooldowns[tier]` → if set and in future, disable + show "Weekly: Xd Xh"
2. `betweenCooldown` → if set and in future, disable + show "Cooldown: Xh Xm"
3. `hasActiveExpedition` → disable + show "Expedition already active"

Use the existing `Countdown` component or `formatTimeRemaining` for the remaining time display.

**Step 3: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/lib/api/expedition.ts
git commit -m "feat: cooldown-aware launch buttons with remaining time display"
```

---

## Task 12: Frontend — Buff/Debuff Badges on Mobs and Players

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

**Step 1: Create EffectBadge component**

Add inline in `GuildExpeditionsTab.tsx`:

```tsx
function EffectBadge({ name, roundsRemaining, isDebuff }: { name: string; roundsRemaining: number; isDebuff: boolean }) {
  const color = isDebuff ? 'var(--rpg-red)' : 'var(--rpg-green-light)';
  return (
    <span
      className="text-[8px] px-1 py-0 rounded"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {name} ({roundsRemaining})
    </span>
  );
}
```

**Step 2: Add effect badges to mob list**

In the `InProgressView` mob rendering (around line 626), after the `HpBar`, add:

```tsx
{mob.activeEffects?.length > 0 && (
  <div className="flex flex-wrap gap-0.5 mt-0.5">
    {mob.activeEffects.map((eff, idx) => (
      <EffectBadge key={idx} name={eff.name} roundsRemaining={eff.roundsRemaining} isDebuff={true} />
    ))}
  </div>
)}
```

**Step 3: Add effect badges to player list**

In `MemberList` (around line 1020), after the KO badge, add effect badges:

```tsx
{m.activeEffects?.length > 0 && (
  <div className="flex flex-wrap gap-0.5">
    {m.activeEffects.map((eff, idx) => {
      const isDebuff = eff.stat === 'potionSickness' || (eff.modifier ?? 0) < 0;
      return <EffectBadge key={idx} name={eff.name} roundsRemaining={eff.roundsRemaining} isDebuff={isDebuff} />;
    })}
  </div>
)}
```

**Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "feat: show buff/debuff/DoT badges on mobs and players"
```

---

## Task 13: Frontend — Heal Targeting UI

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

**Step 1: Add heal target state and handler**

In `GuildExpeditionsTab`, add a `handleSetHealTarget` handler (same pattern as `handleSetTarget`):

```tsx
const handleSetHealTarget = async (healTargetPlayerId: string | null) => {
  if (!expedition) return;
  setError(null);
  try {
    const res = await setExpeditionHealTarget(expedition.id, healTargetPlayerId);
    if (res.error) { setError(res.error.message); return; }
    void loadExpedition();
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Failed to set heal target');
  }
};
```

**Step 2: Make player list clickable for heal targeting**

In `MemberList`, when `showResources` is true and the player is not knocked out, make each member row clickable. Show a green border and "YOUR HEAL TARGET" badge on the selected target. Add a "Clear Heal Target" link similar to "Clear Target" for mobs.

The current player's `healTargetPlayerId` comes from `myMember.healTargetPlayerId`.

**Step 3: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "feat: clickable player list for heal targeting"
```

---

## Task 14: Frontend — Expedition Lockout Banners

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (or wherever screens check lockout)
- Modify: `apps/web/src/lib/api/expedition.ts`

**Step 1: Add lockout check to API client**

The lockout is enforced server-side (Task 7). The frontend needs to handle the `EXPEDITION_LOCKED` error code gracefully.

In screens that can trigger locked actions (CombatScreen, exploration, zone travel), catch the `EXPEDITION_LOCKED` error and show: "You are on an active expedition. Return to your guild to continue."

Alternatively, the existing `getActiveExpedition` response can be used — if the player is a member of an in_progress expedition, show a banner on blocked screens.

**Step 2: Add banner component**

```tsx
function ExpeditionLockoutBanner() {
  return (
    <div className="p-3 rounded border border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10 text-center">
      <p className="text-xs text-[var(--rpg-gold)] font-bold">On Expedition</p>
      <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
        You are currently on a guild expedition. Combat, exploration, and travel are unavailable until the expedition ends.
      </p>
    </div>
  );
}
```

This banner should be shown in the relevant screen components when the player has an active expedition membership. The simplest approach: check `player.activeExpeditionId` (or equivalent) from the game controller state.

**Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "feat: expedition lockout banners on combat/exploration/zone screens"
```

---

## Task 15: Frontend — Wipe Reset UX + Abandon Button + Attempt Counter

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

**Step 1: Show attempt counter**

In `InProgressView` and `RecruitingView`, show: "Attempt 2/3" using `expedition.attemptNumber` and `EXPEDITION_CONSTANTS.MAX_ATTEMPTS`.

**Step 2: Add abandon button**

In `InProgressView` and `RecruitingView`, for officer+, add an "Abandon Expedition" button (danger variant) with confirmation dialog.

Add API client:
```typescript
export async function abandonExpedition(id: string) {
  return fetchApi<{ success: boolean }>(
    `/api/v1/expedition/${id}/abandon`,
    { method: 'POST' },
  );
}
```

**Step 3: Show attempt history in FailedView**

If `expedition.expeditionAttemptLogs` has entries, render a collapsible section showing each attempt's room reached and participants.

**Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx apps/web/src/lib/api/expedition.ts
git commit -m "feat: attempt counter, abandon button, attempt history in failed view"
```

---

## Task 16: Build, Typecheck, Test

**Step 1: Build all packages**

Run: `npm run build`
Expected: No errors.

**Step 2: Typecheck**

Run: `npm run typecheck`
Expected: No errors (except pre-existing `page.tsx:333` issue).

**Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass.

**Step 4: Fix any issues found**

If any tests fail or type errors exist, fix them before proceeding.

**Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve type errors and test failures from expedition improvements"
```
