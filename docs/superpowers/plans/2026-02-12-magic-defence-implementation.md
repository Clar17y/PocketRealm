# Magic Defence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make magic attacks use `magicDefence` instead of `defence`, add `magicDefence` and `damageType` to mobs, and let prefixes override damage type.

**Architecture:** Add `damageType: 'physical' | 'magic'` to `CombatantStats` and `MobTemplate`. Combat engine branches on `damageType` to pick the right defence stat. Prefixes can override `damageType` and scale `magicDefence`. DB migration adds two columns to `mob_templates`.

**Tech Stack:** TypeScript, Prisma (PostgreSQL), vitest

**Design doc:** `docs/superpowers/specs/2026-02-12-magic-defence-design.md` — contains all mob values and prefix multipliers.

---

### Task 1: Add `damageType` to shared types

**Files:**
- Modify: `packages/shared/src/types/combat.types.ts`

**Step 1: Add `damageType` to `MobTemplate` interface**

At `combat.types.ts:3-17`, add two fields to `MobTemplate`:

```typescript
export interface MobTemplate {
  id: string;
  name: string;
  zoneId: string;
  level: number;
  hp: number;
  accuracy: number;
  defence: number;
  magicDefence: number;           // NEW
  evasion: number;
  damageMin: number;
  damageMax: number;
  xpReward: number;
  encounterWeight: number;
  spellPattern: SpellAction[];
  damageType: 'physical' | 'magic'; // NEW
}
```

**Step 2: Add `damageType` to `CombatantStats` interface**

At `combat.types.ts:94-108`, add one field:

```typescript
export interface CombatantStats {
  hp: number;
  maxHp: number;
  attack: number;
  accuracy: number;
  defence: number;
  magicDefence: number;
  dodge: number;
  evasion: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  critChance?: number;
  critDamage?: number;
  damageType: 'physical' | 'magic'; // NEW
}
```

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: successful build

**Step 4: Commit**

```
feat: add damageType to MobTemplate and CombatantStats
```

---

### Task 2: Add `magicDefence` and `damageTypeOverride` to prefix types

**Files:**
- Modify: `packages/shared/src/types/mobPrefix.types.ts`

**Step 1: Update `MobPrefixDefinition` interface**

```typescript
export interface MobPrefixDefinition {
  key: string;
  displayName: string;
  description: string;
  weight: number;
  statMultipliers: {
    hp?: number;
    accuracy?: number;
    defence?: number;
    magicDefence?: number;         // NEW
    evasion?: number;
    damageMin?: number;
    damageMax?: number;
  };
  xpMultiplier: number;
  dropChanceMultiplier: number;
  spellTemplate: SpellTemplate | null;
  damageTypeOverride?: 'physical' | 'magic'; // NEW
}
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: successful build

**Step 3: Commit**

```
feat: add magicDefence multiplier and damageTypeOverride to prefix types
```

---

### Task 3: Update prefix definitions with magicDefence multipliers

**Files:**
- Modify: `packages/shared/src/constants/mobPrefixes.ts`

**Step 1: Add `magicDefence` and `damageTypeOverride` to each prefix**

Update each prefix definition. Values from the design doc:

- **weak**: add `magicDefence: 0.7` to statMultipliers
- **frail**: add `magicDefence: 0.5` to statMultipliers
- **tough**: add `magicDefence: 1.3` to statMultipliers
- **gigantic**: add `magicDefence: 1.2` to statMultipliers
- **swift**: add `magicDefence: 0.8` to statMultipliers
- **ferocious**: add `magicDefence: 0.9` to statMultipliers
- **shaman**: add `magicDefence: 1.3` to statMultipliers, add `damageTypeOverride: 'magic'`
- **venomous**: no `magicDefence` multiplier needed (defaults to 1.0)
- **ancient**: add `magicDefence: 1.3` to statMultipliers
- **spectral**: add `magicDefence: 1.5` to statMultipliers, add `damageTypeOverride: 'magic'`

Example for shaman:
```typescript
{
  key: 'shaman',
  displayName: 'Shaman',
  description: 'Mystic variant that channels periodic spell bursts.',
  weight: 3,
  statMultipliers: { accuracy: 0.8, defence: 0.8, magicDefence: 1.3, damageMin: 0.8, damageMax: 0.8 },
  xpMultiplier: 1.5,
  dropChanceMultiplier: 1.3,
  damageTypeOverride: 'magic',
  spellTemplate: { startRound: 3, interval: 3, damageFormula: 'avg', damageMultiplier: 1.2, actionName: 'Shamanic Bolt' },
},
```

**Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: successful build

**Step 3: Commit**

```
feat: add magicDefence multipliers and damageTypeOverride to prefix definitions
```

---

### Task 4: Update `applyMobPrefix` to handle new fields

**Files:**
- Modify: `packages/game-engine/src/combat/mobPrefixes.ts`
- Test: `packages/game-engine/src/combat/mobPrefixes.test.ts`

**Step 1: Write failing tests**

Add to `mobPrefixes.test.ts`. Update the `baseMob` fixture to include the two new `MobTemplate` fields:

```typescript
const baseMob: MobTemplate = {
  id: 'mob-1',
  name: 'Forest Rat',
  zoneId: 'zone-1',
  level: 1,
  hp: 15,
  accuracy: 8,
  defence: 3,
  magicDefence: 2,        // NEW
  evasion: 2,
  damageMin: 1,
  damageMax: 4,
  xpReward: 10,
  encounterWeight: 120,
  spellPattern: [{ round: 3, action: 'Base Spell', damage: 3 }],
  damageType: 'physical', // NEW
};
```

Then add these test cases:

```typescript
it('scales magicDefence with prefix multiplier', () => {
  const result = applyMobPrefix(baseMob, 'tough');
  // tough has magicDefence: 1.3, baseMob.magicDefence = 2 → floor(2 * 1.3) = 2
  expect(result.magicDefence).toBe(2);
});

it('preserves base mob damageType when prefix has no override', () => {
  const result = applyMobPrefix(baseMob, 'tough');
  expect(result.damageType).toBe('physical');
});

it('overrides damageType when prefix has damageTypeOverride', () => {
  const result = applyMobPrefix(baseMob, 'shaman');
  expect(result.damageType).toBe('magic');
});

it('preserves magic damageType when prefix has no override', () => {
  const magicMob: MobTemplate = { ...baseMob, damageType: 'magic' };
  const result = applyMobPrefix(magicMob, 'tough');
  expect(result.damageType).toBe('magic');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/mobPrefixes.test.ts`
Expected: FAIL — `magicDefence` not present on result, `damageType` not present

**Step 3: Update `applyMobPrefix` implementation**

In `packages/game-engine/src/combat/mobPrefixes.ts`, update `applyMobPrefix()`:

After the line `const evasion = scaleStat(mob.evasion, prefix.statMultipliers.evasion, 0);` add:
```typescript
const magicDefence = scaleStat(mob.magicDefence, prefix.statMultipliers.magicDefence, 0);
```

After the line `const xpReward = scaleStat(mob.xpReward, prefix.xpMultiplier, 1);` (or wherever appropriate), determine `damageType`:
```typescript
const damageType = prefix.damageTypeOverride ?? mob.damageType;
```

In the return object, add `magicDefence` and `damageType`:
```typescript
return {
  ...mob,
  name: `${prefix.displayName} ${mob.name}`,
  hp,
  level: mob.level,
  accuracy,
  defence,
  magicDefence,
  evasion,
  damageMin,
  damageMax: normalizedDamageMax,
  xpReward,
  spellPattern,
  damageType,
  mobPrefix: prefix.key,
  mobDisplayName: `${prefix.displayName} ${mob.name}`,
  dropChanceMultiplier: prefix.dropChanceMultiplier,
};
```

Also update the no-prefix case (when `prefix` is null) to pass through `magicDefence` and `damageType`:
```typescript
if (!prefix) {
  return {
    ...mob,
    mobPrefix: null,
    mobDisplayName: mob.name,
    dropChanceMultiplier: 1,
  };
}
```
The spread of `...mob` already includes these fields, so no change needed for the no-prefix case.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/combat/mobPrefixes.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: applyMobPrefix scales magicDefence and applies damageTypeOverride
```

---

### Task 5: Update `buildPlayerCombatStats` to set `damageType`

**Files:**
- Modify: `packages/game-engine/src/combat/damageCalculator.ts`
- Test: `packages/game-engine/src/combat/damageCalculator.test.ts`

**Step 1: Write failing tests**

Add to the `buildPlayerCombatStats` describe block in `damageCalculator.test.ts`:

```typescript
it('sets damageType to physical for melee attackStyle', () => {
  const stats = buildPlayerCombatStats(
    80, 100,
    { attackStyle: 'melee', skillLevel: 10, attributes: { vitality: 5, strength: 5, dexterity: 0, intelligence: 0, luck: 0, evasion: 4 } },
    { attack: 5, rangedPower: 0, magicPower: 0, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
  );
  expect(stats.damageType).toBe('physical');
});

it('sets damageType to physical for ranged attackStyle', () => {
  const stats = buildPlayerCombatStats(
    80, 100,
    { attackStyle: 'ranged', skillLevel: 10, attributes: { vitality: 5, strength: 0, dexterity: 5, intelligence: 0, luck: 0, evasion: 4 } },
    { attack: 0, rangedPower: 5, magicPower: 0, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
  );
  expect(stats.damageType).toBe('physical');
});

it('sets damageType to magic for magic attackStyle', () => {
  const stats = buildPlayerCombatStats(
    80, 100,
    { attackStyle: 'magic', skillLevel: 10, attributes: { vitality: 5, strength: 0, dexterity: 0, intelligence: 5, luck: 0, evasion: 4 } },
    { attack: 0, rangedPower: 0, magicPower: 5, accuracy: 3, armor: 2, magicDefence: 1, health: 10, dodge: 1 }
  );
  expect(stats.damageType).toBe('magic');
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/damageCalculator.test.ts`
Expected: FAIL — `damageType` not on returned stats

**Step 3: Update `buildPlayerCombatStats`**

In `damageCalculator.ts`, at the end of the return object in `buildPlayerCombatStats()` (line ~138-152), add:

```typescript
damageType: input.attackStyle === 'magic' ? 'magic' : 'physical',
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/game-engine/src/combat/damageCalculator.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: buildPlayerCombatStats sets damageType from attackStyle
```

---

### Task 6: Update combat engine to use `damageType` for defence selection

**Files:**
- Modify: `packages/game-engine/src/combat/combatEngine.ts`
- Test: `packages/game-engine/src/combat/combatEngine.test.ts`

**Step 1: Write failing tests**

Add new describe blocks to `combatEngine.test.ts`:

```typescript
describe('magic damageType defence selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePlayer(overrides: Partial<CombatantStats> = {}): CombatantStats {
    return {
      hp: 100, maxHp: 100, attack: 10, accuracy: 20,
      defence: 50, magicDefence: 0, dodge: 0, evasion: 0,
      damageMin: 10, damageMax: 10, speed: 10,
      critChance: 0, critDamage: 0, damageType: 'physical',
      ...overrides,
    };
  }

  function makeMob(overrides: Partial<MobTemplate> = {}): MobTemplate {
    return {
      id: 'mob-1', name: 'Test Mob', zoneId: 'zone-1', level: 1,
      hp: 200, accuracy: 1, defence: 50, magicDefence: 0,
      evasion: 0, damageMin: 10, damageMax: 10,
      xpReward: 1, encounterWeight: 1, spellPattern: [],
      damageType: 'physical',
      ...overrides,
    };
  }

  it('player magic attack uses mob magicDefence (not defence)', () => {
    // Mock: player goes first, always hits (nat 20), never crits, fixed damage
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)  // player initiative (high)
      .mockReturnValueOnce(0.0)   // mob initiative (low)
      .mockReturnValueOnce(0.95)  // player attack roll = 20 (auto-hit)
      .mockReturnValueOnce(0.0)   // player damage roll = damageMin
      .mockReturnValueOnce(0.99); // player crit roll = no crit

    // Mob has 50 physical defence but 0 magic defence
    // With 50 defence: reduction = 50/150 = 33%, so 10 * 0.67 = 6
    // With 0 magicDefence: reduction = 0%, so 10 damage
    const player = makePlayer({ damageType: 'magic' });
    const mob = makeMob({ defence: 50, magicDefence: 0, hp: 200 });

    const result = runCombat(player, mob);
    const playerHit = result.log.find(e => e.actor === 'player' && e.damage !== undefined);

    expect(playerHit?.damage).toBe(10); // Full damage, no magic defence
  });

  it('player physical attack uses mob defence (not magicDefence)', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.95)  // player initiative
      .mockReturnValueOnce(0.0)   // mob initiative
      .mockReturnValueOnce(0.95)  // player attack roll = 20
      .mockReturnValueOnce(0.0)   // player damage roll = damageMin
      .mockReturnValueOnce(0.99); // no crit

    // Mob has 0 physical defence but 50 magic defence
    const player = makePlayer({ damageType: 'physical' });
    const mob = makeMob({ defence: 0, magicDefence: 50, hp: 200 });

    const result = runCombat(player, mob);
    const playerHit = result.log.find(e => e.actor === 'player' && e.damage !== undefined);

    expect(playerHit?.damage).toBe(10); // Full damage, no physical defence
  });

  it('mob magic auto-attack uses player magicDefence', () => {
    // Mock: mob goes first, always hits, fixed damage, no crit
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // player initiative (low)
      .mockReturnValueOnce(0.95)  // mob initiative (high)
      .mockReturnValueOnce(0.95)  // mob attack roll = 20 (auto-hit)
      .mockReturnValueOnce(0.0)   // mob damage roll = damageMin
      .mockReturnValueOnce(0.99); // no crit

    // Player has 50 physical defence but 0 magic defence
    const player = makePlayer({ defence: 50, magicDefence: 0 });
    const mob = makeMob({ damageType: 'magic', hp: 200 });

    const result = runCombat(player, mob);
    const mobHit = result.log.find(e => e.actor === 'mob' && e.damage !== undefined);

    expect(mobHit?.damage).toBe(10); // Full damage, no magic defence on player
  });

  it('mob physical auto-attack uses player defence', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // player initiative
      .mockReturnValueOnce(0.95)  // mob initiative
      .mockReturnValueOnce(0.95)  // mob attack roll = 20
      .mockReturnValueOnce(0.0)   // mob damage roll
      .mockReturnValueOnce(0.99); // no crit

    // Player has 0 physical defence but 50 magic defence
    const player = makePlayer({ defence: 0, magicDefence: 50 });
    const mob = makeMob({ damageType: 'physical', hp: 200 });

    const result = runCombat(player, mob);
    const mobHit = result.log.find(e => e.actor === 'mob' && e.damage !== undefined);

    expect(mobHit?.damage).toBe(10); // Full damage, no physical defence on player
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/game-engine/src/combat/combatEngine.test.ts`
Expected: FAIL — combat engine doesn't use `damageType`

**Step 3: Update mob stat builder in `runCombat()`**

In `combatEngine.ts`, update the `mobStats` construction (lines 38-50):

```typescript
const mobStats: CombatantStats = {
  hp: mobCurrentHp,
  maxHp: mobMaxHp,
  attack: mob.accuracy,
  accuracy: mob.accuracy,
  defence: mob.defence,
  magicDefence: mob.magicDefence,     // was: 0
  dodge: mob.evasion,
  evasion: 0,
  damageMin: mob.damageMin,
  damageMax: mob.damageMax,
  speed: 0,
  damageType: mob.damageType,         // NEW
};
```

**Step 4: Update `executePlayerAttack()` to branch on `damageType`**

In `executePlayerAttack()`, find the line that calls `calculateFinalDamage` (around line 155):

```typescript
const { damage: finalDamage, actualMultiplier } = calculateFinalDamage(rawDamage, mobStats.defence, crit, playerStats.critDamage ?? 0);
const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(mobStats.defence));
```

Replace with:

```typescript
const effectiveDefence = playerStats.damageType === 'magic' ? mobStats.magicDefence : mobStats.defence;
const { damage: finalDamage, actualMultiplier } = calculateFinalDamage(rawDamage, effectiveDefence, crit, playerStats.critDamage ?? 0);
const armorReduction = Math.floor(rawDamage * actualMultiplier * calculateDefenceReduction(effectiveDefence));
```

Also update the combat log entry in the same function. Replace:
```typescript
targetDefence: mobStats.defence,
```
With:
```typescript
targetDefence: playerStats.damageType === 'magic' ? undefined : mobStats.defence,
targetMagicDefence: playerStats.damageType === 'magic' ? mobStats.magicDefence : undefined,
armorReduction: playerStats.damageType === 'magic' ? undefined : armorReduction,
magicDefenceReduction: playerStats.damageType === 'magic' ? armorReduction : undefined,
```

**Step 5: Update `executeMobAttack()` to branch on mob `damageType`**

In `executeMobAttack()`, find the line calling `calculateFinalDamage` (around line 240):

```typescript
const { damage: finalDamage, actualMultiplier: mobCritMultiplier } = calculateFinalDamage(rawDamage, playerStats.defence, crit, 0);
const armorReduction = Math.floor(rawDamage * mobCritMultiplier * calculateDefenceReduction(playerStats.defence));
```

Replace with:

```typescript
const effectiveMobDefence = mobStats.damageType === 'magic' ? playerStats.magicDefence : playerStats.defence;
const { damage: finalDamage, actualMultiplier: mobCritMultiplier } = calculateFinalDamage(rawDamage, effectiveMobDefence, crit, 0);
const armorReduction = Math.floor(rawDamage * mobCritMultiplier * calculateDefenceReduction(effectiveMobDefence));
```

Also update the combat log entry. Replace:
```typescript
targetDefence: playerStats.defence,
```
With:
```typescript
targetDefence: mobStats.damageType === 'magic' ? undefined : playerStats.defence,
targetMagicDefence: mobStats.damageType === 'magic' ? playerStats.magicDefence : undefined,
armorReduction: mobStats.damageType === 'magic' ? undefined : armorReduction,
magicDefenceReduction: mobStats.damageType === 'magic' ? armorReduction : undefined,
```

**Step 6: Fix existing test fixtures**

Update the existing test mob objects in `combatEngine.test.ts` to include the new required fields:

For both existing test mob objects, add:
```typescript
magicDefence: 0,
damageType: 'physical' as const,
```

For both existing test player objects, add:
```typescript
damageType: 'physical' as const,
```

**Step 7: Run all tests**

Run: `npx vitest run packages/game-engine/src/combat/combatEngine.test.ts`
Expected: ALL PASS

**Step 8: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`
Expected: successful build

**Step 9: Commit**

```
feat: combat engine uses damageType to select defence stat for damage reduction
```

---

### Task 7: Database migration — add `magic_defence` and `damage_type` to mob_templates

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Update Prisma schema**

In the `MobTemplate` model (line ~223), add two fields after `defence`:

```prisma
magicDefence    Int    @default(0) @map("magic_defence")
```

And after `spellPattern`:

```prisma
damageType      String @default("physical") @map("damage_type")
```

**Step 2: Generate and run migration**

Run: `npx prisma migrate dev --name add_mob_magic_defence_and_damage_type`

This creates the migration SQL and applies it.

**Step 3: Generate Prisma client**

Run: `npm run db:generate`

**Step 4: Commit**

```
feat: add magic_defence and damage_type columns to mob_templates
```

---

### Task 8: Update mob seed data with `magicDefence` and `damageType` values

**Files:**
- Modify: `packages/database/prisma/seed-data/mobs.ts`

**Step 1: Update `MobRow` type**

Add the new fields to the `MobRow` type:

```typescript
type MobRow = {
  id: string;
  name: string;
  zoneId: string;
  level: number;
  hp: number;
  accuracy: number;
  defence: number;
  magicDefence: number;                    // NEW
  evasion: number;
  damageMin: number;
  damageMax: number;
  xpReward: number;
  encounterWeight?: number;
  spellPattern?: unknown[];
  damageType?: 'physical' | 'magic';       // NEW (optional, defaults to physical)
};
```

**Step 2: Update `mob()` helper**

```typescript
function mob(r: MobRow) {
  return {
    id: r.id,
    name: r.name,
    zoneId: r.zoneId,
    level: r.level,
    hp: r.hp,
    accuracy: r.accuracy,
    defence: r.defence,
    magicDefence: r.magicDefence,
    evasion: r.evasion,
    damageMin: r.damageMin,
    damageMax: r.damageMax,
    xpReward: r.xpReward,
    encounterWeight: r.encounterWeight ?? 100,
    spellPattern: r.spellPattern ?? [],
    damageType: r.damageType ?? 'physical',
  };
}
```

**Step 3: Add `magicDefence` and `damageType` to every mob**

Use the values from `docs/superpowers/specs/2026-02-12-magic-defence-design.md`. Every mob call gets a `magicDefence` value. Mobs with `damageType: 'magic'` also get that field. Physical mobs can omit `damageType` (defaults to `'physical'`).

Example updates (first few per zone):

```typescript
// Forest Edge
mob({ id: m.forestRat, name: 'Forest Rat', zoneId: z.forestEdge, level: 1, hp: 12, accuracy: 3, defence: 2, magicDefence: 1, evasion: 3, damageMin: 1, damageMax: 3, xpReward: 6 }),
mob({ id: m.fieldMouse, name: 'Field Mouse', zoneId: z.forestEdge, level: 1, hp: 8, accuracy: 2, defence: 1, magicDefence: 0, evasion: 5, damageMin: 1, damageMax: 2, xpReward: 4 }),
// ...

// Ancient Grove — magic mob example
mob({ id: m.forestSprite, name: 'Forest Sprite', zoneId: z.ancientGrove, level: 10, hp: 25, accuracy: 8, defence: 8, magicDefence: 12, evasion: 10, damageMin: 3, damageMax: 6, xpReward: 24, spellPattern: [spell(3, 'Sparkle', { damage: 4 })], damageType: 'magic' }),
```

Full values for ALL mobs from the design doc (refer to `docs/superpowers/specs/2026-02-12-magic-defence-design.md` mob values tables for the exact magicDefence and damageType per mob).

**Step 4: Run seed (if local DB is available)**

Run: `npx prisma db seed` (or equivalent)
Expected: seed completes without errors

**Step 5: Commit**

```
feat: add magicDefence and damageType values to all mob seed data
```

---

### Task 9: Fix API combat route — pass new fields through

**Files:**
- Modify: `apps/api/src/routes/combat.ts`

**Step 1: Verify the combat route**

The combat route at `apps/api/src/routes/combat.ts:534-538` constructs a `baseMob` from a Prisma query:

```typescript
const baseMob: MobTemplate = {
  ...mob,
  spellPattern: Array.isArray(mob.spellPattern) ? (mob.spellPattern as MobTemplate['spellPattern']) : [],
};
```

Since Prisma now returns `magicDefence` and `damageType` from the database, and the spread `...mob` includes them, this should work automatically. But verify that the Prisma `findUnique` / `findMany` calls return these new columns.

The `mob` variable comes from `prisma.mobTemplate.findUnique` or `prisma.mobTemplate.findMany` which return all columns by default. The new columns have defaults (`magic_defence` defaults to `0`, `damage_type` defaults to `"physical"`), so existing data works.

Check that the `as unknown as MobTemplate` cast at lines 501 and 508 will include the new fields. Since the Prisma model now has these columns and the `MobTemplate` type expects them, this should work.

**Step 2: Typecheck the API**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json` (or the project's typecheck command)
Expected: no new errors related to `magicDefence` or `damageType`

**Step 3: Commit (if any changes needed)**

```
fix: ensure combat route passes magicDefence and damageType through
```

---

### Task 10: Run full test suite and typecheck

**Step 1: Build all packages**

Run:
```
npm run build --workspace=packages/shared && npm run build --workspace=packages/game-engine
```

**Step 2: Run all game-engine tests**

Run: `npx vitest run --project game-engine` (or `npm run test:engine`)
Expected: ALL PASS

**Step 3: Full typecheck**

Run: `npm run typecheck`
Expected: No new errors (pre-existing errors in `apps/web/src/app/game/page.tsx:333` are acceptable)

**Step 4: Final commit if any fixes needed**

```
chore: fix any remaining type errors from magic defence changes
```
