# Expedition Themed Encounters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generic level-range mob selection with themed encounter system featuring 4 Tier 1 themes, new boss actions, stacking DoTs, mark-execute combos, and summon-adds mechanics.

**Architecture:** Theme definitions live in shared constants. Room generator accepts a theme instead of a mob pool. Expedition service picks a random theme at launch, persists it, and passes themed mob data to the room generator. New boss actions are added to BOSS_ACTION_DEFINITIONS. The raid round resolver gains support for new mechanics: forced-defend (root/fear), mark debuff interaction with execution strike, stacking DoTs, and mid-fight add spawning.

**Tech Stack:** TypeScript, Prisma (schema + migrations + seed), Vitest (game-engine tests)

**Design Doc:** `docs/plans/2026-03-09-expedition-themed-encounters-design.md`

---

## Task 1: Schema — Add `isExpeditionMob` to MobTemplate and `themeId` to GuildExpedition

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (MobTemplate model ~line 305, GuildExpedition model ~line 931)
- Create: new migration via `npx prisma migrate dev`

**Step 1: Add columns to schema**

In `schema.prisma`, add to `MobTemplate` model (after `explorationTier`):
```prisma
  isExpeditionMob Boolean @default(false) @map("is_expedition_mob")
```

Add to `GuildExpedition` model (after `tier`):
```prisma
  themeId         String?   @map("theme_id") @db.VarChar(64)
```

**Step 2: Generate migration**

```bash
cd packages/database && npx prisma migrate dev --name add_expedition_mob_flag_and_theme_id
```

**Step 3: Generate Prisma client**

```bash
npm run db:generate
```

**Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat: add isExpeditionMob flag and expedition themeId"
```

---

## Task 2: New Boss Action Definitions

**Files:**
- Modify: `packages/shared/src/constants/bossTemplateDefinitions.ts`

Add ~18 new action definitions to `BOSS_ACTION_DEFINITIONS`. Follow the existing pattern (BOSS_ZERO_COST, ActionDefinition interface).

**Step 1: Add new action definitions**

Add after `bossRest` (line 102), before the `BOSS_ACTION_DEFINITIONS` export:

```typescript
// --- Lethal single-target ---
const bossImpale: ActionDefinition = {
  id: 'boss_impale',
  name: 'Impale',
  description: 'Devastating single-target physical hit. Tank must Counter.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 4.0,
  damageType: 'physical',
};

const bossExecutionStrike: ActionDefinition = {
  id: 'boss_execution_strike',
  name: 'Execution Strike',
  description: 'Lethal to targets debuffed with Mark for Death.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 5.0,
  damageType: 'physical',
};

// --- AoE damage ---
const bossPoisonSpray: ActionDefinition = {
  id: 'boss_poison_spray',
  name: 'Poison Spray',
  description: 'AoE magic damage + poison DoT.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 1.0,
  damageType: 'magic',
  effect: { name: 'Poisoned', stat: 'poison', modifier: 0, duration: 5, isDebuff: true, damagePerRound: 5, dotDamageType: 'magic' },
};

const bossBlightWave: ActionDefinition = {
  id: 'boss_blight_wave',
  name: 'Blight Wave',
  description: 'Massive magic AoE. Telegraphed.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'magic',
};

const bossDeathBloom: ActionDefinition = {
  id: 'boss_death_bloom',
  name: 'Death Bloom',
  description: 'Wipe-level magic AoE. Telegraphed.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 3.0,
  damageType: 'magic',
};

const bossDesperateFury: ActionDefinition = {
  id: 'boss_desperate_fury',
  name: 'Desperate Fury',
  description: 'Wipe-level physical AoE. Telegraphed.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 3.0,
  damageType: 'physical',
};

const bossCocoonBurst: ActionDefinition = {
  id: 'boss_cocoon_burst',
  name: 'Cocoon Burst',
  description: 'Physical AoE. Telegraphed.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.0,
  damageType: 'physical',
};

const bossTerrifyingHowl: ActionDefinition = {
  id: 'boss_terrifying_howl',
  name: 'Terrifying Howl',
  description: 'Wipe-level physical AoE. Telegraphed.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 2.5,
  damageType: 'physical',
};

// --- Debuffs ---
const bossMarkForDeath: ActionDefinition = {
  id: 'boss_mark_for_death',
  name: 'Mark for Death',
  description: 'Marks target. Marked targets take 3x from execution strike.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Marked for Death', stat: 'marked_for_death', modifier: 0, duration: 2, isDebuff: true },
};

const bossWither: ActionDefinition = {
  id: 'boss_wither',
  name: 'Wither',
  description: 'AoE defence reduction.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Withered', stat: 'defence', modifier: -8, duration: 3, isDebuff: true },
};

const bossSmokeBomb: ActionDefinition = {
  id: 'boss_smoke_bomb',
  name: 'Smoke Bomb',
  description: 'AoE accuracy reduction.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'physical',
  effect: { name: 'Blinded', stat: 'accuracy', modifier: -8, duration: 2, isDebuff: true },
};

const bossNatureCurse: ActionDefinition = {
  id: 'boss_nature_curse',
  name: "Nature's Curse",
  description: 'Cursed targets take 3x from magic attacks.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: "Nature's Curse", stat: 'nature_cursed', modifier: 0, duration: 2, isDebuff: true },
};

const bossRoot: ActionDefinition = {
  id: 'boss_root',
  name: 'Root',
  description: 'Forces target to Defend next round.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Rooted', stat: 'rooted', modifier: 0, duration: 1, isDebuff: true },
};

const bossFearHowl: ActionDefinition = {
  id: 'boss_fear_howl',
  name: 'Fear Howl',
  description: 'AoE — all players forced to Defend next round.',
  actionType: 'debuff_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Feared', stat: 'rooted', modifier: 0, duration: 1, isDebuff: true },
};

// --- Buffs ---
const bossFrenzy: ActionDefinition = {
  id: 'boss_frenzy',
  name: 'Frenzy',
  description: 'Boss enters frenzy. +50% attack for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: { name: 'Frenzied', stat: 'attack', modifier: 20, duration: 3 },
};

const bossBarkShield: ActionDefinition = {
  id: 'boss_bark_shield',
  name: 'Bark Shield',
  description: 'Boss hardens. +30% defence for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: { name: 'Bark Shield', stat: 'defence', modifier: 12, duration: 3 },
};

const bossRally: ActionDefinition = {
  id: 'boss_rally',
  name: 'Rally',
  description: 'Buff all alive mobs. +20% attack for 3 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: { name: 'Rallied', stat: 'attack', modifier: 8, duration: 3 },
};

const bossShieldWall: ActionDefinition = {
  id: 'boss_shield_wall',
  name: 'Shield Wall',
  description: 'Boss raises shields. +40% defence for 2 rounds.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  effect: { name: 'Shield Wall', stat: 'defence', modifier: 16, duration: 2 },
};

// --- Summon ---
const bossSummonAdds: ActionDefinition = {
  id: 'boss_summon_adds',
  name: 'Summon Adds',
  description: 'Spawns additional mobs from the theme roster.',
  actionType: 'buff',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
};

// --- Healing ---
const bossRegenerate: ActionDefinition = {
  id: 'boss_regenerate',
  name: 'Regenerate',
  description: 'Boss regenerates 8% max HP.',
  actionType: 'heal_self',
  category: 'supportive',
  cost: BOSS_ZERO_COST,
  healPercent: 0.08,
};

// --- Stacking DoT (caster add actions) ---
const bossVenomCloud: ActionDefinition = {
  id: 'boss_venom_cloud',
  name: 'Venom Cloud',
  description: 'AoE stacking poison. Each stack adds 5 magic damage/round.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Venom', stat: 'stacking_dot', modifier: 0, duration: 999, isDebuff: true, damagePerRound: 5, dotDamageType: 'magic' },
};

const bossShadowBleed: ActionDefinition = {
  id: 'boss_shadow_bleed',
  name: 'Shadow Bleed',
  description: 'AoE stacking shadow DoT. Each stack adds 5 magic damage/round.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Shadow Bleed', stat: 'stacking_dot', modifier: 0, duration: 999, isDebuff: true, damagePerRound: 5, dotDamageType: 'magic' },
};

const bossThrowingKnives: ActionDefinition = {
  id: 'boss_throwing_knives',
  name: 'Throwing Knives',
  description: 'AoE stacking bleed. Each stack adds 5 physical damage/round.',
  actionType: 'heavy_attack',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'physical',
  effect: { name: 'Bleeding', stat: 'stacking_dot', modifier: 0, duration: 999, isDebuff: true, damagePerRound: 5, dotDamageType: 'physical' },
};

const bossBlightCloud: ActionDefinition = {
  id: 'boss_blight_cloud',
  name: 'Blight Cloud',
  description: 'AoE stacking blight. Each stack adds 5 magic damage/round.',
  actionType: 'damage_spell',
  category: 'offensive',
  cost: BOSS_ZERO_COST,
  damageMultiplier: 0,
  damageType: 'magic',
  effect: { name: 'Blight', stat: 'stacking_dot', modifier: 0, duration: 999, isDebuff: true, damagePerRound: 5, dotDamageType: 'magic' },
};
```

**Step 2: Add all new actions to the BOSS_ACTION_DEFINITIONS export**

Update the record to include all new action IDs mapping to their definitions.

**Step 3: Build shared package**

```bash
npm run build --workspace=packages/shared
```

**Step 4: Commit**

```bash
git add packages/shared/src/constants/bossTemplateDefinitions.ts
git commit -m "feat: add 22 new boss action definitions for expedition themes"
```

---

## Task 3: Expedition Theme Definitions

**Files:**
- Modify: `packages/shared/src/constants/expeditionDefinitions.ts`
- Modify: `packages/shared/src/types/expedition.types.ts`
- Modify: `packages/shared/src/index.ts` (if new exports needed)

**Step 1: Add ExpeditionTheme type**

In `expedition.types.ts`, add:

```typescript
export interface ExpeditionThemeMobRoster {
  trash: { mobTemplateId: string; name: string; hp: number; stats: CombatantStats; actionTemplate: BossTemplateAction[] }[];
  elites: { mobTemplateId: string; name: string; hp: number; stats: CombatantStats; actionTemplate: BossTemplateAction[] }[];
  miniBoss: { mobTemplateId: string; name: string; hp: number; stats: CombatantStats; actionTemplate: BossTemplateAction[]; adds: string[]; casterAdd: string };
  finalBoss: {
    mobTemplateId: string; name: string; hp: number; stats: CombatantStats;
    phase1: BossTemplateAction[];
    phase2: BossTemplateAction[];
    phase3: BossTemplateAction[];
    adds: string[]; casterAdd: string;
  };
  adds: { mobTemplateId: string; name: string; hp: number; stats: CombatantStats; actionTemplate: BossTemplateAction[] }[];
  casterAdds: { mobTemplateId: string; name: string; hp: number; stats: CombatantStats; actionTemplate: BossTemplateAction[] }[];
}

export interface ExpeditionTheme {
  id: string;
  name: string;
  tier: number;
  mobFamilyIds: string[];
  roster: ExpeditionThemeMobRoster;
}
```

**Step 2: Define 4 Tier 1 themes in expeditionDefinitions.ts**

Create `EXPEDITION_THEMES` array with full mob rosters for Spider Nest, Wolf Pack, Bandit Camp, Corrupted Grove. Each mob entry has hand-tuned stats and action templates referencing the new boss action IDs from Task 2.

Action templates per mob type follow the design doc:
- Trash: 2-3 action rotation (attacks + one special)
- Elite: 4-5 action rotation (attacks + AoE + debuff/buff)
- Mini-boss: 6 action rotation with summon adds
- Final boss: 3 phase templates (P1: utility, P2: combos, P3: enrage)
- Caster adds: 2-3 action rotation with stacking DoT

**Step 3: Build and verify**

```bash
npm run build --workspace=packages/shared
```

**Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat: add 4 Tier 1 expedition theme definitions with mob rosters"
```

---

## Task 4: Seed Expedition Mob Templates

**Files:**
- Modify: `packages/database/prisma/seed-data/ids.ts` (add expedition mob IDs)
- Modify: `packages/database/prisma/seed-data/mobs.ts` (add 32 new mob templates)
- Modify: `packages/database/prisma/seed-data/families.ts` (add family members)

**Step 1: Add expedition mob IDs**

In `ids.ts`, add a new section under `mobs`:
```typescript
    // ── Expedition Mobs: Spider Nest ──
    expCavernSpider: randomUUID(),
    expWebweaver: randomUUID(),
    expBroodguard: randomUUID(),
    expSilkStalker: randomUUID(),
    expSpiderMatriarch: randomUUID(),
    expSpiderling: randomUUID(),
    expVenomousSpitter: randomUUID(),
    expBroodqueen: randomUUID(),
    // ── Expedition Mobs: Wolf Pack ──
    expTimberWolf: randomUUID(),
    expSnarler: randomUUID(),
    expDireWolfExp: randomUUID(),
    expShadowWolf: randomUUID(),
    expPackAlphaExp: randomUUID(),
    expFrenziedWolf: randomUUID(),
    expHowlingSpirit: randomUUID(),
    expFenris: randomUUID(),
    // ── Expedition Mobs: Bandit Camp ──
    expBanditThug: randomUUID(),
    expBanditArcherExp: randomUUID(),
    expBanditAssassin: randomUUID(),
    expBanditShaman: randomUUID(),
    expWarChief: randomUUID(),
    expBanditGrunt: randomUUID(),
    expKnifeThrower: randomUUID(),
    expBanditKing: randomUUID(),
    // ── Expedition Mobs: Corrupted Grove ──
    expBlightedSapling: randomUUID(),
    expFungalSpore: randomUUID(),
    expCorruptedTreant: randomUUID(),
    expBlightedDryad: randomUUID(),
    expGroveWarden: randomUUID(),
    expThornVine: randomUUID(),
    expBlightedSpore: randomUUID(),
    expRotHeart: randomUUID(),
```

**Step 2: Add mob template rows in mobs.ts**

Add 32 new mob entries using the `mob()` helper. Use a special zone ID (or the first forest zone — expedition mobs don't need a real zone since they're flagged `isExpeditionMob`). Set `isExpeditionMob: true` on all.

Note: The `mob()` helper needs updating to support `isExpeditionMob` field.

Stats per mob should match the design doc HP targets. Example:
```typescript
mob({ id: m.expCavernSpider, name: 'Cavern Spider', zoneId: z.forestEdge, level: 12, hp: 150, accuracy: 16, defence: 12, magicDefence: 8, evasion: 6, damageMin: 8, damageMax: 14, xpReward: 0, isExpeditionMob: true }),
```

**Step 3: Add family members in families.ts**

Link expedition mobs to existing families:
```typescript
{ mobFamilyId: f.spiders, mobTemplateId: m.expCavernSpider, role: 'expedition_trash' },
{ mobFamilyId: f.spiders, mobTemplateId: m.expBroodqueen, role: 'expedition_boss' },
// ... etc for all 32 mobs across 4 families
```

**Step 4: Run seed**

```bash
npm run db:seed
```

**Step 5: Commit**

```bash
git add packages/database/prisma/seed-data/
git commit -m "feat: seed 32 expedition mob templates across 4 themes"
```

---

## Task 5: Refactor Room Generator for Theme-Based Selection

**Files:**
- Modify: `packages/game-engine/src/expedition/roomGenerator.ts`
- Modify: `packages/game-engine/src/index.ts` (if exports change)

**Step 1: Update generateExpeditionRooms signature**

Change the function to accept a theme instead of a generic mob pool:

```typescript
export function generateExpeditionRooms(
  tier: number,
  theme: ExpeditionTheme,
  rng: () => number = Math.random,
): ExpeditionRoomDefinition[]
```

**Step 2: Rewrite generateMobsForRoom to use theme roster**

Instead of `pickRandomMobs(pool)`, each room type draws from the theme's appropriate roster:
- `trash`: pick from `theme.roster.trash`
- `elite`: pick from `theme.roster.elites`
- `mini_boss`: use `theme.roster.miniBoss` as main + pick adds from `theme.roster.adds` + `theme.roster.casterAdds`
- `final_boss`: use `theme.roster.finalBoss` with phase templates

**Step 3: Update buildMob**

Since theme mobs have pre-tuned stats (no HP scaling needed — stats are designed for expedition difficulty), remove the `HP_SCALE_BY_TIER` multiplier for expedition mobs. The theme roster entries already have correct HP/stats.

**Step 4: Build game-engine**

```bash
npm run build --workspace=packages/game-engine
```

**Step 5: Commit**

```bash
git add packages/game-engine/src/expedition/
git commit -m "refactor: room generator uses theme roster instead of random mob pool"
```

---

## Task 6: Update Expedition Service for Theme Selection

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`

**Step 1: Replace fetchMobPool with theme selection**

In `launchExpedition()`, replace the mob pool fetch with theme selection:

```typescript
import { EXPEDITION_THEMES } from '@pocketrealm/shared';

// Pick random theme for this tier
const tierThemes = EXPEDITION_THEMES.filter(t => t.tier === tier);
const theme = tierThemes[Math.floor(Math.random() * tierThemes.length)];
const rooms = generateExpeditionRooms(tier - 1, theme);
```

**Step 2: Persist themeId**

Add `themeId: theme.id` to the `GuildExpedition` create call.

**Step 3: Return theme name to frontend**

Ensure the expedition response includes `themeId` and `themeName` so the UI can display "Spider Nest" instead of "Forest Depths".

**Step 4: Build and verify**

```bash
npm run build:api
```

**Step 5: Commit**

```bash
git add apps/api/src/services/expeditionService.ts
git commit -m "feat: expedition launch selects random theme and persists themeId"
```

---

## Task 7: Raid Resolver — Stacking DoT Mechanic

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write failing test for stacking DoT**

```typescript
it('stacking DoTs accumulate damagePerRound across multiple stacks', () => {
  // Setup: participant with 2 existing Venom stacks (5 dmg each, duration 999)
  // After tick, both should deal damage (10 total)
  const p = makeParticipant({
    activeEffects: [
      { name: 'Venom', stat: 'stacking_dot', modifier: 0, roundsRemaining: 999, damagePerRound: 5, dotDamageType: 'magic' },
      { name: 'Venom', stat: 'stacking_dot', modifier: 0, roundsRemaining: 999, damagePerRound: 5, dotDamageType: 'magic' },
    ],
  });
  // ... run round, verify participant lost 10 HP from DoTs
});
```

**Step 2: Implement stacking DoT support**

The existing effect system already supports multiple effects with `damagePerRound`. Stacking DoTs use `stat: 'stacking_dot'` and `duration: 999` (effectively permanent within room). Each stack is a separate effect entry. The tick phase already iterates all effects and applies `damagePerRound` — so stacking works naturally if we allow multiple effects with the same name.

Verify: the current tick code (lines 546-554 of raidRoundResolver.ts) does NOT currently apply `damagePerRound` to players — it only does for mobs (lines 517-523). **Add player DoT ticking.**

In the player effect tick section (~line 548), add DoT damage application before decrementing duration:

```typescript
for (const effect of effects) {
  // Apply DoT damage to player
  if (effect.damagePerRound && effect.damagePerRound > 0) {
    const dotDmg = Math.max(1, effect.damagePerRound);
    playerHpAfter[idx] = Math.max(0, playerHpAfter[idx] - dotDmg);
  }
  // ... existing tick logic
}
```

**Step 3: Run tests**

```bash
npm run test:engine
```

**Step 4: Commit**

```bash
git add packages/game-engine/src/combat/
git commit -m "feat: stacking DoT damage ticks on players in raid rounds"
```

---

## Task 8: Raid Resolver — Root/Fear Forced Defend

**Files:**
- Modify: `packages/game-engine/src/combat/combatHelpers.ts` (or raidRoundResolver.ts)
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write failing test**

```typescript
it('rooted participant is forced to defend', () => {
  // Setup: participant with 'Rooted' effect (stat: 'rooted')
  // Expected: their action is overridden to 'defend' regardless of template
});
```

**Step 2: Implement**

In `resolveParticipantActions()` (or at the start of the round resolver after step 1), check if participant has any active effect with `stat === 'rooted'`. If so, override their action to the base 'defend' action.

**Step 3: Run tests**

```bash
npm run test:engine
```

**Step 4: Commit**

```bash
git add packages/game-engine/
git commit -m "feat: rooted/feared players forced to defend in raid rounds"
```

---

## Task 9: Raid Resolver — Mark for Death + Execution Strike Combo

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write failing test**

```typescript
it('execution strike deals 3x damage to marked target', () => {
  // Setup: participant with 'Marked for Death' effect
  // Mob uses boss_execution_strike targeting that participant
  // Expected: damage is 3x normal
});

it('execution strike deals normal damage to unmarked target', () => {
  // Setup: participant WITHOUT mark
  // Expected: damage is normal (5x multiplier alone, no extra 3x)
});
```

**Step 2: Implement**

In the mob offensive phase (step 6, ~line 420-460), when resolving damage for `boss_execution_strike`, check if the target has a `marked_for_death` effect. If so, multiply final damage by 3.

```typescript
// After calculating baseDmg
if (templateAction.actionId === 'boss_execution_strike') {
  const isMarked = target.activeEffects?.some(e => e.stat === 'marked_for_death');
  if (isMarked) baseDmg *= 3;
}
```

**Step 3: Run tests**

```bash
npm run test:engine
```

**Step 4: Commit**

```bash
git add packages/game-engine/
git commit -m "feat: mark for death + execution strike combo in raid resolver"
```

---

## Task 10: Raid Resolver — Summon Adds Mid-Fight

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Modify: `packages/shared/src/types/expedition.types.ts` (add summon data to input)
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Extend RaidRoundInput**

Add optional summon pool to the input:
```typescript
export interface RaidRoundInput {
  // ... existing fields
  summonPool?: ExpeditionMobState[];  // Available mobs to spawn via boss_summon_adds
}
```

**Step 2: Write failing test**

```typescript
it('boss_summon_adds spawns new mobs from summon pool', () => {
  // Setup: mob with boss_summon_adds in action template, summonPool with 3 mobs
  // Expected: mobsAfter includes the original mobs + 2-3 new spawned mobs
});
```

**Step 3: Implement**

In the mob offensive phase, when a mob's action is `boss_summon_adds`:
- Pick 2-3 mobs from `input.summonPool` (if provided)
- Add them to the `mobState` array with unique IDs
- Log the summon as a mob action entry (custom display)
- New mobs act starting next round

**Step 4: Update expeditionService**

When building `RaidRoundInput`, include the `summonPool` from the theme's add roster for the current room.

**Step 5: Run tests**

```bash
npm run test:engine
```

**Step 6: Commit**

```bash
git add packages/game-engine/ packages/shared/ apps/api/
git commit -m "feat: boss_summon_adds spawns new mobs mid-fight"
```

---

## Task 11: Raid Resolver — Rally Buff All Mobs

**Files:**
- Modify: `packages/game-engine/src/combat/raidRoundResolver.ts`
- Test: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write failing test**

```typescript
it('boss_rally buffs all alive mobs', () => {
  // Setup: 3 mobs, one uses boss_rally
  // Expected: all 3 mobs gain the Rallied effect
});
```

**Step 2: Implement**

Currently `boss_enrage` only buffs the casting mob. For `boss_rally`, apply the effect to ALL alive mobs instead of just self. In the mob action phase, check if the action ID is `boss_rally` and apply its effect to every mob in `mobState` that has `hp > 0`.

**Step 3: Run tests and commit**

```bash
npm run test:engine
git add packages/game-engine/
git commit -m "feat: boss_rally buffs all alive mobs in expedition"
```

---

## Task 12: Frontend — Display Theme Name

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`
- Modify: `packages/shared/src/types/expedition.types.ts` (add themeName to ExpeditionData)

**Step 1: Add themeName to API response type**

In `ExpeditionData`, add:
```typescript
themeId?: string;
themeName?: string;
```

**Step 2: Update service to return theme info**

In `expeditionService.ts`, when building the expedition response, look up theme name from `EXPEDITION_THEMES` using the stored `themeId`.

**Step 3: Display in UI**

In `GuildExpeditionsTab.tsx`, replace the static tier name with `expedition.themeName ?? TIER_NAMES[tier - 1]` where the expedition name is displayed.

**Step 4: Commit**

```bash
git add apps/web/ apps/api/ packages/shared/
git commit -m "feat: display expedition theme name in UI"
```

---

## Task 13: Tests — Room Generator with Themes

**Files:**
- Create: `packages/game-engine/src/expedition/roomGenerator.test.ts`

**Step 1: Write tests**

```typescript
describe('generateExpeditionRooms with theme', () => {
  it('generates correct number of rooms for tier 0', () => { ... });
  it('all trash rooms use theme trash mobs', () => { ... });
  it('elite rooms use theme elite mobs', () => { ... });
  it('mini_boss room uses theme mini-boss with adds', () => { ... });
  it('final_boss room uses theme boss with phase templates', () => { ... });
  it('final_boss is always last room', () => { ... });
});
```

**Step 2: Run tests**

```bash
npm run test:engine
```

**Step 3: Commit**

```bash
git add packages/game-engine/src/expedition/
git commit -m "test: room generator theme-based mob selection"
```

---

## Task 14: Integration Test — Full Themed Expedition Round

**Files:**
- Add tests to: `packages/game-engine/src/combat/raidRoundResolver.test.ts`

**Step 1: Write integration test**

```typescript
describe('themed expedition mechanics', () => {
  it('full round with stacking DoT + mark + execution resolves correctly', () => {
    // Setup: boss mob with mark_for_death + execution_strike rotation
    // Caster add applying stacking DoT
    // 3 participants: tank (taunt + counter), DPS, healer
    // Verify: mark applied, execution hits marked target hard, DoT ticks
  });
});
```

**Step 2: Run all tests**

```bash
npm run test:engine
```

**Step 3: Commit**

```bash
git add packages/game-engine/
git commit -m "test: integration test for themed expedition mechanics"
```

---

## Execution Order

Tasks 1-4 are foundational (schema, actions, themes, seed data) — do these first.
Task 5-6 wire the theme into the room generator and service.
Tasks 7-11 add new raid mechanics (can be done in parallel).
Tasks 12-14 are frontend and tests (do last).

**Critical path:** 1 → 2 → 3 → 5 → 6 (system works end-to-end)
**Parallel track:** 7, 8, 9, 10, 11 (raid mechanics, independent of each other)
**Final:** 4, 12, 13, 14 (seed, UI, tests)
