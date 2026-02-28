# PvP Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `runCombat()` with `runTemplateCombat()` in PvP so both players fight using combat templates with stamina/mana resources. Add template-aware scouting with scout notifications and enriched combat logs.

**Architecture:** Modifies `pvpService.ts` to build `TemplateCombatant` objects for both attacker and defender (ghost at max resources), calls `runTemplateCombat()`, and persists attacker's post-combat resource state. Adds `PvpScoutLog` model for scout notifications. Extends scout response with template category breakdown and talent investment.

**Tech Stack:** Prisma (schema + migration), Express routes with Zod, vitest with mocked Prisma, game-engine pure functions (templateCombatEngine, resource calculators).

**Design Doc:** `docs/plans/2026-02-28-pvp-rework-design.md`

---

## Task 1: Database Schema — PvpScoutLog Model

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add PvpScoutLog model**

Add at the end of the schema (after `SkillPointAllocation`):

```prisma
// =============================================================================
// PVP SCOUT LOG
// =============================================================================

model PvpScoutLog {
  id        String   @id @default(uuid())
  scouterId String   @map("scouter_id")
  targetId  String   @map("target_id")
  isRead    Boolean  @default(false) @map("is_read")
  createdAt DateTime @default(now()) @map("created_at")

  scouter Player @relation("PvpScouter", fields: [scouterId], references: [id], onDelete: Cascade)
  target  Player @relation("PvpScoutTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@index([targetId, isRead])
  @@map("pvp_scout_logs")
}
```

**Step 2: Add relations to Player model**

In `packages/database/prisma/schema.prisma`, add to the Player model relations (before `@@map("players")`):

```prisma
  pvpScoutsSent     PvpScoutLog[] @relation("PvpScouter")
  pvpScoutsReceived PvpScoutLog[] @relation("PvpScoutTarget")
```

**Step 3: Run migration**

Run: `cd /d/Code/Adventure/.worktrees/adventure-combat-rework && npx prisma migrate dev --name pvp_scout_log --schema packages/database/prisma/schema.prisma`

**Step 4: Generate Prisma client and build**

Run: `npm run db:generate && npm run build --workspace=packages/database`

**Step 5: Add mock model**

In `apps/api/src/__mocks__/database.ts`, add to the `prisma` object:

```typescript
  pvpScoutLog: mockModel(),
```

**Step 6: Commit**

```bash
git add packages/database/prisma/ apps/api/src/__mocks__/database.ts
git commit -m "feat(db): add PvpScoutLog model for scout notifications"
```

---

## Task 2: Replace runCombat with runTemplateCombat in PvP Challenge

**Files:**
- Modify: `apps/api/src/services/pvpService.ts`

**Step 1: Update imports**

Replace line 2:
```typescript
import { buildPlayerCombatStats, calculateFleeResult, calculateMaxHp, runCombat } from '@adventure/game-engine';
```

With:
```typescript
import {
  buildPlayerCombatStats, calculateFleeResult, calculateMaxHp,
  runTemplateCombat, calculateMaxStamina, calculateStaminaRegenPerRound,
  calculateMaxMana, calculateManaRegenPerRound,
} from '@adventure/game-engine';
import type { TemplateCombatant, TemplateCombatResult } from '@adventure/game-engine';
```

Replace line 3 — remove `Combatant` and `CombatResult` types since they're no longer needed:
```typescript
import { PVP_CONSTANTS, ACHIEVEMENTS_BY_ID, BASE_ACTION_DEFINITIONS, type SkillType } from '@adventure/shared';
```

Add new service imports after line 12:
```typescript
import { getActiveTemplate } from './combatTemplateService';
import { getResourceState, setAllResources } from './resourceService';
```

**Step 2: Rewrite combatant building in `challenge()` function**

Replace the combatant building section (lines 289-332) with:

```typescript
  // Build attacker combatant
  const attackStyle = await getAttackStyleFromEquipment(attackerId);
  const attackerAttributes = normalizePlayerAttributes(attacker.attributes);
  const attackerEquipStats = await getEquipmentStats(attackerId);
  const attackerSkillLevel = await getSkillLevel(attackerId, attackStyle);
  const attackerMaxHp = calculateMaxHp({
    vitalityLevel: attackerAttributes.vitality,
    equipmentHealthBonus: attackerEquipStats.health,
  });
  const attackerStats = buildPlayerCombatStats(
    hpState.currentHp,
    attackerMaxHp,
    { attackStyle, skillLevel: attackerSkillLevel, attributes: attackerAttributes },
    attackerEquipStats,
  );

  // Attacker template + resources
  const attackerTemplate = await getActiveTemplate(attackerId);
  const attackerResources = await getResourceState(attackerId);

  // Fetch attacker skill levels for stamina/mana calculations
  const [attackerMeleeLevel, attackerRangedLevel, attackerEvasionLevel, attackerMagicLevel] = await Promise.all([
    getSkillLevel(attackerId, 'melee'),
    getSkillLevel(attackerId, 'ranged'),
    getSkillLevel(attackerId, 'evasion' as SkillType),
    getSkillLevel(attackerId, 'magic'),
  ]);

  const attackerCombatant: TemplateCombatant = {
    id: attackerId,
    name: attackerUsername,
    stats: attackerStats,
    template: attackerTemplate,
    stamina: attackerResources.stamina.current,
    maxStamina: attackerResources.stamina.max,
    staminaRegenPerRound: calculateStaminaRegenPerRound(attackerMeleeLevel, attackerRangedLevel, attackerEvasionLevel),
    mana: attackerResources.mana.current,
    maxMana: attackerResources.mana.max,
    manaRegenPerRound: calculateManaRegenPerRound(attackerMagicLevel),
    actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
  };

  // Build defender combatant (ghost — max everything)
  const defenderAttributes = normalizePlayerAttributes(target.attributes);
  const defenderEquipStats = await getEquipmentStats(targetId);
  const defenderStyle = await getAttackStyleFromEquipment(targetId);
  const defenderSkillLevel = await getSkillLevel(targetId, defenderStyle);
  const defenderMaxHp = calculateMaxHp({
    vitalityLevel: defenderAttributes.vitality,
    equipmentHealthBonus: defenderEquipStats.health,
  });
  const defenderStats = buildPlayerCombatStats(
    defenderMaxHp,
    defenderMaxHp,
    { attackStyle: defenderStyle, skillLevel: defenderSkillLevel, attributes: defenderAttributes },
    defenderEquipStats,
  );

  // Defender template + max resources
  const defenderTemplate = await getActiveTemplate(targetId);

  const [defenderMeleeLevel, defenderRangedLevel, defenderEvasionLevel, defenderMagicLevel] = await Promise.all([
    getSkillLevel(targetId, 'melee'),
    getSkillLevel(targetId, 'ranged'),
    getSkillLevel(targetId, 'evasion' as SkillType),
    getSkillLevel(targetId, 'magic'),
  ]);

  const defenderMaxStamina = calculateMaxStamina({
    meleeLevel: defenderMeleeLevel,
    rangedLevel: defenderRangedLevel,
    evasionLevel: defenderEvasionLevel,
    equipmentStaminaBonus: 0,
  });
  const defenderMaxMana = calculateMaxMana({
    magicLevel: defenderMagicLevel,
    equipmentManaBonus: 0,
  });

  const defenderCombatant: TemplateCombatant = {
    id: targetId,
    name: target.username,
    stats: defenderStats,
    template: defenderTemplate,
    stamina: defenderMaxStamina,
    maxStamina: defenderMaxStamina,
    staminaRegenPerRound: calculateStaminaRegenPerRound(defenderMeleeLevel, defenderRangedLevel, defenderEvasionLevel),
    mana: defenderMaxMana,
    maxMana: defenderMaxMana,
    manaRegenPerRound: calculateManaRegenPerRound(defenderMagicLevel),
    actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
  };

  const combatResult = runTemplateCombat(attackerCombatant, defenderCombatant);
```

**Step 3: Update post-combat HP persistence to use setAllResources**

Replace lines 447-468 (the HP persistence block after durability):

```typescript
  // Persist attacker resources after combat
  let attackerKnockedOut = false;
  let fleeOutcome: string | null = null;
  if (combatResult.combatantAHpRemaining <= 0) {
    await setAllResources(
      attackerId,
      combatResult.combatantAHpRemaining,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
    const fleeResult = calculateFleeResult({
      evasionLevel: attackerAttributes.evasion,
      mobLevel: target.characterLevel,
      maxHp: attackerMaxHp,
      currentGold: 0,
    });
    fleeOutcome = fleeResult.outcome;
    if (fleeResult.outcome === 'knockout') {
      await enterRecoveringState(attackerId, attackerMaxHp);
      attackerKnockedOut = true;
      await trackAchievements(attackerId, { totalDeaths: 1 });
    } else {
      await setHp(attackerId, fleeResult.remainingHp);
    }
  } else {
    await setAllResources(
      attackerId,
      combatResult.combatantAHpRemaining,
      combatResult.combatantAStaminaRemaining,
      combatResult.combatantAManaRemaining,
    );
  }
```

**Step 4: Build and typecheck**

Run: `npm run build:api && npm run typecheck`

**Step 5: Commit**

```bash
git add apps/api/src/services/pvpService.ts
git commit -m "feat(api): replace runCombat with runTemplateCombat in PvP challenge"
```

---

## Task 3: Scout Rework — Template Info + Notifications

**Files:**
- Modify: `apps/api/src/services/pvpService.ts`

**Step 1: Add imports for template and skill point services**

Add to the imports section (if not already present from Task 2):
```typescript
import { getActiveTemplate } from './combatTemplateService';
import { getSkillPoints } from './skillPointService';
import { calculateMaxStamina, calculateMaxMana } from '@adventure/game-engine';
import { BASE_ACTION_DEFINITIONS, TALENT_TREE_DEFINITIONS, type ActionCategory } from '@adventure/shared';
```

**Step 2: Add helper to compute template category breakdown**

Add after the `calculatePowerRating` helper:

```typescript
function computeTemplateCategoryBreakdown(
  template: Array<{ actionId: string }>,
  actionDefs: Record<string, { category: ActionCategory }>,
): { offensiveCount: number; defensiveCount: number; supportiveCount: number } {
  let offensiveCount = 0;
  let defensiveCount = 0;
  let supportiveCount = 0;
  for (const action of template) {
    const def = actionDefs[action.actionId];
    if (!def) continue;
    switch (def.category) {
      case 'offensive': offensiveCount++; break;
      case 'defensive': defensiveCount++; break;
      case 'supportive': supportiveCount++; break;
    }
  }
  return { offensiveCount, defensiveCount, supportiveCount };
}

function computeTalentInvestment(
  allocations: Record<string, number>,
): Record<string, number> {
  const investment: Record<string, number> = { melee: 0, ranged: 0, magic: 0, general: 0 };
  for (const [nodeId] of Object.entries(allocations)) {
    for (const [tree, nodes] of Object.entries(TALENT_TREE_DEFINITIONS)) {
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        investment[tree] = Math.max(investment[tree], node.tier);
      }
    }
  }
  return investment;
}
```

**Step 3: Update `scoutOpponent` return value**

After the existing scout logic (turns spent, equipment fetched), add template info computation before the return statement:

```typescript
  // Template info
  const targetTemplate = await getActiveTemplate(targetId);
  const categoryBreakdown = computeTemplateCategoryBreakdown(
    targetTemplate,
    BASE_ACTION_DEFINITIONS as Record<string, { category: ActionCategory }>,
  );

  // Resource profile
  const targetSkills = await prisma.playerSkill.findMany({
    where: { playerId: targetId },
    select: { skillType: true, level: true },
  });
  const skillMap: Record<string, number> = {};
  for (const s of targetSkills) skillMap[s.skillType] = s.level;

  const maxStamina = calculateMaxStamina({
    meleeLevel: skillMap['melee'] ?? 1,
    rangedLevel: skillMap['ranged'] ?? 1,
    evasionLevel: skillMap['evasion'] ?? 1,
    equipmentStaminaBonus: 0,
  });
  const maxMana = calculateMaxMana({
    magicLevel: skillMap['magic'] ?? 1,
    equipmentManaBonus: 0,
  });

  // Talent investment
  const skillPoints = await getSkillPoints(targetId);
  const talentInvestment = computeTalentInvestment(skillPoints.allocations);

  // Create scout notification
  await prisma.pvpScoutLog.create({
    data: { scouterId: attackerId, targetId },
  });

  return {
    combatLevel: target.characterLevel,
    attackStyle,
    armorClass,
    powerRating: targetPower,
    myPowerRating: myPower,
    templateInfo: {
      templateLength: targetTemplate.length,
      ...categoryBreakdown,
      maxStamina,
      maxMana,
      talentInvestment,
    },
  };
```

**Step 4: Build and typecheck**

Run: `npm run build:api && npm run typecheck`

**Step 5: Commit**

```bash
git add apps/api/src/services/pvpService.ts
git commit -m "feat(api): add template info to scout response and scout notifications"
```

---

## Task 4: Scout Notification Routes

**Files:**
- Modify: `apps/api/src/services/pvpService.ts`
- Modify: `apps/api/src/routes/pvp.ts`

**Step 1: Add scout notification functions to pvpService**

Add to `pvpService.ts`:

```typescript
// ---------------------------------------------------------------------------
// Scout Notifications
// ---------------------------------------------------------------------------

export async function getScoutNotificationCount(playerId: string): Promise<number> {
  return prisma.pvpScoutLog.count({
    where: { targetId: playerId, isRead: false },
  });
}

export async function getScoutNotifications(playerId: string) {
  const logs = await prisma.pvpScoutLog.findMany({
    where: { targetId: playerId, isRead: false },
    include: { scouter: { select: { username: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return logs.map(l => ({
    id: l.id,
    scouterName: l.scouter.username,
    createdAt: l.createdAt.toISOString(),
  }));
}

export async function markScoutNotificationsRead(playerId: string, ids?: string[]): Promise<void> {
  if (ids && ids.length > 0) {
    await prisma.pvpScoutLog.updateMany({
      where: { id: { in: ids }, targetId: playerId },
      data: { isRead: true },
    });
  } else {
    await prisma.pvpScoutLog.updateMany({
      where: { targetId: playerId, isRead: false },
      data: { isRead: true },
    });
  }
}
```

**Step 2: Add routes to pvp.ts**

Import the new functions and add endpoints after existing notification routes:

```typescript
import {
  // ... existing imports ...
  getScoutNotificationCount,
  getScoutNotifications,
  markScoutNotificationsRead,
} from '../services/pvpService';
```

Add routes:

```typescript
// Scout notifications
pvpRouter.get('/notifications/scouts/count', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const count = await getScoutNotificationCount(playerId);
  res.json({ count });
}));

pvpRouter.get('/notifications/scouts', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const notifications = await getScoutNotifications(playerId);
  res.json({ notifications });
}));

const scoutReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
});

pvpRouter.post('/notifications/scouts/read', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = scoutReadSchema.parse(req.body);
  await markScoutNotificationsRead(playerId, body.ids);
  res.json({ success: true });
}));
```

**Step 3: Build and typecheck**

Run: `npm run build:api && npm run typecheck`

**Step 4: Commit**

```bash
git add apps/api/src/services/pvpService.ts apps/api/src/routes/pvp.ts
git commit -m "feat(api): add scout notification endpoints"
```

---

## Task 5: Update PvP Tests

**Files:**
- Modify: `apps/api/src/services/pvpService.test.ts`

**Step 1: Update mocks**

Replace `runCombat` mock with `runTemplateCombat`:

```typescript
vi.mock('@adventure/game-engine', () => ({
  buildPlayerCombatStats: vi.fn(() => ({ /* mock stats */ })),
  calculateFleeResult: vi.fn(() => ({ outcome: 'escape', remainingHp: 10, goldLost: 0 })),
  calculateMaxHp: vi.fn(() => 100),
  runTemplateCombat: vi.fn(() => ({
    outcome: 'victory',
    log: [],
    combatantAMaxHp: 100,
    combatantBMaxHp: 100,
    combatantAHpRemaining: 80,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 60,
    combatantBStaminaRemaining: 100,
    combatantAManaRemaining: 30,
    combatantBManaRemaining: 50,
    potionsConsumed: [],
    totalRounds: 5,
  })),
  calculateMaxStamina: vi.fn(() => 100),
  calculateStaminaRegenPerRound: vi.fn(() => 10),
  calculateMaxMana: vi.fn(() => 50),
  calculateManaRegenPerRound: vi.fn(() => 5),
}));
```

Add mocks for new service dependencies:

```typescript
vi.mock('./combatTemplateService', () => ({
  getActiveTemplate: vi.fn(() => [{ actionId: 'light_attack' }]),
}));

vi.mock('./resourceService', () => ({
  getResourceState: vi.fn(() => ({
    stamina: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 },
    mana: { current: 50, max: 50, regenPerRound: 5, regenPerSecond: 0.5 },
  })),
  setAllResources: vi.fn(),
}));

vi.mock('./skillPointService', () => ({
  getSkillPoints: vi.fn(() => ({
    playerId: 'test',
    totalPointsEarned: 0,
    totalPointsSpent: 0,
    availablePoints: 0,
    allocations: {},
    unlockedActions: [],
  })),
}));
```

**Step 2: Update existing challenge tests**

Update all test assertions that reference `runCombat` to use `runTemplateCombat`. Update expected mock calls.

**Step 3: Add new tests**

Add tests for:
- Challenge uses `runTemplateCombat` (verify mock called)
- Challenge persists attacker stamina/mana via `setAllResources`
- Challenge defeat persists attacker resources before flee/knockout
- Defender uses max resources (verify `TemplateCombatant` construction)
- Scout returns `templateInfo` with category breakdown
- Scout creates `PvpScoutLog` notification
- `getScoutNotificationCount` returns unread count
- `getScoutNotifications` returns unread with scouter names
- `markScoutNotificationsRead` marks specific/all as read

**Step 4: Run tests**

Run: `npm run test:api -- --run`
Expected: All pass

**Step 5: Commit**

```bash
git add apps/api/src/services/pvpService.test.ts
git commit -m "test(api): update PvP tests for template combat and scout notifications"
```

---

## Phase 3 Verification Checklist

After completing Tasks 1-5:

1. `npm run db:migrate` — migration succeeds
2. `npm run build` — all packages build
3. `npm run typecheck` — no TS errors
4. `npm run test:engine` — all engine tests pass (no engine changes)
5. `npm run test:api` — all API tests pass (old + new)
