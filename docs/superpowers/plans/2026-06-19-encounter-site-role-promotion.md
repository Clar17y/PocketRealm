# Encounter Site Role Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 3+ room encounter sites meaningfully escalate by promoting ordinary mob instances into `elite` and chance-based `mini_boss` roles, with final-room placement rules, role stat scaling, and role/family-aware action rotations. Reserve `boss` terminology for world bosses.

**Architecture:** Keep mob template identity and encounter role separate. A site can contain a normal `Web Spinner` and an elite `Web Spinner` because the `EncounterMobSlot.role` is an instance-level promotion applied after the base `mobTemplateId` is chosen. Prefixes remain a separate modifier layer and can stack with roles, such as `Gigantic Elite Web Spinner` or `Frail Elite Web Spinner`.

**Tech Stack:** TypeScript, Next.js 16, Express 4, Prisma 6, Vitest, existing shared/game-engine/API package boundaries.

**Worktree:** All implementation work must happen in `D:\Code\Adventure\.worktrees\pocketrealm-codex_encounter_site_role_promotion_plan` on branch `codex/encounter-site-role-promotion-plan`. Do not work in the main clone.

---

## Source Issue

GitHub issue: `Clar17y/Adventure#278` (`Encounter-site balance pass for levels 1-20`).

The issue has been updated with these decisions:

- Encounter-site slot roles are `trash | elite | mini_boss`.
- `boss` is reserved for world bosses.
- Existing encounter-site references to `boss` must be treated as legacy `mini_boss`.
- Role promotion happens per encounter-site slot after choosing the base mob template.
- A promoted mob keeps its base template identity. Example: `Web Spinner` can appear as both normal and elite in the same site.
- Prefixes remain separate and stack with roles.
- Every 3+ room encounter site must include at least one elite.
- A mini-boss is chance-based and can only appear in the final room.
- If there is no mini-boss, the required elite pressure must include the final room.
- Do not create a difficulty shape where room 2 has the only elite and rooms 3-4 are trash.
- Mini-boss finales may include elites around the mini-boss when room capacity allows.
- Role promotion must affect HP/damage/actions, not only display text.

---

## Current Code Map

- `packages/shared/src/types/encounter.types.ts`
  - Current `EncounterMobRole` is `'trash' | 'elite' | 'boss'`.
  - `EncounterMobSlot.role` is serialized into `EncounterSite.mobs` JSON.

- `packages/shared/src/constants/gameConstants.ts`
  - Contains `ROOM_CONSTANTS` and `ENCOUNTER_SITE_CONSTANTS`.
  - Tunable role promotion values belong here.

- `packages/game-engine/src/exploration/roomGenerator.ts`
  - Pure room count and mobs-per-room generator.
  - Should remain focused on layout only.

- `apps/api/src/services/exploration/helpers.ts`
  - `buildEncounterSiteMobs` currently creates a role queue from site size and pulls base mobs by family-member role.
  - It currently emits `boss` for large encounter sites.

- `apps/api/src/services/admin/zoneAdminService.ts`
  - `spawnAdminEncounter` has its own manual role assignment and emits `boss` for large final rooms.
  - This should use the same role assignment helper as normal encounter discovery.

- `apps/api/src/services/combat/helpers.ts`
  - `parseEncounterSiteMobs` currently accepts `trash | elite | boss`.
  - It should normalize legacy `boss` to `mini_boss`.

- `apps/api/src/services/encounterSiteCombatCore.ts`
  - `loadRoomMobsAsRaidState` currently applies zone event HP/damage multipliers.
  - It uses a single default mob action template: `boss_physical_attack`.
  - It computes prefix XP, but encounter-site combat loading does not currently apply prefix stat modifiers to the raid mob state.

- `packages/game-engine/src/combat/raidMobPhase.ts`
  - Mob rotations already exist: the action template cycles by round number.
  - The implementation only needs to provide better role/family-aware action templates.

- `packages/database/prisma/seed-data/families.ts`
  - Permanent encounter family members use role strings `trash`, `elite`, and `boss`.
  - Expedition family members already use `expedition_mini_boss`.
  - Since `MobFamilyMember.role` is a string column, this does not need a Prisma schema migration.

- `apps/web/src/components/common/combat/combatHelpers.ts`
  - Expedition room badges already label `mini_boss` as `Mini-Boss`.
  - Encounter-site UI may need a separate role label helper if it displays `EncounterMobSlot.role`.

---

## Design Decisions

### Runtime Role Model

`EncounterMobRole` becomes:

```typescript
export type EncounterMobRole = 'trash' | 'elite' | 'mini_boss';
```

`boss` is not a valid new encounter-site role. It is only accepted when parsing older serialized site JSON and normalized to `mini_boss`.

### Family Member Role Model

`MobFamilyMember.role` remains a seed/data classification string, but permanent encounter family data should use `mini_boss` instead of `boss`. World bosses continue to be identified by `MobTemplate.isBoss` and world-event/boss services, not by `MobFamilyMember.role`.

### Role Promotion

Base mob selection and instance role assignment are separate:

1. Filter eligible family members by zone and unlocked exploration tier.
2. Pick a base mob template with the existing tier bleedthrough behavior.
3. Assign an encounter slot role from the generated room layout.
4. Apply role stats/actions at combat-load time.

This allows the same `mobTemplateId` to appear as trash and elite within the same site.

### Placement Rules

For sites with fewer than 3 rooms:

- Do not force a promoted role from this feature.
- Existing prefixes and mob template variation still apply.

For sites with 3+ rooms:

- At least one `elite` is guaranteed.
- `mini_boss` can only be assigned in the final room.
- If the mini-boss roll succeeds:
  - Put one `mini_boss` in the final room.
  - If the final room has a second mob slot, put at least one `elite` in the final room too.
  - If the final room has only one mob slot, put the guaranteed `elite` in the immediately previous room.
- If the mini-boss roll fails:
  - Put at least one `elite` in the final room.
- For 4-room sites, add a second elite in the final room when capacity allows; otherwise put it in the penultimate room.
- Never produce the pattern "only promoted mob in an early room, later rooms all trash".

### Stat Scaling

Role scaling should be tunable and conservative enough for early tiers while making potion-chugging every few turns insufficient as a default plan.

Initial constants:

```typescript
export const ENCOUNTER_SITE_ROLE_CONSTANTS = {
  MIN_ROOMS_FOR_PROMOTED_ROLES: 3,
  MINI_BOSS_CHANCE: 0.35,
  ROLE_STAT_MULTIPLIERS: {
    trash: {
      hp: 1,
      damageMin: 1,
      damageMax: 1,
      accuracy: 1,
      defence: 1,
      magicDefence: 1,
      evasion: 1,
      xp: 1,
    },
    elite: {
      hp: 1.6,
      damageMin: 1.15,
      damageMax: 1.15,
      accuracy: 1.08,
      defence: 1.08,
      magicDefence: 1.08,
      evasion: 1,
      xp: 1.4,
    },
    mini_boss: {
      hp: 2.4,
      damageMin: 1.3,
      damageMax: 1.3,
      accuracy: 1.12,
      defence: 1.12,
      magicDefence: 1.12,
      evasion: 1.05,
      xp: 2,
    },
  },
} as const;
```

Use multiplicative order:

1. Base mob template
2. Prefix stat modifier
3. Zone/world-event modifier
4. Encounter role modifier

This means a `Frail Elite Web Spinner` is still an elite, but its prefix can create meaningful variation.

### Action Rotations

Do not keep every encounter-site mob on `boss_physical_attack`.

Use role-aware rotations built from existing boss action definitions because raid mob combat already understands `BossTemplateAction` entries. Keep names as existing action IDs for compatibility; role naming is handled by encounter slot role, not action ID names.

Minimum rotation behavior:

- Trash: single basic physical or magic action based on template damage type.
- Elite: 3-4 action loop with a family/damage-type special.
- Mini-boss: 4-5 action loop with a family/damage-type special and one telegraphed pressure action.

Example rotation resolver:

```typescript
import type { BossTemplateAction, DamageType, EncounterMobRole } from '@pocketrealm/shared';

type FamilyTheme =
  | 'spider'
  | 'wolf'
  | 'bandit'
  | 'treant'
  | 'spirit'
  | 'goblin'
  | 'golem'
  | 'undead'
  | 'beast'
  | 'caster'
  | 'default';

export function resolveEncounterRoleActionTemplate(input: {
  role: EncounterMobRole;
  damageType: DamageType;
  familyName: string | null;
  mobName: string;
}): BossTemplateAction[] {
  const basicAttack = input.damageType === 'magic' ? 'boss_magic_attack' : 'boss_physical_attack';
  const theme = inferFamilyTheme(input.familyName, input.mobName, input.damageType);

  if (input.role === 'trash') {
    return [{ actionId: basicAttack, targetMode: 'single_target' }];
  }

  const eliteSpecial = resolveEliteSpecial(theme, input.damageType);
  if (input.role === 'elite') {
    return [
      { actionId: basicAttack, targetMode: 'single_target' },
      eliteSpecial,
      { actionId: basicAttack, targetMode: 'single_target' },
    ];
  }

  const miniBossSpecial = resolveMiniBossSpecial(theme, input.damageType);
  const finisher = input.damageType === 'magic'
    ? { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true, label: 'ARCANE STORM' }
    : { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true, label: 'EARTHQUAKE' };

  return [
    { actionId: basicAttack, targetMode: 'single_target' },
    miniBossSpecial,
    { actionId: basicAttack, targetMode: 'single_target' },
    finisher,
  ];
}
```

Use existing action IDs from `packages/shared/src/constants/bossTemplateDefinitions.ts`:

- Spider: `boss_poison_spray`, `boss_venom_cloud`, `boss_root`
- Wolf/beast: `boss_terrifying_howl`, `boss_fear_howl`, `boss_frenzy`
- Bandit/goblin: `boss_smoke_bomb`, `boss_mark_for_death`, `boss_rally`, `boss_throwing_knives`
- Treant/golem: `boss_root`, `boss_bark_shield`, `boss_shield_wall`, `boss_earthquake`
- Spirit/fae/witch/elemental/caster: `boss_magic_attack`, `boss_weaken`, `boss_arcane_storm`
- Undead/abomination: `boss_wither`, `boss_shadow_bleed`, `boss_blight_cloud`

---

## Implementation Tasks

### Task 1: Shared Role Type and Legacy Normalizer

**Files:**

- Modify: `packages/shared/src/types/encounter.types.ts`
- Add: `packages/shared/src/types/encounter.types.test.ts`

- [ ] Add the new runtime role type and helpers:

```typescript
export type EncounterMobRole = 'trash' | 'elite' | 'mini_boss';
export type LegacyEncounterMobRole = EncounterMobRole | 'boss';

export function isEncounterMobRole(value: unknown): value is EncounterMobRole {
  return value === 'trash' || value === 'elite' || value === 'mini_boss';
}

export function normalizeEncounterMobRole(value: unknown): EncounterMobRole | null {
  if (isEncounterMobRole(value)) return value;
  if (value === 'boss') return 'mini_boss';
  return null;
}
```

- [ ] Update `EncounterMobSlot.role` to use the new `EncounterMobRole`.
- [ ] Add tests:

```typescript
import { describe, expect, it } from 'vitest';
import { isEncounterMobRole, normalizeEncounterMobRole } from './encounter.types';

describe('encounter role normalization', () => {
  it('accepts current encounter mob roles', () => {
    expect(isEncounterMobRole('trash')).toBe(true);
    expect(isEncounterMobRole('elite')).toBe(true);
    expect(isEncounterMobRole('mini_boss')).toBe(true);
  });

  it('normalizes legacy boss encounter slots to mini_boss', () => {
    expect(normalizeEncounterMobRole('boss')).toBe('mini_boss');
  });

  it('rejects invalid role values', () => {
    expect(normalizeEncounterMobRole('final_boss')).toBeNull();
    expect(normalizeEncounterMobRole(null)).toBeNull();
  });
});
```

- [ ] Run:

```powershell
rtk npm run test -w packages/shared -- encounter.types
```

Expected result: Vitest passes the new encounter role normalizer tests.

- [ ] Commit:

```powershell
git add packages/shared/src/types/encounter.types.ts packages/shared/src/types/encounter.types.test.ts
git commit -m "Add encounter mob role normalizer"
```

### Task 2: Add Encounter Role Tunables

**Files:**

- Modify: `packages/shared/src/constants/gameConstants.ts`

- [ ] Add `ENCOUNTER_SITE_ROLE_CONSTANTS` near the existing encounter-site constants:

```typescript
export const ENCOUNTER_SITE_ROLE_CONSTANTS = {
  MIN_ROOMS_FOR_PROMOTED_ROLES: 3,
  MINI_BOSS_CHANCE: 0.35,
  ROLE_STAT_MULTIPLIERS: {
    trash: {
      hp: 1,
      damageMin: 1,
      damageMax: 1,
      accuracy: 1,
      defence: 1,
      magicDefence: 1,
      evasion: 1,
      xp: 1,
    },
    elite: {
      hp: 1.6,
      damageMin: 1.15,
      damageMax: 1.15,
      accuracy: 1.08,
      defence: 1.08,
      magicDefence: 1.08,
      evasion: 1,
      xp: 1.4,
    },
    mini_boss: {
      hp: 2.4,
      damageMin: 1.3,
      damageMax: 1.3,
      accuracy: 1.12,
      defence: 1.12,
      magicDefence: 1.12,
      evasion: 1.05,
      xp: 2,
    },
  },
} as const;
```

- [ ] Keep the values in shared constants, not inline in API services.
- [ ] Run:

```powershell
rtk npm run build -w packages/shared
```

Expected result: `tsc` for `@pocketrealm/shared` succeeds.

- [ ] Commit:

```powershell
git add packages/shared/src/constants/gameConstants.ts
git commit -m "Add encounter site role tuning constants"
```

### Task 3: Pure Role Assignment Helper

**Files:**

- Add: `packages/game-engine/src/exploration/encounterRolePromotion.ts`
- Add: `packages/game-engine/src/exploration/encounterRolePromotion.test.ts`
- Modify: `packages/game-engine/src/index.ts`

- [ ] Create a pure helper that turns room layout into per-slot roles:

```typescript
import { ENCOUNTER_SITE_ROLE_CONSTANTS, type EncounterMobRole } from '@pocketrealm/shared';

export interface EncounterRoleRoomLayout {
  roomNumber: number;
  mobCount: number;
}

export interface EncounterRoleAssignment {
  room: number;
  role: EncounterMobRole;
}

export interface AssignEncounterRolesOptions {
  rng?: () => number;
  miniBossChance?: number;
}

export function assignEncounterRolesToRooms(
  rooms: readonly EncounterRoleRoomLayout[],
  options: AssignEncounterRolesOptions = {},
): EncounterRoleAssignment[] {
  const rng = options.rng ?? Math.random;
  const miniBossChance = options.miniBossChance ?? ENCOUNTER_SITE_ROLE_CONSTANTS.MINI_BOSS_CHANCE;
  const assignments = rooms.flatMap((room) =>
    Array.from({ length: room.mobCount }, () => ({ room: room.roomNumber, role: 'trash' as EncounterMobRole })),
  );

  if (rooms.length < ENCOUNTER_SITE_ROLE_CONSTANTS.MIN_ROOMS_FOR_PROMOTED_ROLES || assignments.length === 0) {
    return assignments;
  }

  const lastRoom = rooms[rooms.length - 1]!;
  const finalIndexes = assignments
    .map((assignment, index) => ({ assignment, index }))
    .filter(({ assignment }) => assignment.room === lastRoom.roomNumber)
    .map(({ index }) => index);

  if (finalIndexes.length === 0) return assignments;

  const shouldAddMiniBoss = rng() < miniBossChance;
  if (shouldAddMiniBoss) {
    assignments[finalIndexes[finalIndexes.length - 1]!]!.role = 'mini_boss';

    const finalEliteIndex = finalIndexes.find((index) => assignments[index]!.role === 'trash');
    if (finalEliteIndex !== undefined) {
      assignments[finalEliteIndex]!.role = 'elite';
    } else {
      promoteLastTrashBeforeRoom(assignments, lastRoom.roomNumber);
    }
  } else {
    assignments[finalIndexes[finalIndexes.length - 1]!]!.role = 'elite';
  }

  if (rooms.length >= 4) {
    const remainingFinalTrash = finalIndexes.find((index) => assignments[index]!.role === 'trash');
    if (remainingFinalTrash !== undefined) {
      assignments[remainingFinalTrash]!.role = 'elite';
    } else {
      promoteLastTrashBeforeRoom(assignments, lastRoom.roomNumber);
    }
  }

  return assignments;
}

function promoteLastTrashBeforeRoom(assignments: EncounterRoleAssignment[], roomNumber: number): void {
  for (let index = assignments.length - 1; index >= 0; index -= 1) {
    const assignment = assignments[index]!;
    if (assignment.room < roomNumber && assignment.role === 'trash') {
      assignment.role = 'elite';
      return;
    }
  }
}
```

- [ ] Export it from `packages/game-engine/src/index.ts`:

```typescript
export * from './exploration/encounterRolePromotion';
```

- [ ] Add tests covering:
  - 1-room and 2-room layouts stay all trash.
  - 3-room, mini-boss roll fails: final room contains an elite.
  - 3-room, mini-boss roll succeeds and final room has capacity: final room contains `mini_boss` and `elite`.
  - 3-room, mini-boss roll succeeds and final room has one slot: `mini_boss` final room, `elite` penultimate room.
  - 4-room, mini-boss roll fails: final room contains the required elite pressure.
  - No output has an early-only elite with later all-trash rooms.

Example tests:

```typescript
import { describe, expect, it } from 'vitest';
import { assignEncounterRolesToRooms } from './encounterRolePromotion';

describe('assignEncounterRolesToRooms', () => {
  it('does not force promoted roles before 3 rooms', () => {
    const result = assignEncounterRolesToRooms([
      { roomNumber: 1, mobCount: 2 },
      { roomNumber: 2, mobCount: 2 },
    ], { rng: () => 0 });

    expect(result.map((assignment) => assignment.role)).toEqual(['trash', 'trash', 'trash', 'trash']);
  });

  it('puts the guaranteed elite in the final room when mini-boss does not roll', () => {
    const result = assignEncounterRolesToRooms([
      { roomNumber: 1, mobCount: 2 },
      { roomNumber: 2, mobCount: 2 },
      { roomNumber: 3, mobCount: 2 },
    ], { rng: () => 0.99, miniBossChance: 0.35 });

    expect(result.filter((assignment) => assignment.room === 3).some((assignment) => assignment.role === 'elite')).toBe(true);
    expect(result.some((assignment) => assignment.role === 'mini_boss')).toBe(false);
  });

  it('puts mini_boss and elite in the final room when capacity allows', () => {
    const result = assignEncounterRolesToRooms([
      { roomNumber: 1, mobCount: 2 },
      { roomNumber: 2, mobCount: 2 },
      { roomNumber: 3, mobCount: 2 },
    ], { rng: () => 0, miniBossChance: 0.35 });

    expect(result.filter((assignment) => assignment.room === 3).map((assignment) => assignment.role).sort()).toEqual(['elite', 'mini_boss']);
  });

  it('uses the penultimate room for the guaranteed elite when final room only has one mini-boss slot', () => {
    const result = assignEncounterRolesToRooms([
      { roomNumber: 1, mobCount: 2 },
      { roomNumber: 2, mobCount: 2 },
      { roomNumber: 3, mobCount: 1 },
    ], { rng: () => 0, miniBossChance: 0.35 });

    expect(result.find((assignment) => assignment.room === 3)?.role).toBe('mini_boss');
    expect(result.filter((assignment) => assignment.room === 2).some((assignment) => assignment.role === 'elite')).toBe(true);
  });
});
```

- [ ] Run:

```powershell
rtk npm run test -w packages/game-engine -- encounterRolePromotion
```

Expected result: new role placement tests pass.

- [ ] Commit:

```powershell
git add packages/game-engine/src/exploration/encounterRolePromotion.ts packages/game-engine/src/exploration/encounterRolePromotion.test.ts packages/game-engine/src/index.ts
git commit -m "Add encounter site role assignment helper"
```

### Task 4: Use Instance-Level Role Promotion in Site Generation

**Files:**

- Modify: `apps/api/src/services/exploration/helpers.ts`
- Modify: `apps/api/src/services/exploration/helpers.test.ts`

- [ ] Import the new helper:

```typescript
import {
  assignEncounterRolesToRooms,
  generateRoomAssignments,
  rollMobPrefix,
  selectTierWithBleedthrough,
} from '@pocketrealm/game-engine';
```

- [ ] Replace role-specific base selection with instance-level role assignment:

```typescript
const { rooms } = generateRoomAssignments(size);
const roleAssignments = assignEncounterRolesToRooms(rooms);
```

- [ ] Replace `pickFamilyMemberByRole` with base-pool selection. Do not require an `elite` family member to generate an elite slot.

Suggested helpers:

```typescript
function isPermanentEncounterFamilyRole(role: string): boolean {
  return role === 'trash' || role === 'elite' || role === 'mini_boss' || role === 'boss';
}

function isLegacyBossFamilyRole(role: string): boolean {
  return role === 'boss' || role === 'mini_boss';
}

function pickBaseFamilyMember(members: ZoneFamilyMember[], role: EncounterMobRole): ZoneFamilyMember | null {
  const nonBossPool = members.filter((member) =>
    isPermanentEncounterFamilyRole(member.role) && !isLegacyBossFamilyRole(member.role),
  );

  const miniBossPool = members.filter((member) =>
    isPermanentEncounterFamilyRole(member.role),
  );

  const pool = role === 'mini_boss'
    ? (miniBossPool.length > 0 ? miniBossPool : members)
    : (nonBossPool.length > 0 ? nonBossPool : members);

  if (pool.length === 0) return null;
  return pool[randomIntInclusive(0, pool.length - 1)] ?? null;
}
```

Reasoning:

- `trash` and `elite` slots use the same non-mini-boss base pool so a base mob like `Web Spinner` can be promoted to elite.
- `mini_boss` slots may use any permanent encounter family member, which allows a finale to pick a stronger family member when available without requiring one.
- Legacy seeded `boss` family role is accepted until seed data is renamed.

- [ ] Keep tier bleedthrough:

```typescript
function pickMemberWithBleedthrough(role: EncounterMobRole): ZoneFamilyMember | null {
  const selectedTier = selectTierWithBleedthrough(currentTier, tiers);
  for (let tier = selectedTier; tier >= 1; tier -= 1) {
    const tierMembers = membersByTier.get(tier) ?? [];
    if (tierMembers.length === 0) continue;
    const picked = pickBaseFamilyMember(tierMembers, role);
    if (picked) return picked;
  }
  return pickBaseFamilyMember(eligibleZoneMembers, role);
}
```

- [ ] Build slots from room-role assignments:

```typescript
const mobs: EncounterMobSlot[] = [];
let slot = 0;

for (const assignment of roleAssignments) {
  const member = pickMemberWithBleedthrough(assignment.role);
  if (!member) continue;

  mobs.push({
    slot: slot++,
    mobTemplateId: member.mobTemplate.id,
    role: assignment.role,
    prefix: rollMobPrefix(),
    status: 'alive',
    room: assignment.room,
  });
}
```

- [ ] Preserve the existing fallback for empty generated mobs, but set role to `trash`.
- [ ] Update tests in `helpers.test.ts`:
  - Mock `generateRoomAssignments` to return at least three rooms for large sites.
  - Mock or use `assignEncounterRolesToRooms` so the test can assert final-room promotion.
  - Assert that no generated slot role is `boss`.
  - Add a regression where only one eligible base template exists and it appears as both `trash` and `elite`.
  - Update the existing tier-eligible test to use `mini_boss` instead of `boss` in seed-like input, and confirm lower-tier fallback still works.

- [ ] Run:

```powershell
rtk npm run test -w apps/api -- exploration/helpers
```

Expected result: exploration helper tests pass and generated site mobs use `mini_boss` only when the role helper assigns it.

- [ ] Commit:

```powershell
git add apps/api/src/services/exploration/helpers.ts apps/api/src/services/exploration/helpers.test.ts
git commit -m "Promote encounter mobs at the instance level"
```

### Task 5: Make Admin Encounter Spawn Use the Same Role Helper

**Files:**

- Modify: `apps/api/src/services/admin/zoneAdminService.ts`
- Add or modify: `apps/api/src/services/admin/zoneAdminService.test.ts`

- [ ] Replace the manual large/medium role assignment in `spawnAdminEncounter` with `assignEncounterRolesToRooms`.
- [ ] Use the same base-template selection principle as normal exploration:

```typescript
const roomAssignments = generateRoomAssignments(input.size);
const roleAssignments = assignEncounterRolesToRooms(roomAssignments.rooms);
```

- [ ] Generate admin-spawned mobs from `roleAssignments`.
- [ ] Do not emit `role: 'boss'`.
- [ ] Add/adjust tests:
  - Large admin encounter with 3+ rooms uses `elite` and optional `mini_boss`, never `boss`.
  - Final-room placement follows the pure helper result.

- [ ] Run:

```powershell
rtk npm run test -w apps/api -- zoneAdminService
```

Expected result: admin encounter generation follows the same role model as normal exploration.

- [ ] Commit:

```powershell
git add apps/api/src/services/admin/zoneAdminService.ts apps/api/src/services/admin/zoneAdminService.test.ts
git commit -m "Use encounter role promotion for admin spawns"
```

### Task 6: Normalize Serialized Encounter Site Roles

**Files:**

- Modify: `apps/api/src/services/combat/helpers.ts`
- Add or modify: `apps/api/src/services/combat/helpers.test.ts`

- [ ] Import `normalizeEncounterMobRole` from shared:

```typescript
import {
  EXPLORATION_CONSTANTS,
  normalizeEncounterMobRole,
  type PotionConsumed,
  type EncounterSiteSize,
  type EncounterMobRole,
  type EncounterMobStatus,
  type EncounterMobSlot,
} from '@pocketrealm/shared';
```

- [ ] Replace the current role parse:

```typescript
const role = normalizeEncounterMobRole(row.role);
```

- [ ] Keep `roleOrder` highest priority for `mini_boss`:

```typescript
function roleOrder(role: EncounterMobRole): number {
  if (role === 'trash') return 0;
  if (role === 'elite') return 1;
  return 2;
}
```

- [ ] Add tests:
  - Parses current `mini_boss` role.
  - Parses legacy `boss` JSON as `mini_boss`.
  - Rejects invalid roles.
  - Sorts `trash`, `elite`, `mini_boss` in existing helper order.

- [ ] Run:

```powershell
rtk npm run test -w apps/api -- combat/helpers
```

Expected result: parsing compatibility works for old site JSON and new roles.

- [ ] Commit:

```powershell
git add apps/api/src/services/combat/helpers.ts apps/api/src/services/combat/helpers.test.ts
git commit -m "Normalize legacy encounter site boss roles"
```

### Task 7: Add Role Stat Scaling and Action Template Resolver

**Files:**

- Add: `apps/api/src/services/encounterSiteMobRoleService.ts`
- Add: `apps/api/src/services/encounterSiteMobRoleService.test.ts`
- Modify: `apps/api/src/services/encounterSiteCombatCore.ts`
- Modify: `apps/api/src/services/encounterSiteCombatCore.test.ts`

- [ ] Create a focused API service for role modifiers and encounter-site mob rotations. Keep DB access out of this file.

Implementation shape:

```typescript
import {
  ENCOUNTER_SITE_ROLE_CONSTANTS,
  type BossTemplateAction,
  type DamageType,
  type EncounterMobRole,
  type MobTemplate,
} from '@pocketrealm/shared';

type EncounterRoleTemplate = Pick<
  MobTemplate,
  'hp' | 'accuracy' | 'defence' | 'magicDefence' | 'evasion' | 'damageMin' | 'damageMax' | 'xpReward'
>;

export function applyEncounterRoleModifiers<TMob extends EncounterRoleTemplate>(
  mob: TMob,
  role: EncounterMobRole,
): TMob {
  const multipliers = ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_STAT_MULTIPLIERS[role];
  const damageMin = scale(mob.damageMin, multipliers.damageMin, 1);
  const damageMax = Math.max(damageMin, scale(mob.damageMax, multipliers.damageMax, 1));

  return {
    ...mob,
    hp: scale(mob.hp, multipliers.hp, 1),
    accuracy: scale(mob.accuracy, multipliers.accuracy, 0),
    defence: scale(mob.defence, multipliers.defence, 0),
    magicDefence: scale(mob.magicDefence, multipliers.magicDefence, 0),
    evasion: scale(mob.evasion, multipliers.evasion, 0),
    damageMin,
    damageMax,
    xpReward: scale(mob.xpReward, multipliers.xp, 1),
  };
}

function scale(value: number, multiplier: number, minimum: number): number {
  return Math.max(minimum, Math.round(value * multiplier));
}
```

- [ ] Add `resolveEncounterRoleActionTemplate` in the same service. Use `familyName`, `mobName`, `damageType`, and role.
- [ ] Add a helper to infer family theme without hard-coding IDs:

```typescript
function inferFamilyTheme(familyName: string | null, mobName: string, damageType: DamageType): FamilyTheme {
  const text = `${familyName ?? ''} ${mobName}`.toLowerCase();
  if (text.includes('spider') || text.includes('web') || text.includes('venom')) return 'spider';
  if (text.includes('wolf') || text.includes('warg') || text.includes('coyote')) return 'wolf';
  if (text.includes('bandit') || text.includes('goblin')) return 'bandit';
  if (text.includes('treant') || text.includes('golem') || text.includes('bark')) return 'treant';
  if (text.includes('spirit') || text.includes('fae') || text.includes('wisp') || text.includes('witch')) return 'spirit';
  if (text.includes('undead') || text.includes('skeleton') || text.includes('wraith') || text.includes('lich')) return 'undead';
  if (damageType === 'magic') return 'caster';
  return 'default';
}
```

- [ ] Keep elite specials below world-boss intensity. Avoid `boss_impale` and `boss_execution_strike` in encounter sites.
- [ ] In `loadRoomMobsAsRaidState`, select enough fields to use `applyMobPrefix`:

```typescript
select: {
  id: true,
  name: true,
  zoneId: true,
  level: true,
  hp: true,
  accuracy: true,
  defence: true,
  magicDefence: true,
  evasion: true,
  damageMin: true,
  damageMax: true,
  damageType: true,
  xpReward: true,
  encounterWeight: true,
  spellPattern: true,
},
```

- [ ] Load the family name once:

```typescript
const [family, cachedZoneEvents, cachedWorldEvents] = await Promise.all([
  prisma.mobFamily.findUnique({ where: { id: mobFamilyId }, select: { name: true } }),
  getActiveEventsForZone(zoneId),
  getActiveWorldWideEvents(),
]);
```

- [ ] Apply modifiers in order in `loadRoomMobsAsRaidState`:

```typescript
const prefixedTemplate = applyMobPrefix(template, slot.prefix);
const zoneModifiedTemplate = {
  ...prefixedTemplate,
  damageType: prefixedTemplate.damageType,
  hp: Math.max(1, Math.round(prefixedTemplate.hp * Math.max(0.1, zoneModifiers.mobHpMultiplier))),
  damageMin: Math.max(1, Math.round(prefixedTemplate.damageMin * Math.max(0.1, zoneModifiers.mobDamageMultiplier))),
  damageMax: Math.max(1, Math.round(prefixedTemplate.damageMax * Math.max(0.1, zoneModifiers.mobDamageMultiplier))),
};
const roleModifiedTemplate = applyEncounterRoleModifiers(zoneModifiedTemplate, slot.role);
const modifiedTemplate = {
  ...roleModifiedTemplate,
  actionTemplate: resolveEncounterRoleActionTemplate({
    role: slot.role,
    damageType: roleModifiedTemplate.damageType,
    familyName: family?.name ?? null,
    mobName: roleModifiedTemplate.name,
  }),
};
```

- [ ] Store XP after prefix and role modifiers:

```typescript
mobXpByTemplateId[t.id] = roleModifiedTemplate.xpReward;
```

If the same `mobTemplateId` can appear with different roles/prefixes in one room, `mobXpByTemplateId` is not precise enough. Prefer changing the return shape to `mobXpByEncounterMobId`:

```typescript
return { mobs: expeditionMobs, mobXpByEncounterMobId };
```

Then update `computeDefeatedMobXp` to look up `makeEncounterMobId(slot.slot)`. This is the correct approach because role and prefix are slot-level modifiers.

- [ ] Rename `mobXpByTemplateId` to `mobXpByEncounterMobId` across:
  - `apps/api/src/services/encounterSiteCombatCore.ts`
  - `apps/api/src/services/encounterSiteCombatService.ts`
  - `apps/api/src/services/encounterSiteManualCombat.ts`

- [ ] Update `computeDefeatedMobXp`:

```typescript
export function computeDefeatedMobXp(
  defeatedMobIds: Set<string>,
  roomMobs: EncounterMobSlot[],
  mobXpByEncounterMobId: Record<string, number>,
): number {
  let totalXp = 0;
  for (const slot of roomMobs) {
    const mobId = makeEncounterMobId(slot.slot);
    if (!defeatedMobIds.has(mobId)) continue;
    const xp = mobXpByEncounterMobId[mobId];
    if (xp === undefined) continue;
    totalXp += xp;
  }
  return totalXp;
}
```

- [ ] Add service tests:
  - `applyEncounterRoleModifiers` increases elite HP/damage/XP relative to trash.
  - `mini_boss` scales more than elite.
  - `resolveEncounterRoleActionTemplate` gives trash one basic action.
  - Spider elite gets a spider/venom/root style action.
  - Magic mini-boss includes a telegraphed `boss_arcane_storm`.
  - Physical mini-boss includes a telegraphed `boss_earthquake`.

- [ ] Add combat core tests:
  - A trash and elite slot with the same `mobTemplateId` produce different HP/action templates.
  - A `gigantic` or `frail` prefix stacks with elite role.
  - `mobXpByEncounterMobId` differs per slot when the same template appears with different roles/prefixes.

- [ ] Run:

```powershell
rtk npm run test -w apps/api -- encounterSiteMobRoleService
rtk npm run test -w apps/api -- encounterSiteCombatCore
```

Expected result: role scaling, prefix stacking, action templates, and per-slot XP all pass.

- [ ] Commit:

```powershell
git add apps/api/src/services/encounterSiteMobRoleService.ts apps/api/src/services/encounterSiteMobRoleService.test.ts apps/api/src/services/encounterSiteCombatCore.ts apps/api/src/services/encounterSiteCombatCore.test.ts apps/api/src/services/encounterSiteCombatService.ts apps/api/src/services/encounterSiteManualCombat.ts
git commit -m "Apply encounter role combat modifiers"
```

### Task 8: Add Role Metadata to Combat Snapshots and UI Labels

**Files:**

- Modify: `apps/api/src/services/encounterSiteCombatCore.ts`
- Modify: `apps/web/src/lib/api/combat.ts`
- Modify: `apps/web/src/components/encounter/EncounterSiteCombatView.tsx`
- Add or modify: related web tests if the component already has local coverage

- [ ] Add role to the initial mob snapshot returned to the frontend:

```typescript
export function toInitialMobSnapshot(mobs: ExpeditionMobState[]) {
  return mobs.map(m => ({
    mobId: m.id,
    slot: parseEncounterMobSlot(m.id) ?? 0,
    name: m.name,
    prefix: m.prefix,
    role: m.role,
    hp: m.hp,
    maxHp: m.maxHp,
  }));
}
```

`ExpeditionMobState` may not currently carry `role`. If it does not, extend `buildEncounterRaidMob` to copy `slot.role`:

```typescript
role: slot.role,
```

Only add this if the shared `ExpeditionMobState` type supports or should support it. If not, preserve type safety by mapping roles from the original `EncounterMobSlot[]` when building snapshots instead of adding undeclared fields.

- [ ] Add a small label helper for encounter roles:

```typescript
export function encounterMobRoleBadge(role: 'trash' | 'elite' | 'mini_boss'): { label: string; color: string } {
  switch (role) {
    case 'elite':
      return { label: 'Elite', color: 'var(--rpg-blue-light)' };
    case 'mini_boss':
      return { label: 'Mini-Boss', color: 'var(--rpg-gold)' };
    case 'trash':
    default:
      return { label: 'Normal', color: 'var(--rpg-text-secondary)' };
  }
}
```

- [ ] Surface `Elite` / `Mini-Boss` next to mob names where encounter-site room mobs are displayed. Do not show `Boss` for encounter-site roles.
- [ ] Ensure prefix and role display combine cleanly:
  - `Gigantic Elite Web Spinner`
  - `Frail Mini-Boss Web Spinner`
  - Normal prefixed mobs remain `Gigantic Web Spinner`

- [ ] Run:

```powershell
rtk npm run test -w apps/web -- EncounterSiteCombatView
rtk npm run build:web
```

Expected result: web types build and any focused component tests pass.

- [ ] Commit:

```powershell
git add apps/api/src/services/encounterSiteCombatCore.ts apps/web/src/lib/api/combat.ts apps/web/src/components/encounter/EncounterSiteCombatView.tsx
git commit -m "Show encounter site promoted mob roles"
```

### Task 9: Rename Permanent Family Seed Role `boss` to `mini_boss`

**Files:**

- Modify: `packages/database/prisma/seed-data/families.ts`

- [ ] Update the comment:

```typescript
// Links each mob template to its family with a role (trash/elite/mini_boss)
```

- [ ] Replace permanent encounter-site family member `role: 'boss'` values with `role: 'mini_boss'`.
- [ ] Do not change expedition roles:
  - Keep `expedition_mini_boss`
  - Keep `expedition_boss`
- [ ] Do not change world boss `MobTemplate.isBoss` values in `packages/database/prisma/seed-data/mobs.ts`.
- [ ] No Prisma migration is needed because `MobFamilyMember.role` is a string column.
- [ ] Run:

```powershell
rtk npm run build -w packages/database
```

Expected result: Prisma generate and database TypeScript build succeed.

- [ ] Commit:

```powershell
git add packages/database/prisma/seed-data/families.ts
git commit -m "Rename encounter family boss role to mini boss"
```

### Task 10: Search and Remove Encounter-Site `boss` Role Assumptions

**Files:**

- Review all matches from:

```powershell
rg "role: 'boss'|role === 'boss'|EncounterMobRole|bossCount|mini_boss" apps packages -g "*.ts" -g "*.tsx"
```

- [ ] Update encounter-site-specific code to use `mini_boss`.
- [ ] Leave world boss systems alone:
  - `WorldEventType = 'boss'`
  - boss encounter services/routes
  - `MobTemplate.isBoss`
  - expedition `final_boss`
  - expedition `expedition_boss`
- [ ] Update tests that were asserting encounter-site `boss` to assert `mini_boss` or legacy normalization.
- [ ] Run:

```powershell
rtk npm run typecheck
```

Expected result: TypeScript references to encounter-site `boss` role are gone or explicitly legacy-only.

- [ ] Commit:

```powershell
git add apps packages
git commit -m "Remove encounter site boss role assumptions"
```

### Task 11: Focused Balance Verification

**Files:**

- Modify tests only if failures identify a real missed contract from this plan.

- [ ] Run targeted tests:

```powershell
rtk npm run test -w packages/shared -- encounter.types
rtk npm run test -w packages/game-engine -- encounterRolePromotion
rtk npm run test -w apps/api -- exploration/helpers
rtk npm run test -w apps/api -- combat/helpers
rtk npm run test -w apps/api -- encounterSiteMobRoleService
rtk npm run test -w apps/api -- encounterSiteCombatCore
```

Expected result: all focused tests pass.

- [ ] Run package builds:

```powershell
rtk npm run build:api
rtk npm run build:web
```

Expected result: API and web builds pass.

- [ ] Run full typecheck:

```powershell
rtk npm run typecheck
```

Expected result: project TypeScript build passes.

### Task 12: Simplify Touched Diff

**Required by project instructions after code changes.**

- [ ] Use `superpowers:simplify` on the touched diff only.
- [ ] Look specifically for:
  - Duplicate role assignment logic between exploration and admin spawns.
  - Inline multiplier values outside `gameConstants.ts`.
  - Unsafe `any`.
  - Action rotation helpers that should be private.
  - Broad refactors outside encounter-site role work.
- [ ] Apply only worthwhile simplifications.
- [ ] Re-run the focused tests from Task 11 that cover changed files.
- [ ] Commit simplification changes if any:

```powershell
git add apps packages
git commit -m "Simplify encounter role promotion implementation"
```

Expected result: either a small simplification commit exists, or the working tree remains clean after confirming no worthwhile simplifications.

### Task 13: Final Verification and PR Preparation

- [ ] Run final verification:

```powershell
rtk npm run verify:ci
```

Expected result: typecheck, builds, engine/API/shared/web/discord tests all pass.

- [ ] Check status:

```powershell
rtk git status --short --branch
```

Expected result: branch `codex/encounter-site-role-promotion-plan` is clean.

- [ ] Prepare PR summary:

```markdown
## Summary
- Adds instance-level encounter mob roles: trash, elite, and mini_boss
- Guarantees promoted final-room pressure for 3+ room encounter sites
- Applies prefix + role stat scaling and role/family-aware action rotations
- Normalizes legacy encounter-site boss JSON to mini_boss while preserving world boss systems

## Tests
- npm run test -w packages/shared -- encounter.types
- npm run test -w packages/game-engine -- encounterRolePromotion
- npm run test -w apps/api -- exploration/helpers
- npm run test -w apps/api -- combat/helpers
- npm run test -w apps/api -- encounterSiteMobRoleService
- npm run test -w apps/api -- encounterSiteCombatCore
- npm run build:api
- npm run build:web
- npm run typecheck
- npm run verify:ci
```

---

## Acceptance Criteria

- [ ] `EncounterMobRole` no longer includes `boss`.
- [ ] Legacy serialized `boss` encounter-site slots parse as `mini_boss`.
- [ ] New generated encounter-site mobs never use `role: 'boss'`.
- [ ] Every 3+ room encounter site has at least one elite.
- [ ] A mini-boss can only appear in the final room.
- [ ] If no mini-boss appears, the required elite pressure is in the final room.
- [ ] A site cannot have its only promoted mob in an early room followed by later all-trash rooms.
- [ ] Same base mob template can appear as normal and elite in the same encounter site.
- [ ] Prefixes stack with roles and affect encounter-site combat stats.
- [ ] Role scaling affects combat HP, damage, accuracy/defences, and XP.
- [ ] Elite and mini-boss mobs use non-trivial action rotations.
- [ ] World boss code continues to use `boss` terminology and `MobTemplate.isBoss`.
- [ ] Focused tests and final verification pass.

---

## Risk Notes

- Per-template XP maps are insufficient once role and prefix become slot-level combat modifiers. Use per-encounter-mob ID XP to prevent a `trash` and `elite` with the same `mobTemplateId` from granting the same XP.
- `applyMobPrefix` requires more fields than `loadRoomMobsAsRaidState` currently selects. Include all `MobTemplate` fields it needs or create a narrower local prefix helper with strict types.
- Existing action IDs use the `boss_` prefix. This is acceptable for implementation reuse, but UI and encounter roles must not call these mobs `Boss`.
- Keep mini-boss rotations below world boss lethality. Avoid world-boss-only execution-style actions for encounter sites.
- Do not alter expedition `final_boss` or world-event `boss` systems while renaming encounter-site roles.

---

Plan complete and saved to `docs/superpowers/plans/2026-06-19-encounter-site-role-promotion.md`. Two execution options:

1. Subagent-Driven (recommended): Use `superpowers:subagent-driven-development` to split pure helper/shared types, API generation/combat, and UI/seed updates into focused workers with review checkpoints.
2. Inline Execution: Use `superpowers:executing-plans` to implement the checklist sequentially in this thread.

Which approach?
