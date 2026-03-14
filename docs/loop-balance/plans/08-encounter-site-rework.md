# Encounter Site Rework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform encounter sites from sequential 1v1 fights into multi-mob room combat using the raid resolver, with per-room auto-resolve/manual strategy choice, chest tier expansion (epic/legendary), and constants rebalancing.

**Architecture:** Reuse the existing raid round resolver (`resolveRaidRound`) for encounter site room combat with two new mechanics: splash hit cascade (optional param on the resolver) and crowded debuff (pre-processing mob stats before each round). Replace the room-by-room/full-clear strategy with per-room auto-resolve/manual choice mirroring the expedition auto-resolve pattern. Chest tiers determined by room count, not site size.

**Tech Stack:** TypeScript, Prisma 6, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-03-14-encounter-site-rework-design.md`

---

## Chunk 1: Constants, Types & Game-Engine Foundation

### Task 1: Add ENCOUNTER_SITE_CONSTANTS and Extend Chest Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

- [ ] **Step 1: Add ENCOUNTER_SITE_CONSTANTS block**

After `FULL_CLEAR_CONSTANTS` (line 825), add:

```typescript
export const ENCOUNTER_SITE_CONSTANTS = {
  CROWDED_FACTOR: 0.15,
  AUTO_RESOLVE_DROP_MULTIPLIER: 1.5,
  AUTO_RESOLVE_RECIPE_MULTIPLIER: 1.5,
  AUTO_RESOLVE_MAX_ROUNDS: 100,
} as const;
```

- [ ] **Step 2: Add epic/legendary chest constants**

In `CHEST_CONSTANTS` (line 163), add after the large entries:

```typescript
CHEST_RECIPE_CHANCE_EPIC: 0.08,
CHEST_RECIPE_CHANCE_LEGENDARY: 0.15,
CHEST_MATERIAL_ROLLS_EPIC: { min: 5, max: 9 },
CHEST_MATERIAL_ROLLS_LEGENDARY: { min: 7, max: 12 },
```

- [ ] **Step 3: Update MOBS_PER_ROOM_MEDIUM**

In `ROOM_CONSTANTS` (line 808), change:

```typescript
MOBS_PER_ROOM_MEDIUM: { min: 3, max: 5 },
```

- [ ] **Step 4: Update ENCOUNTER_SITE_CHANCE_PER_TURN and DECAY_RATE**

In `EXPLORATION_CONSTANTS` (line 146):

```typescript
ENCOUNTER_SITE_CHANCE_PER_TURN: 0.0015,   // was 0.0008
ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: 0.25,  // was 0.06
```

- [ ] **Step 5: Build shared package to verify no type errors**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add encounter site constants, epic/legendary chest tiers, rebalance discovery/decay rates"
```

### Task 2: Add New Encounter Types

**Files:**
- Modify: `packages/shared/src/types/encounter.types.ts`

- [ ] **Step 1: Add RoomStrategyEntry and RoomCarryState types**

Append to `packages/shared/src/types/encounter.types.ts`:

```typescript
export type RoomMode = 'auto' | 'manual';

export interface RoomStrategyEntry {
  room: number;
  mode: RoomMode;
  bonusEligible: boolean;
}

export interface RoomCarryState {
  hp: number;
  stamina: number;
  mana: number;
}
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types/encounter.types.ts
git commit -m "feat: add RoomStrategyEntry, RoomCarryState, RoomMode types"
```

### Task 3: Extend ChestRarity Type and Chest Functions

**Files:**
- Modify: `packages/game-engine/src/exploration/encounterChest.ts`
- Test: `packages/game-engine/src/exploration/encounterChest.test.ts`

- [ ] **Step 1: Write failing tests for new chest functions**

Create or extend `encounterChest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getChestRarityForRoomCount,
  getChestMaterialRollRangeForRoomCount,
  getChestRecipeChanceForRoomCount,
  rollChestMaterialRollsByRoomCount,
} from './encounterChest';

describe('getChestRarityForRoomCount', () => {
  it('returns common for 1 room', () => {
    expect(getChestRarityForRoomCount(1)).toBe('common');
  });
  it('returns uncommon for 2 rooms', () => {
    expect(getChestRarityForRoomCount(2)).toBe('uncommon');
  });
  it('returns rare for 3 rooms', () => {
    expect(getChestRarityForRoomCount(3)).toBe('rare');
  });
  it('returns epic for 4 rooms', () => {
    expect(getChestRarityForRoomCount(4)).toBe('epic');
  });
  it('returns epic for 5+ rooms', () => {
    expect(getChestRarityForRoomCount(5)).toBe('epic');
  });
});

describe('getChestMaterialRollRangeForRoomCount', () => {
  it('returns epic range for 4 rooms', () => {
    expect(getChestMaterialRollRangeForRoomCount(4)).toEqual({ min: 5, max: 9 });
  });
});

describe('getChestRecipeChanceForRoomCount', () => {
  it('returns epic chance for 4 rooms', () => {
    expect(getChestRecipeChanceForRoomCount(4)).toBe(0.08);
  });
});

describe('rollChestMaterialRollsByRoomCount', () => {
  it('rolls within epic range for 4 rooms', () => {
    const result = rollChestMaterialRollsByRoomCount(4, () => 0.5);
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Extend ChestRarity type and add room-count functions**

In `encounterChest.ts`, update the `ChestRarity` type and add new functions:

```typescript
export type ChestRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export function getChestRarityForRoomCount(rooms: number): ChestRarity {
  if (rooms <= 1) return 'common';
  if (rooms === 2) return 'uncommon';
  if (rooms === 3) return 'rare';
  return 'epic';
}

export function getChestMaterialRollRangeForRoomCount(rooms: number): { min: number; max: number } {
  const rarity = getChestRarityForRoomCount(rooms);
  switch (rarity) {
    case 'common': return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_SMALL;
    case 'uncommon': return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_MEDIUM;
    case 'rare': return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LARGE;
    case 'epic': return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_EPIC;
    case 'legendary': return CHEST_CONSTANTS.CHEST_MATERIAL_ROLLS_LEGENDARY;
  }
}

export function getChestRecipeChanceForRoomCount(rooms: number): number {
  const rarity = getChestRarityForRoomCount(rooms);
  switch (rarity) {
    case 'common': return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_SMALL;
    case 'uncommon': return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM;
    case 'rare': return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LARGE;
    case 'epic': return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_EPIC;
    case 'legendary': return CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LEGENDARY;
  }
}

export function rollChestMaterialRollsByRoomCount(rooms: number, rng: () => number = Math.random): number {
  const range = getChestMaterialRollRangeForRoomCount(rooms);
  return range.min + Math.floor(rng() * (range.max - range.min + 1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/exploration/encounterChest.test.ts`
Expected: PASS

- [ ] **Step 5: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/exploration/encounterChest.ts packages/game-engine/src/exploration/encounterChest.test.ts
git commit -m "feat: extend ChestRarity with epic/legendary, add room-count-based chest functions"
```

### Task 4: Verify Room Generator Medium Differentiation

**Files:**
- Test: `packages/game-engine/src/exploration/roomGenerator.test.ts`

- [ ] **Step 1: Write test that medium mobs differ from small**

Add to `roomGenerator.test.ts`:

```typescript
describe('medium mob differentiation', () => {
  it('medium rooms have min 3 mobs (higher than small min 2)', () => {
    // With rng always returning 0 (minimum), medium room should have 3 mobs
    const result = generateRoomAssignments('medium', () => 0);
    const room = result.rooms[0];
    expect(room.mobCount).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (constant was already changed in Task 1)

Run: `npx vitest run packages/game-engine/src/exploration/roomGenerator.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/game-engine/src/exploration/roomGenerator.test.ts
git commit -m "test: verify medium room mob range differentiates from small"
```

---

## Chunk 2: Combat Mechanics (Splash Hit, Crowded Debuff, Mob Converter)

### Task 5: Add Splash Hit Cascade to Raid Resolver

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Modify: `packages/shared/src/types/expedition.types.ts` (RaidRoundInput)
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

- [ ] **Step 1: Write failing test for splash hit cascade**

Add to `raidRoundResolver.test.ts`:

```typescript
describe('splash hit cascade', () => {
  it('redirects missed attack to next alive mob in slot order', () => {
    // Build input with 3 mobs and a player who will miss the first target
    // Use a deterministic RNG: first hit roll misses primary, second hits secondary
    const mobs: ExpeditionMobState[] = [
      buildTestMob('mob-1', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 999 } }), // unhittable primary
      buildTestMob('mob-2', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 0 } }),   // hittable secondary
      buildTestMob('mob-3', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 0 } }),
    ];
    const participants = [buildTestParticipant({ targetMobId: 'mob-1' })];
    const input: RaidRoundInput = {
      mobs,
      participants,
      threatTable: [],
      roundNumber: 1,
      splashCascade: true,
    };

    const result = resolveRaidRound(input, undefined, 'pve_open_world');

    // RaidParticipantResult has flat fields: hit, isCritical, damageDealt, targetMobId
    // The round-level attack log is in result.roundLog.phases.playerAttacks
    // Check that some damage was dealt (splash redirected the miss)
    const pr = result.participantResults[0];
    expect(pr.hit).toBe(true);
    expect(pr.targetMobId).toBe('mob-2');
    expect(pr.damageDealt).toBeGreaterThan(0);
  });

  it('records miss when all cascade targets are also missed', () => {
    const mobs: ExpeditionMobState[] = [
      buildTestMob('mob-1', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 999 } }),
      buildTestMob('mob-2', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 999 } }),
    ];
    const participants = [buildTestParticipant({ targetMobId: 'mob-1' })];
    const input: RaidRoundInput = {
      mobs,
      participants,
      threatTable: [],
      roundNumber: 1,
      splashCascade: true,
    };

    const result = resolveRaidRound(input, undefined, 'pve_open_world');
    const pr = result.participantResults[0];
    expect(pr.hit).toBe(false);
    expect(pr.damageDealt).toBe(0);
  });

  it('does not cascade when splashCascade is false', () => {
    const mobs: ExpeditionMobState[] = [
      buildTestMob('mob-1', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 999 } }),
      buildTestMob('mob-2', { hp: 50, maxHp: 50, stats: { ...baseStats, evasion: 0 } }),
    ];
    const participants = [buildTestParticipant({ targetMobId: 'mob-1' })];
    const input: RaidRoundInput = {
      mobs,
      participants,
      threatTable: [],
      roundNumber: 1,
      // splashCascade defaults to undefined/false
    };

    const result = resolveRaidRound(input, undefined, 'pve_open_world');
    const pr = result.participantResults[0];
    // Should miss — no cascade
    expect(pr.hit).toBe(false);
  });
});
```

Note: `buildTestMob` and `buildTestParticipant` are test helpers — either reuse existing ones in the test file or create them matching the test file's conventions. Check the existing test file for helper patterns before writing new ones. The `RaidParticipantResult` type has flat fields (`hit`, `isCritical`, `damageDealt`, `targetMobId`) — not an `attacks` array. Detailed round logs are in `result.roundLog.phases.playerAttacks`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/raidRoundResolver.test.ts -t "splash hit cascade"`
Expected: FAIL — `splashCascade` not recognized on `RaidRoundInput`

- [ ] **Step 3: Add splashCascade to RaidRoundInput**

In `packages/shared/src/types/expedition.types.ts`, add to `RaidRoundInput`:

```typescript
export interface RaidRoundInput {
  mobs: ExpeditionMobState[];
  participants: RaidParticipant[];
  threatTable: RaidThreatEntry[];
  roundNumber: number;
  environmentalDotPercent?: number;
  summonPool?: ExpeditionMobState[];
  splashCascade?: boolean;
}
```

- [ ] **Step 4: Implement splash cascade in resolvePlayerOffensive**

In `raidRoundResolver.ts`, in the `resolvePlayerOffensive` function, find the miss handling block (around line 150-161 where `!hits` is checked). After the existing miss logic, add the cascade:

```typescript
if (!hits) {
  // Existing debuff-on-miss logic stays...
  if (def.effect?.alwaysApplies && def.effect.isDebuff && target.hp > 0) {
    // ... existing code ...
  }

  // Splash hit cascade: try other alive mobs in slot order
  if (input.splashCascade) {
    const otherMobs = aliveMobs.filter(m => m.id !== target.id);
    let splashHit = false;
    for (const cascadeMob of otherMobs) {
      const cascadeHits = rollHit(/* same params but against cascadeMob */);
      if (cascadeHits) {
        // Redirect attack to this mob — recompute damage against cascadeMob
        target = cascadeMob;
        hits = true;
        splashHit = true;
        break;
      }
    }
    if (!splashHit) {
      entries.push({ ...baseEntry, hit: false, crit: false });
      continue;
    }
    // Fall through to damage calculation with new target
  } else {
    entries.push({ ...baseEntry, hit: false, crit: false });
    continue;
  }
}
```

The exact implementation depends on how `resolvePlayerOffensive` structures its hit check and damage calculation. The key pattern is:
1. On miss, if `splashCascade` is enabled, iterate other alive mobs
2. Roll hit against each using the same hit function
3. On first hit, redirect `target` and fall through to damage calc
4. If all miss, record the miss as normal

The implementer must read the full `resolvePlayerOffensive` function to wire this in correctly — the `input` parameter needs to be threaded through (it's currently not a param of `resolvePlayerOffensive`, so it needs to be added, or the `splashCascade` flag passed separately).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/combat/raidRoundResolver.test.ts -t "splash hit cascade"`
Expected: PASS

- [ ] **Step 6: Run all raid resolver tests to check for regressions**

Run: `npx vitest run packages/game-engine/src/combat/raidRoundResolver.test.ts`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types/expedition.types.ts packages/game-engine/src/combat/raidRoundResolver.ts packages/game-engine/src/combat/raidRoundResolver.test.ts
git commit -m "feat: add splash hit cascade to raid resolver (encounter site modifier)"
```

### Task 6: Add Crowded Debuff Utility

**Files:**
- Create: `packages/game-engine/src/combat/crowdedDebuff.ts`
- Test: `packages/game-engine/src/combat/crowdedDebuff.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { applyCrowdedDebuff, computeCrowdedMultiplier } from './crowdedDebuff';

describe('computeCrowdedMultiplier', () => {
  it('returns 1.0 for single mob', () => {
    expect(computeCrowdedMultiplier(1)).toBeCloseTo(1.0);
  });

  it('returns ~0.87 for 2 mobs at default factor', () => {
    expect(computeCrowdedMultiplier(2)).toBeCloseTo(0.87, 1);
  });

  it('returns ~0.77 for 3 mobs', () => {
    expect(computeCrowdedMultiplier(3)).toBeCloseTo(0.77, 1);
  });

  it('returns ~0.69 for 4 mobs', () => {
    expect(computeCrowdedMultiplier(4)).toBeCloseTo(0.69, 1);
  });

  it('returns ~0.63 for 5 mobs', () => {
    expect(computeCrowdedMultiplier(5)).toBeCloseTo(0.63, 1);
  });
});

describe('applyCrowdedDebuff', () => {
  // CombatantStats requires: hp, maxHp, attack, accuracy, defence, magicDefence,
  // dodge, evasion, damageMin, damageMax, speed, damageType
  // Check packages/shared/src/types/combat.types.ts for exact fields
  const baseStats: CombatantStats = {
    hp: 100, maxHp: 100, attack: 15, accuracy: 100,
    defence: 50, magicDefence: 50, dodge: 5, evasion: 10,
    damageMin: 10, damageMax: 20, speed: 10, damageType: 'physical',
  };

  it('reduces mob damage and accuracy by multiplier', () => {
    const debuffed = applyCrowdedDebuff(baseStats, 3);
    expect(debuffed.damageMin).toBe(Math.floor(10 * computeCrowdedMultiplier(3)));
    expect(debuffed.damageMax).toBe(Math.floor(20 * computeCrowdedMultiplier(3)));
    expect(debuffed.accuracy).toBe(Math.floor(100 * computeCrowdedMultiplier(3)));
  });

  it('does not modify defence, magicDefence, evasion, hp', () => {
    const debuffed = applyCrowdedDebuff(baseStats, 3);
    expect(debuffed.defence).toBe(50);
    expect(debuffed.magicDefence).toBe(50);
    expect(debuffed.evasion).toBe(10);
    expect(debuffed.hp).toBe(100);
  });

  it('returns original stats for single mob', () => {
    const debuffed = applyCrowdedDebuff(baseStats, 1);
    expect(debuffed.damageMin).toBe(10);
    expect(debuffed.damageMax).toBe(20);
    expect(debuffed.accuracy).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/crowdedDebuff.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement crowded debuff**

```typescript
import { ENCOUNTER_SITE_CONSTANTS } from '@pocketrealm/shared';
import type { CombatantStats } from '@pocketrealm/shared';

export function computeCrowdedMultiplier(
  aliveMobs: number,
  factor: number = ENCOUNTER_SITE_CONSTANTS.CROWDED_FACTOR,
): number {
  return 1 / (1 + (aliveMobs - 1) * factor);
}

export function applyCrowdedDebuff(
  stats: CombatantStats,
  aliveMobs: number,
): CombatantStats {
  const mult = computeCrowdedMultiplier(aliveMobs);
  return {
    ...stats,
    damageMin: Math.floor(stats.damageMin * mult),
    damageMax: Math.floor(stats.damageMax * mult),
    accuracy: Math.floor(stats.accuracy * mult),
  };
}
```

Note: Check the actual `CombatantStats` type definition for exact field names. The fields `damageMin`, `damageMax`, `accuracy` are the ones to debuff. Other stats (`defence`, `magicDefence`, `evasion`, `hp`) are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/combat/crowdedDebuff.test.ts`
Expected: PASS

- [ ] **Step 5: Add barrel export**

In `packages/game-engine/src/index.ts`, add:

```typescript
export * from './combat/crowdedDebuff';
```

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/combat/crowdedDebuff.ts packages/game-engine/src/combat/crowdedDebuff.test.ts packages/game-engine/src/index.ts
git commit -m "feat: add crowded debuff utility for encounter site multi-mob rooms"
```

### Task 7: Build Encounter Raid Mob Converter

**Files:**
- Create: `packages/game-engine/src/exploration/encounterRaidMob.ts`
- Test: `packages/game-engine/src/exploration/encounterRaidMob.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { buildEncounterRaidMob } from './encounterRaidMob';
import type { EncounterMobSlot } from '@pocketrealm/shared';

describe('buildEncounterRaidMob', () => {
  const slot: EncounterMobSlot = {
    slot: 1,
    mobTemplateId: 'template-1',
    role: 'trash',
    prefix: 'Angry',
    status: 'alive',
    room: 1,
  };

  const template = {
    id: 'template-1',
    name: 'Goblin',
    hp: 100,
    attack: 15,
    rangedAttack: 10,
    magicAttack: 5,
    defence: 20,
    magicDefence: 15,
    accuracy: 80,
    evasion: 10,
    critChance: 0.05,
    critMultiplier: 1.5,
    actionTemplate: [{ type: 'light_attack', weight: 1 }],
  };

  it('maps slot + template to ExpeditionMobState', () => {
    const mob = buildEncounterRaidMob(slot, template);
    expect(mob.id).toBe('encounter-mob-1');
    expect(mob.mobTemplateId).toBe('template-1');
    expect(mob.name).toBe('Goblin');
    expect(mob.prefix).toBe('Angry');
    expect(mob.hp).toBe(100);
    expect(mob.maxHp).toBe(100);
    expect(mob.stats.accuracy).toBe(80);
    expect(mob.stats.defence).toBe(20);
    expect(mob.actionTemplate).toEqual(template.actionTemplate);
    expect(mob.activeEffects).toEqual([]);
    expect(mob.phaseTemplates).toBeUndefined();
  });

  it('uses slot number for unique id', () => {
    const mob = buildEncounterRaidMob({ ...slot, slot: 5 }, template);
    expect(mob.id).toBe('encounter-mob-5');
  });

  it('handles null prefix', () => {
    const mob = buildEncounterRaidMob({ ...slot, prefix: null }, template);
    expect(mob.prefix).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/exploration/encounterRaidMob.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the converter**

```typescript
import type { EncounterMobSlot, ExpeditionMobState } from '@pocketrealm/shared';

interface MobTemplateForConversion {
  id: string;
  name: string;
  hp: number;
  attack: number;
  rangedAttack: number;
  magicAttack: number;
  defence: number;
  magicDefence: number;
  accuracy: number;
  evasion: number;
  critChance: number;
  critMultiplier: number;
  actionTemplate: unknown[];
}

export function buildEncounterRaidMob(
  slot: EncounterMobSlot,
  template: MobTemplateForConversion,
): ExpeditionMobState {
  return {
    id: `encounter-mob-${slot.slot}`,
    mobTemplateId: template.id,
    name: template.name,
    prefix: slot.prefix,
    hp: template.hp,
    maxHp: template.hp,
    stats: {
      hp: template.hp,
      maxHp: template.hp,
      attack: template.attack,
      accuracy: template.accuracy,
      defence: template.defence,
      magicDefence: template.magicDefence,
      dodge: 0,
      evasion: template.evasion,
      damageMin: template.attack,   // placeholder — check MobTemplate for actual damage fields
      damageMax: template.attack,   // placeholder — check MobTemplate for actual damage fields
      speed: 10,
      damageType: 'physical' as const,
      critChance: template.critChance,
      critDamage: template.critMultiplier,
    },
    actionTemplate: template.actionTemplate as ExpeditionMobState['actionTemplate'],
    activeEffects: [],
  };
}
```

Note: The exact `CombatantStats` fields must match what the raid resolver reads. Check `CombatantStats` type at `packages/shared/src/types/combat.types.ts:164-179` — it requires `hp`, `maxHp`, `attack`, `accuracy`, `defence`, `magicDefence`, `dodge`, `evasion`, `damageMin`, `damageMax`, `speed`, `damageType`. The `damageMin`/`damageMax` mapping in the snippet above sets both to `template.attack` as a placeholder — check how `runTemplateCombat` in `apps/api/src/routes/combat/start.ts` (around line 220) derives damage from MobTemplate to get the correct mapping. MobTemplates may have explicit `damageMin`/`damageMax` fields or derive them from attack stat. Match the existing pattern.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/exploration/encounterRaidMob.test.ts`
Expected: PASS

- [ ] **Step 5: Add barrel export**

In `packages/game-engine/src/index.ts`, add:

```typescript
export * from './exploration/encounterRaidMob';
```

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/exploration/encounterRaidMob.ts packages/game-engine/src/exploration/encounterRaidMob.test.ts packages/game-engine/src/index.ts
git commit -m "feat: add encounter mob to raid mob state converter"
```

---

## Chunk 3: Schema Migration & Chest Service

### Task 8: Schema Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Update EncounterSite model**

In `schema.prisma`, update the EncounterSite model (line 525):

Remove:
- `clearStrategy   String?   @map("clear_strategy") @db.VarChar(16)`
- `fullClearActive Boolean   @default(true) @map("full_clear_active")`
- `roomCarryHp     Int?      @map("room_carry_hp")`

Add:
- `roomStrategy    Json?     @map("room_strategy")`
- `roomCarryState  Json?     @map("room_carry_state")`

The model should look like:

```prisma
model EncounterSite {
  id              String    @id @default(uuid())
  playerId        String    @map("player_id")
  zoneId          String    @map("zone_id")
  mobFamilyId     String    @map("mob_family_id")
  name            String    @db.VarChar(128)
  size            String    @db.VarChar(16)
  mobs            Json
  discoveredAt    DateTime  @default(now()) @map("discovered_at")
  sourceLogId     String?   @map("source_log_id")
  currentRoom     Int       @default(1) @map("current_room")
  roomStrategy    Json?     @map("room_strategy")
  roomCarryState  Json?     @map("room_carry_state")
  totalRooms      Int       @default(1) @map("total_rooms")

  // ... keep existing relations and indexes
  @@map("encounter_sites")
}
```

Note: `totalRooms` is added so the chest tier can be determined without re-parsing the mobs JSON. Set during site creation from `generateRoomAssignments().rooms.length`.

- [ ] **Step 2: Generate migration**

Run: `npm run db:migrate -- --name encounter-site-rework`

This will create a migration that:
- Drops `clear_strategy`, `full_clear_active`, `room_carry_hp` columns
- Adds `room_strategy`, `room_carry_state`, `total_rooms` columns
- Deletes existing encounter sites (add SQL to migration: `DELETE FROM encounter_sites;`)

- [ ] **Step 3: Review the generated migration SQL**

Open the generated migration file in `packages/database/prisma/migrations/`. Verify it:
1. Drops old columns
2. Adds new columns with correct defaults
3. Add `DELETE FROM encounter_sites;` at the top of the migration (before column changes) to clear ephemeral data

- [ ] **Step 4: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma client regenerated successfully

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: migrate encounter site schema — room strategy, carry state, total rooms"
```

### Task 9: Update Chest Service for Room-Count Tiers

**Files:**
- Modify: `apps/api/src/services/chestService.ts`

- [ ] **Step 1: Update grantEncounterSiteChestRewardsTx params**

Change the params type to accept `totalRooms` and `autoResolvedRooms` instead of `size` and `fullClearBonus`:

```typescript
export async function grantEncounterSiteChestRewardsTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    mobFamilyId: string;
    totalRooms: number;
    autoResolvedBonusRooms: number;
    availableSlots?: number;
  }
): Promise<EncounterSiteChestRewards>
```

- [ ] **Step 2: Update chest tier and roll logic**

Replace the size-based tier determination with room-count-based:

```typescript
// Determine chest rarity from room count
const chestRarity = getChestRarityForRoomCount(params.totalRooms);

// Base material rolls from room count
const baseRolls = rollChestMaterialRollsByRoomCount(params.totalRooms);

// Auto-resolve proportional multiplier
const bonusFraction = params.totalRooms > 0
  ? params.autoResolvedBonusRooms / params.totalRooms
  : 0;
const effectiveRolls = Math.ceil(
  baseRolls * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER - 1))
);

// Recipe chance with proportional auto-resolve bonus
const baseRecipeChance = getChestRecipeChanceForRoomCount(params.totalRooms);
const effectiveRecipeChance = baseRecipeChance * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER - 1));
```

Remove all references to `FULL_CLEAR_CONSTANTS`, `getUpgradedChestSize`, and `getChestRarityForEncounterSize` from this function.

- [ ] **Step 3: Update imports**

Add imports for new functions from `encounterChest.ts`:

```typescript
import {
  getChestRarityForRoomCount,
  getChestRecipeChanceForRoomCount,
  rollChestMaterialRollsByRoomCount,
} from '@pocketrealm/game-engine';
import { ENCOUNTER_SITE_CONSTANTS } from '@pocketrealm/shared';
```

- [ ] **Step 4: Update EncounterSiteChestRewards type if needed**

The `chestRarity` field type comes from `ChestRarity` which now includes `'epic' | 'legendary'`. Verify the return type still works — it should, since `ChestRarity` was extended in Task 3.

- [ ] **Step 5: Build API to verify no type errors**

Run: `npm run build:api`
Expected: Clean build (may have errors from callers of `grantEncounterSiteChestRewardsTx` that still pass `size` — those will be fixed in the route update tasks)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/chestService.ts
git commit -m "feat: update chest service to use room-count-based tiers with auto-resolve multiplier"
```

### Task 10: Seed Epic/Legendary Drop Tables

**Files:**
- Modify: `packages/database/prisma/seed.ts` (or wherever seed data lives)

- [ ] **Step 1: Find existing ChestDropTable seed data**

Search for where `ChestDropTable` rows are seeded. Look for `chestDropTable` in the seed file.

- [ ] **Step 2: Add epic drop table entries**

For each mob family that has `rare` drop table entries, create corresponding `epic` entries. Use the same item templates but with adjusted weights (higher weight on rarer/better items, lower weight on common filler):

```typescript
// Pattern for each mob family:
// Copy rare entries, set chestRarity to 'epic'
// Increase dropChance weight on higher-tier items by ~1.5x
// Decrease dropChance weight on common filler items by ~0.5x
// Increase minQuantity and maxQuantity by 1
```

- [ ] **Step 3: Add placeholder legendary drop table entries**

Add minimal legendary entries (same structure as epic but even more generous weights). These are placeholders — legendary chests aren't earnable from encounter sites yet.

- [ ] **Step 4: Run seed**

Run: `npm run db:seed`
Expected: Seed completes without errors

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/seed.ts
git commit -m "feat: seed epic and legendary chest drop tables for all mob families"
```

---

## Chunk 4: Encounter Site Combat Service & Routes

### Task 11: Create Encounter Site Combat Service

This is the core integration task — the service that runs multi-mob room fights using the raid resolver.

**Files:**
- Create: `apps/api/src/services/encounterSiteCombatService.ts`
- Test: `apps/api/src/services/encounterSiteCombatService.test.ts`

- [ ] **Step 1: Write failing test for auto-resolve loop helper**

Extract the pure combat loop logic into a testable helper (`resolveEncounterRoomCombat`) that takes pre-built player + mobs and returns the result without DB interaction:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveEncounterRoomCombat } from './encounterSiteCombatService';
import type { RaidParticipant, ExpeditionMobState } from '@pocketrealm/shared';

describe('resolveEncounterRoomCombat', () => {
  it('returns cleared when all mobs are killed', () => {
    const player = buildTestParticipant({ hp: 500, stamina: 200, mana: 100 });
    const mobs: ExpeditionMobState[] = [
      buildTestMob('mob-1', { hp: 10, maxHp: 10 }), // weak mob, dies quickly
    ];

    const result = resolveEncounterRoomCombat(player, mobs);
    expect(result.outcome).toBe('cleared');
    expect(result.roundsResolved).toBeGreaterThan(0);
    expect(result.playerHpAfter).toBeGreaterThan(0);
  });

  it('returns defeated when player HP reaches 0', () => {
    const player = buildTestParticipant({ hp: 1, stamina: 200, mana: 100 }); // near death
    const mobs: ExpeditionMobState[] = [
      buildTestMob('mob-1', { hp: 9999, maxHp: 9999, stats: { ...strongStats } }),
    ];

    const result = resolveEncounterRoomCombat(player, mobs);
    expect(result.outcome).toBe('defeated');
  });

  it('applies crowded debuff — mobs deal less damage with more alive', () => {
    // Compare damage taken with 1 mob vs 4 mobs (4 mobs should deal less per-mob)
    const player1 = buildTestParticipant({ hp: 1000, stamina: 200, mana: 100 });
    const singleMob = [buildTestMob('mob-1', { hp: 9999, maxHp: 9999 })];
    const result1 = resolveEncounterRoomCombat(player1, singleMob);

    const player4 = buildTestParticipant({ hp: 1000, stamina: 200, mana: 100 });
    const fourMobs = Array.from({ length: 4 }, (_, i) =>
      buildTestMob(`mob-${i}`, { hp: 9999, maxHp: 9999 })
    );
    const result4 = resolveEncounterRoomCombat(player4, fourMobs);

    // With crowded debuff, per-mob damage is lower with 4 mobs
    // Total damage may still be higher, but individual mob hits are weaker
    // Check round logs for per-mob damage entries
    expect(result4.roundsResolved).toBeGreaterThan(0);
  });
});
```

Note: `buildTestParticipant` and `buildTestMob` helpers should follow patterns from `raidRoundResolver.test.ts`. The service integration tests (DB-dependent) should use the existing API test harness.

- [ ] **Step 2: Implement auto-resolve room function**

The service follows the expedition auto-resolve pattern from `expeditionService.ts:940-1048`:

```typescript
import { resolveRaidRound } from '@pocketrealm/game-engine';
import { buildEncounterRaidMob } from '@pocketrealm/game-engine';
import { applyCrowdedDebuff } from '@pocketrealm/game-engine';
import { ENCOUNTER_SITE_CONSTANTS, COMBAT_CONSTANTS } from '@pocketrealm/shared';
import type { RaidRoundInput, ExpeditionMobState, RaidParticipant, RaidThreatEntry } from '@pocketrealm/shared';
import type { EncounterMobSlot, RoomStrategyEntry } from '@pocketrealm/shared';

export interface EncounterRoomResult {
  outcome: 'cleared' | 'defeated';
  roundsResolved: number;
  roundLogs: unknown[];
  playerHpAfter: number;
  playerStaminaAfter: number;
  playerManaAfter: number;
  mobResults: { mobId: string; alive: boolean; hpRemaining: number }[];
}

export async function autoResolveEncounterRoom(
  playerId: string,
  siteId: string,
  roomNumber: number,
): Promise<EncounterRoomResult> {
  // 1. Load site, verify ownership, verify room is current and not started
  // 2. Apply decay
  // 3. Get alive mobs in room
  // 4. Load mob templates from DB
  // 5. Convert to ExpeditionMobState via buildEncounterRaidMob
  // 6. Build player as RaidParticipant (stats, equipment, template)
  // 7. Charge turn cost: aliveMobs.length * COMBAT_CONSTANTS.ENCOUNTER_TURN_COST
  // 8. Auto-resolve loop (mirrors expeditionService.autoResolveRoom):
  //    - For each round up to AUTO_RESOLVE_MAX_ROUNDS:
  //      a. Compute alive mob count
  //      b. Apply crowded debuff to mob stats copies
  //      c. Build RaidRoundInput with splashCascade: true, combatMode: 'pve_open_world'
  //      d. Call resolveRaidRound(input, undefined, 'pve_open_world')
  //      e. Carry forward player state (hp, stamina, mana, effects, templateRound)
  //      f. Carry forward mob state (mobs = result.mobsAfter)
  //      g. Break if room cleared or player defeated
  // 9. Single DB transaction:
  //    - If cleared: mark room mobs as defeated in mobs JSON
  //      Record roomStrategy entry { room, mode: 'auto', bonusEligible: decayedInRoom === 0 }
  //      Advance currentRoom, save roomCarryState
  //      If all rooms done: grant chest rewards, delete site
  //    - If defeated: reset room mobs to alive, clear roomCarryState
  //      Apply defeat handling (flee/knockout)
  // 10. Return result with combat log
}
```

- [ ] **Step 3: Implement manual room start function**

```typescript
export async function startManualEncounterRoom(
  playerId: string,
  siteId: string,
): Promise<ManualRoomStartResult> {
  // 1. Load site, verify ownership, current room not started
  // 2. Apply decay
  // 3. Get alive mobs in room
  // 4. Load mob templates, convert to ExpeditionMobState
  // 5. Charge turn cost
  // 6. Build initial player state as RaidParticipant
  // 7. Return room state (mobs, player state) for client to begin manual rounds
  // Store in-memory combat state (use a Map or similar short-lived cache keyed by siteId)
}
```

- [ ] **Step 4: Implement manual round function**

```typescript
export async function resolveManualEncounterRound(
  playerId: string,
  siteId: string,
  action: { type: string; targetMobSlot?: number },
): Promise<ManualRoundResult> {
  // 1. Load in-memory combat state for this site
  // 2. Apply player's chosen action (override template for this round)
  // 3. Compute crowded debuff on alive mobs
  // 4. Build RaidRoundInput with splashCascade: true
  // 5. Call resolveRaidRound
  // 6. Carry forward state
  // 7. If room cleared or defeated: persist to DB (same as auto-resolve step 9)
  // 8. Return round result
}
```

Note: Manual combat state management (in-memory between rounds) mirrors the expedition pattern where each round is a separate API call. If the server restarts between rounds, the room resets — this is by design (manual rooms must complete in one session).

- [ ] **Step 5: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/encounterSiteCombatService.ts apps/api/src/services/encounterSiteCombatService.test.ts
git commit -m "feat: add encounter site combat service (auto-resolve + manual room combat)"
```

### Task 12: Add New API Routes

**Files:**
- Modify: `apps/api/src/routes/combat/sites.ts`

- [ ] **Step 1: Add auto-resolve endpoint**

```typescript
// POST /api/v1/combat/encounter-sites/:id/auto-resolve
// Note: authenticate middleware is already applied at router level (combatRouter.use(authenticate))
// Use asyncHandler wrapper consistent with existing route patterns in sites.ts
router.post('/:id/auto-resolve', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const playerId = req.player!.playerId;
  const result = await autoResolveEncounterRoom(playerId, id);
  res.json(result);
}));
```

- [ ] **Step 2: Add start-room endpoint**

```typescript
// POST /api/v1/combat/encounter-sites/:id/start-room
router.post('/:id/start-room', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const playerId = req.player!.playerId;
  const result = await startManualEncounterRoom(playerId, id);
  res.json(result);
}));
```

- [ ] **Step 3: Add manual round endpoint**

```typescript
// POST /api/v1/combat/encounter-sites/:id/round
const roundSchema = z.object({
  action: z.string(),
  targetMobSlot: z.number().int().optional(),
});

router.post('/:id/round', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const body = roundSchema.parse(req.body);
  const playerId = req.player!.playerId;
  const result = await resolveManualEncounterRound(playerId, id, body);
  res.json(result);
}));
```

- [ ] **Step 4: Remove old strategy endpoint**

Delete or comment out the `POST /:id/strategy` endpoint (lines 216-246 of `sites.ts`) that handled `full_clear` / `room_by_room` strategy selection.

- [ ] **Step 5: Update site listing endpoint**

Update the site listing (`GET /api/v1/combat/sites`) to:
- Return `totalRooms` instead of `clearStrategy`
- Return `roomStrategy` array instead of `fullClearActive`
- Calculate turn cost per-room instead of total

- [ ] **Step 6: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/combat/sites.ts
git commit -m "feat: add encounter site auto-resolve, start-room, and round endpoints; remove old strategy endpoint"
```

### Task 13: Update Old Combat Route

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`

- [ ] **Step 1: Remove handleEncounterSiteRoomCombat**

The entire `handleEncounterSiteRoomCombat` function (lines 80-685) is replaced by the new encounter site combat service. Remove or deprecate it.

- [ ] **Step 2: Update the route handler**

The `POST /api/v1/combat/start` route currently checks for `encounterSiteId` in the body and delegates to `handleEncounterSiteRoomCombat`. Remove this branch — encounter site combat now uses the dedicated endpoints from Task 12.

If `encounterSiteId` is passed to this endpoint, return an error directing to the new endpoints:

```typescript
if (body.encounterSiteId) {
  return res.status(410).json({
    error: 'ENDPOINT_MOVED',
    message: 'Use /api/v1/combat/encounter-sites/:id/auto-resolve or /api/v1/combat/encounter-sites/:id/start-room',
  });
}
```

- [ ] **Step 3: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "refactor: remove old sequential encounter site combat, point to new endpoints"
```

---

## Chunk 5: Exploration, Admin & Cleanup

### Task 14: Update Exploration Site Creation

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`

- [ ] **Step 1: Set totalRooms on site creation**

In the site creation transaction (around line 837-864), add `totalRooms` from the room assignments:

```typescript
const distinctRooms = new Set(discovery.mobs.map(m => m.room)).size;
const site = await txAny.encounterSite.create({
  data: {
    playerId,
    zoneId: body.zoneId,
    mobFamilyId: discovery.mobFamilyId,
    name: discovery.siteName,
    size: discovery.size,
    mobs: { mobs: discovery.mobs },
    totalRooms: distinctRooms,
    // Remove: clearStrategy and fullClearActive auto-set for single-room sites
  },
});
```

Remove the conditional `clearStrategy: 'full_clear', fullClearActive: true` logic for single-room sites — strategy is now chosen per-room at combat time.

- [ ] **Step 2: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/exploration/start.ts
git commit -m "feat: set totalRooms on encounter site creation, remove auto-strategy"
```

### Task 15: Align Admin Route

**Files:**
- Modify: `apps/api/src/routes/admin.ts`

- [ ] **Step 1: Replace admin encounter creation with standard pipeline**

Replace the divergent code at lines 459-514 with a call to the standard `buildEncounterSiteMobs` + `generateRoomAssignments` pipeline:

```typescript
// admin.ts is at apps/api/src/routes/admin.ts
// helpers is at apps/api/src/routes/exploration/helpers.ts
import { buildEncounterSiteMobs } from './exploration/helpers';

// In the POST /admin/encounter/spawn handler:
// Note: buildEncounterSiteMobs expects ZoneFamilyRow['mobFamily'] as first param,
// not a raw Prisma MobFamily. Check the type and map the admin query result accordingly.
const mobs = buildEncounterSiteMobs(
  mobFamily, body.size, body.zoneId,
  100, // exploration percent (admin = full)
  null, // zone tiers
);
const distinctRooms = new Set(mobs.map(m => m.room)).size;

const site = await prisma.encounterSite.create({
  data: {
    playerId: body.playerId,
    zoneId: body.zoneId,
    mobFamilyId: body.mobFamilyId,
    name: `${mobFamily.name} Camp`,
    size: body.size,
    mobs: { mobs },
    totalRooms: distinctRooms,
  },
});
```

- [ ] **Step 2: Build API**

Run: `npm run build:api`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/admin.ts
git commit -m "fix: align admin encounter site creation with standard room pipeline (#76)"
```

### Task 16: Remove Old Constants and Full-Clear Code

**Dependency:** Task 15 (admin route alignment) must be completed first — it removes the last references to the legacy `ENCOUNTER_SIZE_*` constants.

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`
- Modify: `apps/api/src/routes/combat/helpers.ts`
- Modify: `packages/game-engine/src/exploration/encounterChest.ts`

- [ ] **Step 1: Remove FULL_CLEAR_CONSTANTS**

Delete the entire `FULL_CLEAR_CONSTANTS` block (lines 821-825 of gameConstants.ts).

- [ ] **Step 2: Remove legacy ENCOUNTER_SIZE constants**

Delete `ENCOUNTER_SIZE_SMALL`, `ENCOUNTER_SIZE_MEDIUM`, `ENCOUNTER_SIZE_LARGE` from `EXPLORATION_CONSTANTS` (they were only used by the old admin route).

- [ ] **Step 3: Remove old full-clear helpers**

In `encounterChest.ts`, keep the old size-based functions (they may be used by other code) but mark them as deprecated with a comment, or remove if a codebase search confirms no remaining callers:

```typescript
/** @deprecated Use getChestRarityForRoomCount instead */
export function getChestRarityForEncounterSize(size: EncounterSiteSize): ChestRarity { ... }

/** @deprecated No longer used — tier upgrade removed */
export function getUpgradedChestSize(size: EncounterSiteSize): EncounterSiteSize { ... }
```

- [ ] **Step 4: Clean up combat helpers**

In `apps/api/src/routes/combat/helpers.ts`, remove any helpers that were only used by the old `handleEncounterSiteRoomCombat`:
- `getNextEncounterMob` (line 99) — only used by old 1v1 flow
- `getNextEncounterMobInRoom` (line 110) — only used by old 1v1 flow

Keep:
- `parseEncounterSiteMobs` — still needed
- `countEncounterSiteState` — still needed
- `getAllAliveMobsInRoom` — still needed for new combat service
- `getRoomState` — still needed
- `getNextUnfinishedRoom` — still needed
- `applyEncounterSiteDecayInMemory` — still needed
- `applyEncounterSiteDecayAndPersist` — still needed

Verify each helper's usage with a codebase search before removing.

- [ ] **Step 5: Build everything**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts packages/game-engine/src/exploration/encounterChest.ts apps/api/src/routes/combat/helpers.ts
git commit -m "refactor: remove FULL_CLEAR_CONSTANTS, legacy encounter size constants, unused helpers"
```

### Task 17: Update Tracker

**Files:**
- Modify: `docs/loop-balance/tracker.md`

- [ ] **Step 1: Update tracker with plan reference**

In the "Needs Brainstorm First" section, move "Encounter Site Rework" to "Ready to Implement" with a link to this plan file and the eventual PR number.

- [ ] **Step 2: Commit**

```bash
git add docs/loop-balance/tracker.md
git commit -m "docs: link Encounter Site Rework plan to tracker"
```

---

## Implementation Notes

### Key Patterns to Follow

- **Expedition auto-resolve** (`apps/api/src/services/expeditionService.ts:940-1048`): The encounter site auto-resolve loop mirrors this pattern exactly — same `resolveRaidRound` loop, same state carryover, same single-transaction persistence.

- **Player stat building**: Reuse the existing player stat builder used by `handleEncounterSiteRoomCombat` (around line 220 of `start.ts`) to build the `RaidParticipant` object. This includes equipment bonuses, prefix modifiers, potion pool, etc.

- **Defeat handling**: Reuse the existing `handleCombatDefeat` function for flee/knockout on encounter site defeat.

### Testing Strategy

- **Unit tests** (game-engine): Crowded debuff, mob converter, chest functions, splash cascade. All pure functions, easy to test.
- **Integration tests** (API): Auto-resolve endpoint, manual round flow, chest rewards. These require DB setup but follow existing API test patterns.
- **Manual testing**: Verify encounter site flow end-to-end in a dev environment — discover site, enter rooms, auto-resolve/manual, verify chest rewards.

### Frontend (Separate Plan)

This plan covers backend only. The frontend will need a companion plan to:
- Replace the strategy selection screen (full-clear/room-by-room → auto-resolve/manual per room)
- Wire up new API endpoints (`auto-resolve`, `start-room`, `round`)
- Remove calls to the old strategy endpoint and old combat start with `encounterSiteId`
- Display round-by-round combat for manual mode (reuse expedition combat UI patterns)
- Show room layout and per-room strategy choice
- Handle the 410 response from the old combat start endpoint

Key frontend files that will break:
- Encounter site list/detail components (new fields: `totalRooms`, `roomStrategy`)
- Combat initiation flow (old `encounterSiteId` on combat start → new dedicated endpoints)
- Strategy selection UI (old `full_clear`/`room_by_room` → per-room auto/manual)

### Migration Checklist

Before deploying:
1. Run `npm run db:migrate` to apply schema changes (deletes all existing encounter sites)
2. Run `npm run db:seed` to seed epic/legendary drop tables
3. Verify Prisma client is regenerated
4. Build all packages
