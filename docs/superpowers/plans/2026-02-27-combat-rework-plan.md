# Combat Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework combat from auto-attack instant resolution to template-driven round-by-round actions with stamina/mana resources, skill point talent trees, and rock/paper/scissors interaction model.

**Architecture:** Adds stamina + mana as persisted resources (mirroring HP pattern), replaces `runCombat()` with a template-driven engine where both combatants follow pre-defined action rotations, adds a skill point system that unlocks abilities for use in templates. Clean break — no migration path, fresh schema changes.

**Tech Stack:** Prisma (schema + migrations), Express routes with Zod, vitest with mocked Prisma, existing combat engine pure functions (damageCalculator preserved, combatEngine rewritten), game-engine stays pure (no I/O).

**Design Doc:** `docs/superpowers/specs/2026-02-27-combat-rework-design.md`

---

## Phase 1: Foundation — Types, Constants, Schema, Resource System

### Task 1: Shared Combat Action & Resource Types

**Files:**
- Create: `packages/shared/src/types/combatAction.types.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Create combat action types**

```typescript
// packages/shared/src/types/combatAction.types.ts

// --- Action Categories ---
export type ActionCategory = 'offensive' | 'supportive' | 'defensive';

// --- Specific Action Types ---
export type OffensiveAction =
  | 'light_attack'
  | 'normal_attack'
  | 'heavy_attack'
  | 'skill_attack'
  | 'damage_spell'
  | 'debuff_spell';

export type SupportiveAction =
  | 'buff'
  | 'heal_self'
  | 'heal_ally'
  | 'taunt'
  | 'use_potion';

export type DefensiveAction =
  | 'defend'
  | 'counter'
  | 'ward';

export type CombatActionType = OffensiveAction | SupportiveAction | DefensiveAction;

// --- Action Definition ---
export interface ActionCost {
  stamina: number;
  mana: number;
}

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  actionType: CombatActionType;
  category: ActionCategory;
  cost: ActionCost;
  /** Damage multiplier relative to base weapon damage (1.0 = normal) */
  damageMultiplier?: number;
  /** Accuracy modifier added to hit roll */
  accuracyModifier?: number;
  /** Defence reduction applied to target receiving this action */
  defenceReduction?: number;
  /** Damage reduction percentage when defending (0-1) */
  damageReductionPercent?: number;
  /** Whether this action guarantees avoidance of physical attacks */
  avoidsPhysical?: boolean;
  /** Whether this action guarantees resistance to magical attacks */
  resistsMagic?: boolean;
  /** Buff/debuff effect applied */
  effect?: ActionEffect;
  /** Heal amount (flat + percent of max HP) */
  healFlat?: number;
  healPercent?: number;
  /** Damage type override (e.g., spells that deal magic damage) */
  damageType?: 'physical' | 'magic';
  /** Whether this action makes the user "channeling" (vulnerable to bonus damage) */
  isChanneling?: boolean;
  /** Bonus damage multiplier when hitting a channeling target */
  bonusVsChanneling?: number;
  /** Number of rounds this ability forces boss to target the user (taunt) */
  tauntDuration?: number;
  /** Potion type consumed */
  potionType?: 'hp' | 'stamina' | 'mana';
}

export interface ActionEffect {
  name: string;
  /** Stat modified (e.g., 'attack', 'defence', 'accuracy', 'dodge') */
  stat: string;
  /** Flat modifier applied to the stat */
  modifier: number;
  /** Duration in rounds */
  duration: number;
  /** Whether this is a debuff applied to the target (vs buff on self) */
  isDebuff?: boolean;
  /** Whether this is a DoT/HoT */
  damagePerRound?: number;
  healPerRound?: number;
}

// --- Combat Template ---
export interface CombatTemplateAction {
  /** Action definition ID (references an unlocked ability) */
  actionId: string;
  /** Optional override label for display */
  label?: string;
}

export interface CombatTemplateData {
  id: string;
  playerId: string;
  name: string;
  isActive: boolean;
  actions: CombatTemplateAction[];
  createdAt: string;
  updatedAt: string;
}

// --- Resource State ---
export interface ResourceState {
  current: number;
  max: number;
  regenPerRound: number;
  regenPerSecond: number;
}

export interface CombatResourceState {
  hp: ResourceState;
  stamina: ResourceState;
  mana: ResourceState;
}

// --- Skill Points ---
export type TalentTree = 'melee' | 'ranged' | 'magic' | 'general';

export interface TalentNodeDefinition {
  id: string;
  tree: TalentTree;
  tier: number;
  name: string;
  description: string;
  pointCost: number;
  /** Minimum skill level required (e.g., melee level 25) */
  skillLevelGate?: { skill: string; level: number };
  /** Node IDs that must be unlocked first */
  prerequisites: string[];
  /** If this node unlocks a combat action, reference the ActionDefinition ID */
  unlocksAction?: string;
  /** If this node grants a passive bonus */
  passiveBonus?: PassiveBonus;
}

export interface PassiveBonus {
  stat: string;
  value: number;
  isPercent?: boolean;
  description: string;
}

export interface SkillPointAllocationData {
  playerId: string;
  totalPointsEarned: number;
  totalPointsSpent: number;
  availablePoints: number;
  allocations: Record<string, number>; // nodeId -> points spent (always equal to pointCost, but tracked for respec)
  unlockedActions: string[]; // actionIds unlocked via talent nodes
}
```

**Step 2: Export from shared index**

Add to `packages/shared/src/index.ts` (after line 11):
```typescript
export * from './types/combatAction.types';
```

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 4: Commit**

```bash
git add packages/shared/src/types/combatAction.types.ts packages/shared/src/index.ts
git commit -m "feat(shared): add combat action, template, resource, and skill point types"
```

---

### Task 2: Combat Resource Constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts`

**Step 1: Add resource constants after `HP_CONSTANTS` section (~line 355)**

Add after the `FLEE_CONSTANTS` section (after ~line 387):

```typescript
// =============================================================================
// STAMINA
// =============================================================================

export const STAMINA_CONSTANTS = {
  /** Base stamina pool for all players */
  BASE_POOL: 100,
  /** Additional stamina per average of (melee, ranged, evasion) levels */
  POOL_PER_SKILL_LEVEL: 3,
  /** Base stamina regen per combat round */
  BASE_REGEN_PER_ROUND: 10,
  /** Additional regen per average combat skill level */
  REGEN_PER_SKILL_LEVEL: 0.2,
  /** Out-of-combat regen rate (per second, like HP) */
  PASSIVE_REGEN_PER_SECOND: 1.0,
  /** Heal per turn when resting */
  REST_HEAL_PER_TURN: 5,
} as const;

// =============================================================================
// MANA
// =============================================================================

export const MANA_CONSTANTS = {
  /** Base mana pool for all players */
  BASE_POOL: 50,
  /** Additional mana per magic skill level */
  POOL_PER_MAGIC_LEVEL: 3,
  /** Base mana regen per combat round */
  BASE_REGEN_PER_ROUND: 5,
  /** Additional regen per magic skill level */
  REGEN_PER_MAGIC_LEVEL: 0.15,
  /** Out-of-combat regen rate (per second) */
  PASSIVE_REGEN_PER_SECOND: 0.5,
  /** Heal per turn when resting */
  REST_HEAL_PER_TURN: 3,
} as const;
```

**Step 2: Add combat action cost constants**

Add after MANA_CONSTANTS:

```typescript
// =============================================================================
// COMBAT ACTIONS
// =============================================================================

export const COMBAT_ACTION_CONSTANTS = {
  /** Defend: free fallback */
  DEFEND_DAMAGE_REDUCTION: 0.35,
  /** Counter/Ward costs */
  COUNTER_STAMINA_COST: 35,
  WARD_MANA_COST: 30,
  /** Light attack: stamina-neutral (cost = base regen) */
  LIGHT_ATTACK_STAMINA: 10,
  NORMAL_ATTACK_STAMINA: 20,
  HEAVY_ATTACK_STAMINA: 40,
  /** Spell base stamina cost (all actions cost stamina) */
  SPELL_BASE_STAMINA: 15,
  /** Use potion stamina cost */
  USE_POTION_STAMINA: 5,
  /** Buff stamina cost */
  BUFF_BASE_STAMINA: 10,
  /** Taunt stamina cost */
  TAUNT_STAMINA: 20,
  /** Heal stamina cost */
  HEAL_BASE_STAMINA: 10,
  /** Bonus damage multiplier when hitting a channeling target */
  CHANNELING_BONUS_DAMAGE: 1.5,
  /** Max active buffs simultaneously */
  MAX_ACTIVE_BUFFS: 3,
  /** Potion sickness duration (rounds) — shared across HP/Stam/Mana potions */
  POTION_SICKNESS_ROUNDS: 4,
} as const;

// =============================================================================
// SKILL POINTS
// =============================================================================

export const SKILL_POINT_CONSTANTS = {
  /** Skill points earned per skill level-up (all 14 skills) */
  POINTS_PER_LEVEL: 1,
  /** Turn cost to respec all skill points */
  RESPEC_TURN_COST: 50_000,
  /** Max saved combat templates */
  MAX_TEMPLATES: 10,
  /** Default template action (light attack ID) */
  DEFAULT_ACTION_ID: 'light_attack',
} as const;
```

**Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`

**Step 4: Run existing shared tests to verify no regressions**

Run: `npm run test -- --workspace=packages/shared`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(shared): add stamina, mana, combat action, and skill point constants"
```

---

### Task 3: Base Action Definitions

**Files:**
- Create: `packages/shared/src/constants/combatActionDefinitions.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Define all base actions**

Create the file with all action definitions following the `ActionDefinition` interface. Include:

**Offensive (available to all):**
- `light_attack`: 10 stam, 0 mana, 0.6x damage, +0 accuracy
- `normal_attack`: 20 stam, 0 mana, 1.0x damage, +0 accuracy
- `heavy_attack`: 40 stam, 0 mana, 1.5x damage, +5 accuracy, isChanneling (committed to swing)

**Defensive (available to all):**
- `defend`: 0/0, 35% damage reduction, no avoidance
- `counter`: 35 stam, avoidsPhysical: true
- `ward`: 30 mana, resistsMagic: true

**Supportive (available to all):**
- `use_hp_potion`: 5 stam, potionType: 'hp'
- `use_stamina_potion`: 5 stam, potionType: 'stamina'
- `use_mana_potion`: 5 stam, potionType: 'mana'

Also define the "empty" action used when a player Defends due to resource exhaustion — this is just the `defend` action but flagged differently in the log.

Export as `BASE_ACTION_DEFINITIONS: Record<string, ActionDefinition>` and `getActionDefinition(id: string): ActionDefinition`.

**Step 2: Export from shared index**

Add: `export * from './constants/combatActionDefinitions'`

**Step 3: Build**

Run: `npm run build --workspace=packages/shared`

**Step 4: Commit**

```bash
git add packages/shared/src/constants/combatActionDefinitions.ts packages/shared/src/index.ts
git commit -m "feat(shared): add base combat action definitions"
```

---

### Task 4: Talent Tree Definitions

**Files:**
- Create: `packages/shared/src/constants/talentTreeDefinitions.ts`
- Modify: `packages/shared/src/index.ts`

**Step 1: Define talent tree nodes for all 4 trees**

Each tree has ~5 tiers, 3-4 nodes per tier. Every node that unlocks a combat action should reference the action ID. Nodes are `TalentNodeDefinition` objects.

**Melee Tree (~15 nodes):**
- Tier 1 (5-10 pts): Power Strike (skill attack, 1.3x phys), Iron Skin (passive: +5% defence), Endurance Training (passive: +10% stamina pool)
- Tier 2 (10-15 pts, requires melee 15): Cleave (skill attack, 1.1x to target, damages second enemy in raids), Battle Cry (buff: +20% attack for 4 rounds), Stamina Surge (passive: +15% stam regen)
- Tier 3 (20-30 pts, requires melee 35): Devastating Blow (skill attack, 2.0x phys, heavy stam cost), Berserker Rage (buff: +30% attack, -15% defence for 5 rounds), Weapon Mastery (passive: +10% weapon damage)
- Tier 4 (35-50 pts, requires melee 60): Execute (skill attack, bonus damage when target < 30% HP), Unbreakable (passive: +20% max HP), Iron Will (passive: reduce debuff duration by 1 round)
- Tier 5 (50-75 pts, requires melee 85): Titan's Wrath (skill attack, 2.5x, 60 stam), Champion's Resolve (passive: +25% stam regen + pool)

**Ranged Tree (~15 nodes):**
- Tier 1: Aimed Shot, Quick Draw (passive: +5% crit), Keen Eye (passive: +10% accuracy)
- Tier 2: Crippling Shot (debuff: -20% target speed 3 rounds), Eagle Eye (buff: +30% accuracy 3 rounds), Steady Hands (passive: +15% crit damage)
- Tier 3: Volley (skill attack, hits all enemies in raid), Sniper's Mark (debuff: target takes +20% damage 3 rounds), Evasive Maneuver (passive: +10% dodge)
- Tier 4: Piercing Shot (skill attack, ignores 50% defence), Quick Reflexes (passive: Counter costs -10 stam), Fleet Foot (passive: +15% evasion)
- Tier 5: Death Mark (skill attack, 2.5x ranged, applies vulnerable debuff), Windwalker (passive: +25% dodge + evasion)

**Magic Tree (~15 nodes):**
- Tier 1: Fire Bolt (damage spell, 10 stam + 30 mana, magic damage), Minor Heal (heal self, 10 stam + 25 mana), Arcane Focus (passive: +10% mana pool)
- Tier 2: Frost Nova (damage spell + debuff: -15% speed 3 rounds), Enhanced Fortitude (buff: +25% defence 4 rounds, 10 stam + 35 mana), Mana Flow (passive: +15% mana regen)
- Tier 3: Chain Lightning (damage spell, hits multiple in raids), Heal Ally (heal ally in raids, 10 stam + 50 mana), Spell Penetration (passive: ignore 15% magic defence)
- Tier 4: Arcane Blast (2.0x magic damage, 15 stam + 70 mana), Regeneration (HoT: heal 5% max HP for 4 rounds), Mind Shield (passive: Ward costs -10 mana)
- Tier 5: Meteor Strike (2.5x magic AoE, 20 stam + 90 mana), Archmage (passive: +25% mana regen + pool)

**General Tree (~15 nodes):**
- Tier 1: Improved Defend (Defend reduces 45% instead of 35%), First Aid (passive: +10% potion effectiveness), Toughness (passive: +5% max HP)
- Tier 2: Taunt (raid only, 20 stam, forces boss target for 2 rounds), Quick Recovery (passive: reduce potion sickness by 1 round), Resourceful (passive: +10% stam + mana regen)
- Tier 3: Fortify (buff: +30% defence + magic defence 3 rounds, 15 stam + 20 mana), Efficient Mining (passive: +10% mining yield), Cheaper Repairs (passive: -15% repair cost)
- Tier 4: Last Stand (passive: when HP < 20%, +30% defence for 2 rounds, once per fight), Salvage Expert (passive: +15% salvage returns), Master Crafter (passive: +10% crafting crit)
- Tier 5: Undying (passive: survive lethal hit once per fight with 1 HP), Grandmaster (passive: +15% all skill XP)

**Step 2: Export tree definitions**

Export as:
- `TALENT_TREE_DEFINITIONS: Record<TalentTree, TalentNodeDefinition[]>`
- `getAllTalentNodes(): TalentNodeDefinition[]`
- `getTalentNode(nodeId: string): TalentNodeDefinition | undefined`

**Step 3: Add to shared index**

Add: `export * from './constants/talentTreeDefinitions'`

**Step 4: Build**

Run: `npm run build --workspace=packages/shared`

**Step 5: Commit**

```bash
git add packages/shared/src/constants/talentTreeDefinitions.ts packages/shared/src/index.ts
git commit -m "feat(shared): add talent tree definitions for melee, ranged, magic, general"
```

---

### Task 5: Database Schema — Stamina, Mana, Templates, Skill Points

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Step 1: Add stamina/mana fields to Player model (after line 32)**

After `lastHpRegenAt` / HP fields, add:
```prisma
  currentStamina      Int      @default(100) @map("current_stamina")
  lastStaminaRegenAt  DateTime @default(now()) @map("last_stamina_regen_at")
  currentMana         Int      @default(50) @map("current_mana")
  lastManaRegenAt     DateTime @default(now()) @map("last_mana_regen_at")
```

**Step 2: Add CombatTemplate model**

Add after the existing Guild section (after ~line 872):
```prisma
// =============================================================================
// COMBAT TEMPLATES
// =============================================================================

model CombatTemplate {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  name      String   @db.VarChar(64)
  isActive  Boolean  @default(false) @map("is_active")
  actions   Json     // CombatTemplateAction[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId, isActive])
  @@map("combat_templates")
}
```

**Step 3: Add SkillPointAllocation model**

```prisma
// =============================================================================
// SKILL POINTS
// =============================================================================

model SkillPointAllocation {
  id          String   @id @default(uuid())
  playerId    String   @unique @map("player_id")
  allocations Json     @default("{}") // Record<nodeId, pointCost>
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@map("skill_point_allocations")
}
```

**Step 4: Add relations to Player model**

In the Player model relations section, add:
```prisma
  combatTemplates    CombatTemplate[]
  skillPointAllocation SkillPointAllocation?
```

**Step 5: Run migration**

Run: `npm run db:migrate -- --name combat_rework_resources_templates_skillpoints`

**Step 6: Generate Prisma client**

Run: `npm run db:generate`

**Step 7: Build database package**

Run: `npm run build --workspace=packages/database`

**Step 8: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add stamina/mana fields, combat templates, skill point allocations"
```

---

### Task 6: Resource Calculators (Game Engine)

**Files:**
- Create: `packages/game-engine/src/resources/staminaCalculator.ts`
- Create: `packages/game-engine/src/resources/staminaCalculator.test.ts`
- Create: `packages/game-engine/src/resources/manaCalculator.ts`
- Create: `packages/game-engine/src/resources/manaCalculator.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write failing tests for stamina calculator**

Mirror the pattern from `hpCalculator.test.ts`. Test:
- `calculateMaxStamina(input)` — base + skill scaling
- `calculateStaminaRegenPerSecond(skillLevels)` — passive regen
- `calculateStaminaRegenPerRound(skillLevels)` — in-combat regen
- `calculateCurrentStamina(stored, lastRegenAt, max, regenPerSecond, now)` — lazy regen
- `calculateStaminaRestHealing(current, max, healPerTurn, turnsToSpend)` — turn-based rest

**Step 2: Run tests to verify they fail**

Run: `npm run test:engine -- --run staminaCalculator`
Expected: FAIL (module not found)

**Step 3: Implement staminaCalculator**

Follow `hpCalculator.ts` pattern exactly. Key functions:
```typescript
export function calculateMaxStamina(input: { meleeLevel: number; rangedLevel: number; evasionLevel: number; equipmentStaminaBonus: number }): number {
  const avgLevel = Math.floor((input.meleeLevel + input.rangedLevel + input.evasionLevel) / 3);
  return STAMINA_CONSTANTS.BASE_POOL + avgLevel * STAMINA_CONSTANTS.POOL_PER_SKILL_LEVEL + input.equipmentStaminaBonus;
}

export function calculateStaminaRegenPerRound(meleeLevel: number, rangedLevel: number, evasionLevel: number): number {
  const avgLevel = Math.floor((meleeLevel + rangedLevel + evasionLevel) / 3);
  return STAMINA_CONSTANTS.BASE_REGEN_PER_ROUND + avgLevel * STAMINA_CONSTANTS.REGEN_PER_SKILL_LEVEL;
}
```

**Step 4: Run tests, verify pass**

**Step 5: Repeat steps 1-4 for manaCalculator**

Key: mana scales with magic level only.
```typescript
export function calculateMaxMana(input: { magicLevel: number; equipmentManaBonus: number }): number {
  return MANA_CONSTANTS.BASE_POOL + input.magicLevel * MANA_CONSTANTS.POOL_PER_MAGIC_LEVEL + input.equipmentManaBonus;
}
```

**Step 6: Export from game-engine index**

Add to `packages/game-engine/src/index.ts`:
```typescript
export * from './resources/staminaCalculator';
export * from './resources/manaCalculator';
```

**Step 7: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`

**Step 8: Commit**

```bash
git add packages/game-engine/src/resources/
git add packages/game-engine/src/index.ts
git commit -m "feat(engine): add stamina and mana calculators mirroring HP pattern"
```

---

### Task 7: Action Resolution Module (Game Engine)

**Files:**
- Create: `packages/game-engine/src/combat/actionResolver.ts`
- Create: `packages/game-engine/src/combat/actionResolver.test.ts`

**Step 1: Write failing tests for action resolution**

Test the core RPS interactions:
- Counter vs physical attack → attack is avoided
- Counter vs spell → counter is wasted, spell hits
- Ward vs spell → spell is resisted
- Ward vs physical attack → ward is wasted, attack hits
- Defend vs any → damage reduced by 35%
- Attack vs channeling target → bonus damage applied
- Buff/heal (channeling) vs attack → takes bonus damage
- Resource check: can't afford action → falls back to Defend

**Step 2: Run tests to verify they fail**

**Step 3: Implement actionResolver**

Key exports:
```typescript
export interface ResolvedAction {
  action: ActionDefinition;
  wasExhausted: boolean; // true if fell back to Defend due to resources
}

export interface RoundInteraction {
  attackerAction: ResolvedAction;
  defenderAction: ResolvedAction;
  attackerDamageMultiplier: number;
  defenderDamageMultiplier: number;
  attackerHitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal';
  defenderHitOverride: 'guaranteed_miss' | 'guaranteed_hit' | 'normal';
  attackerDamageReduction: number; // 0-1, from defensive stance
  defenderDamageReduction: number;
}

/** Resolve what action a combatant takes given their template, resources, and round number */
export function resolveAction(
  template: CombatTemplateAction[],
  roundNumber: number,
  currentStamina: number,
  currentMana: number,
  actionDefinitions: Record<string, ActionDefinition>,
): ResolvedAction;

/** Determine the interaction between two resolved actions */
export function resolveInteraction(
  attackerAction: ResolvedAction,
  defenderAction: ResolvedAction,
): RoundInteraction;
```

The interaction logic implements the RPS matrix:
- If defender has `avoidsPhysical` and attacker deals physical → `guaranteed_miss`
- If defender has `resistsMagic` and attacker deals magic → `guaranteed_miss`
- If defender `isChanneling` and attacker attacks → apply `CHANNELING_BONUS_DAMAGE` multiplier
- If defender has `damageReductionPercent` (Defend) → apply reduction
- Otherwise → `normal` hit check with standard d20 roll

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add packages/game-engine/src/combat/actionResolver.ts packages/game-engine/src/combat/actionResolver.test.ts
git commit -m "feat(engine): add action resolution module with RPS interaction logic"
```

---

### Task 8: Template-Driven Combat Engine

**Files:**
- Create: `packages/game-engine/src/combat/templateCombatEngine.ts`
- Create: `packages/game-engine/src/combat/templateCombatEngine.test.ts`
- Modify: `packages/game-engine/src/index.ts`

**Step 1: Write failing tests for the new combat engine**

Test:
- Two combatants with simple templates (light attack loops) → produces valid combat log
- Template loops correctly (6-round template, 12-round fight → actions repeat)
- Resource depletion → falls back to Defend
- Counter avoids physical attack in log
- Ward resists spell in log
- Buff applied, tracked, expires after duration
- Potion usage triggers sickness cooldown
- Combat ends on death (victory/defeat)
- Max 100 rounds → draw
- In-combat resource regen applies each round

**Step 2: Run tests to verify they fail**

**Step 3: Implement templateCombatEngine**

```typescript
export interface TemplateCombatant {
  id: string;
  name: string;
  stats: CombatantStats;
  template: CombatTemplateAction[];
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  /** Actions this combatant has access to (from talent tree + equipment) */
  actionDefinitions: Record<string, ActionDefinition>;
}

export interface TemplateCombatResult {
  outcome: CombatOutcome;
  log: TemplateCombatLogEntry[];
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  combatantAHpRemaining: number;
  combatantBHpRemaining: number;
  combatantAStaminaRemaining: number;
  combatantBStaminaRemaining: number;
  combatantAManaRemaining: number;
  combatantBManaRemaining: number;
  potionsConsumed: PotionConsumed[];
  totalRounds: number;
}

export interface TemplateCombatLogEntry extends CombatLogEntry {
  combatantAAction: string; // action ID used this round
  combatantBAction: string;
  combatantAStaminaAfter: number;
  combatantBStaminaAfter: number;
  combatantAManaAfter: number;
  combatantBManaAfter: number;
  wasExhausted?: boolean; // true if action fell back to Defend
  interactionResult?: string; // 'counter_avoided', 'ward_resisted', 'channeling_bonus', etc.
}

export function runTemplateCombat(
  combatantA: TemplateCombatant,
  combatantB: TemplateCombatant,
  options?: CombatOptions,
): TemplateCombatResult;
```

**Main loop logic:**
1. Roll initiative (same as current: d20 + speed)
2. For each round (max 100):
   a. Resolve actions for both combatants via `resolveAction()` (template + resources)
   b. Apply in-combat resource regen (stam + mana)
   c. Resolve interaction via `resolveInteraction()`
   d. Apply effective stats from active effects
   e. Execute actions in initiative order using `damageCalculator` functions
   f. Handle buff/debuff application and expiry
   g. Handle potion usage (check sickness, consume from pool)
   h. Deduct action costs from resources
   i. Log everything
   j. Check for death → outcome
3. Return result

The key difference from old `runCombat()`: instead of always calling `executeAttack()`, we call the appropriate resolution based on each combatant's resolved action for this round. `damageCalculator.ts` functions (`doesAttackHit`, `rollDamage`, `calculateFinalDamage`, etc.) are reused directly.

**Step 4: Run tests, verify pass**

**Step 5: Export from game-engine index**

Add: `export * from './combat/templateCombatEngine'`

**Step 6: Build game-engine**

Run: `npm run build --workspace=packages/game-engine`

**Step 7: Run ALL game-engine tests**

Run: `npm run test:engine`
Expected: All pass (old combatEngine tests still pass since we didn't modify it)

**Step 8: Commit**

```bash
git add packages/game-engine/src/combat/templateCombatEngine.ts packages/game-engine/src/combat/templateCombatEngine.test.ts
git add packages/game-engine/src/index.ts
git commit -m "feat(engine): add template-driven combat engine with resource management"
```

---

### Task 9: Mob Template Conversion Utility

**Files:**
- Create: `packages/game-engine/src/combat/mobTemplateConverter.ts`
- Create: `packages/game-engine/src/combat/mobTemplateConverter.test.ts`

**Step 1: Write tests**

Test converting existing `spellPattern` + auto-attack mobs into `CombatTemplateAction[]`:
- Mob with no spells → all `normal_attack` actions (single-element template)
- Mob with spellPattern `[{round:3, name:"Fire Blast", damage:20}]` → template: `[normal_attack, normal_attack, spell:fire_blast, ...]`
- Prefixed mob with generated spells → merged correctly

**Step 2: Implement converter**

```typescript
export function mobToTemplate(
  mob: MobTemplate,
  prefixSpells?: SpellAction[],
): CombatTemplateAction[];

export function mobToTemplateCombatant(
  mob: MobTemplate & { currentHp?: number; maxHp?: number },
  prefixSpells?: SpellAction[],
): TemplateCombatant;
```

Mobs get infinite resources (stam/mana set to `Infinity`) so their template always executes.

**Step 3: Run tests, verify pass**

**Step 4: Commit**

```bash
git add packages/game-engine/src/combat/mobTemplateConverter.ts packages/game-engine/src/combat/mobTemplateConverter.test.ts
git commit -m "feat(engine): add mob-to-template converter for backward-compatible mob combat"
```

---

### Task 10: Resource Service (API)

**Files:**
- Create: `apps/api/src/services/resourceService.ts`
- Create: `apps/api/src/services/resourceService.test.ts`

**Step 1: Write failing tests**

Mirror `hpService.test.ts` patterns. Test:
- `getResourceState(playerId)` → returns stamina + mana with lazy regen applied
- `restStamina(playerId, turns)` → spends turns, restores stamina, applies guild tax
- `restMana(playerId, turns)` → spends turns, restores mana, applies guild tax
- `setStamina(playerId, newValue)` → direct setter (used after combat)
- `setMana(playerId, newValue)` → direct setter
- Edge cases: already full, recovering state, insufficient turns

**Step 2: Run tests to verify they fail**

**Step 3: Implement resourceService**

Follow `hpService.ts` pattern exactly. Key functions:
- `getResourceState(playerId, now?)` → `{ stamina: ResourceState, mana: ResourceState }`
- `restStamina(playerId, turnsToSpend, now?)` → rest result + tax
- `restMana(playerId, turnsToSpend, now?)` → rest result + tax
- `setStamina(playerId, newValue, now?)` → direct DB update
- `setMana(playerId, newValue, now?)` → direct DB update
- `setAllResources(playerId, hp, stamina, mana, now?)` → convenience for post-combat

Uses game-engine `staminaCalculator`/`manaCalculator` for all math.

**Step 4: Run tests, verify pass**

**Step 5: Update `__mocks__/database.ts`**

No changes needed if stamina/mana are fields on the `player` model (already mocked).

**Step 6: Commit**

```bash
git add apps/api/src/services/resourceService.ts apps/api/src/services/resourceService.test.ts
git commit -m "feat(api): add resource service for stamina/mana state and rest"
```

---

### Task 11: Resource Routes (API)

**Files:**
- Create: `apps/api/src/routes/resources.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create resource router**

```
GET    /api/v1/resources          — get stamina + mana state (lazy regen)
POST   /api/v1/resources/rest     — rest to recover stamina and/or mana (body: { type: 'stamina'|'mana', turns: number })
GET    /api/v1/resources/estimate — preview rest healing (query: type, turns)
```

Follow `hp.ts` route patterns with Zod validation.

**Step 2: Register route in index.ts**

Add after `hpRouter` registration (~line 100):
```typescript
import { resourcesRouter } from './routes/resources';
app.use('/api/v1/resources', resourcesRouter);
```

**Step 3: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`

**Step 4: Run all API tests**

Run: `npm run test:api`
Expected: All pass

**Step 5: Commit**

```bash
git add apps/api/src/routes/resources.ts apps/api/src/index.ts
git commit -m "feat(api): add resource routes for stamina/mana state and rest"
```

---

### Task 12: Combat Template Service (API)

**Files:**
- Create: `apps/api/src/services/combatTemplateService.ts`
- Create: `apps/api/src/services/combatTemplateService.test.ts`

**Step 1: Write failing tests**

Test:
- `createTemplate(playerId, name, actions)` → creates template, validates action IDs against unlocked abilities
- `getTemplates(playerId)` → returns all templates for player
- `getActiveTemplate(playerId)` → returns the active template (or default if none)
- `setActiveTemplate(playerId, templateId)` → marks one active, unmarks others
- `updateTemplate(playerId, templateId, updates)` → update name/actions
- `deleteTemplate(playerId, templateId)` → delete (can't delete active)
- `validateTemplate(actions, unlockedActions, equippedActions)` → validates all action IDs are available
- Error: creating more than MAX_TEMPLATES
- Error: action not unlocked
- Error: deleting active template

**Step 2: Implement service**

Key functions:
```typescript
export async function createTemplate(playerId: string, name: string, actions: CombatTemplateAction[]): Promise<CombatTemplateData>;
export async function getTemplates(playerId: string): Promise<CombatTemplateData[]>;
export async function getActiveTemplate(playerId: string): Promise<CombatTemplateAction[]>;
export async function setActiveTemplate(playerId: string, templateId: string): Promise<void>;
export async function updateTemplate(playerId: string, templateId: string, name?: string, actions?: CombatTemplateAction[]): Promise<CombatTemplateData>;
export async function deleteTemplate(playerId: string, templateId: string): Promise<void>;
```

Default template (if no active): `[{ actionId: 'light_attack' }]` — equivalent to current auto-attack.

**Step 3: Run tests, verify pass**

**Step 4: Add mock model to `__mocks__/database.ts`**

Add: `combatTemplate: mockModel(),`

**Step 5: Commit**

```bash
git add apps/api/src/services/combatTemplateService.ts apps/api/src/services/combatTemplateService.test.ts apps/api/src/__mocks__/database.ts
git commit -m "feat(api): add combat template service with CRUD and validation"
```

---

### Task 13: Combat Template Routes (API)

**Files:**
- Create: `apps/api/src/routes/templates.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create template router**

```
GET    /api/v1/templates          — list player's templates
POST   /api/v1/templates          — create template
GET    /api/v1/templates/active   — get active template
PATCH  /api/v1/templates/:id      — update template
DELETE /api/v1/templates/:id      — delete template
POST   /api/v1/templates/:id/activate — set as active
```

**Step 2: Register route**

**Step 3: Build and typecheck**

**Step 4: Commit**

```bash
git add apps/api/src/routes/templates.ts apps/api/src/index.ts
git commit -m "feat(api): add combat template routes"
```

---

### Task 14: Integrate Template Combat into Combat Start Route

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`

**Step 1: Replace `runCombat()` calls with `runTemplateCombat()`**

In zone combat path (~line 801) and encounter site path (~line 243):

1. Fetch player's active template via `getActiveTemplate(playerId)`
2. Fetch player's unlocked actions (from skill point allocations + equipped items)
3. Build `TemplateCombatant` for the player (including stamina/mana state)
4. Build `TemplateCombatant` for the mob (via `mobToTemplateCombatant()`)
5. Call `runTemplateCombat()` instead of `runCombat()`
6. Post-combat: persist HP, stamina, mana via `setAllResources()`
7. The rest of the flow (loot, XP, durability, guild, activity log) stays the same

**Step 2: Update encounter site loop**

For encounter sites, stamina/mana carry between fights. The `TemplateCombatant` for the player is rebuilt each fight with the remaining resource values from the previous fight's result.

**Step 3: Build and typecheck**

Run: `npm run build:api`
Run: `npm run typecheck`

**Step 4: Run all tests**

Run: `npm run test:api`
Expected: All pass (mocked DB means resource lookups return defaults)

**Step 5: Commit**

```bash
git add apps/api/src/routes/combat/start.ts
git commit -m "feat(api): integrate template combat engine into combat start route"
```

---

## Phase 1 Verification Checklist

After completing Tasks 1-14:

1. `npm run db:migrate` — migration succeeds
2. `npm run build` — all packages build
3. `npm run typecheck` — no TS errors
4. `npm run test:engine` — all engine tests pass (old + new)
5. `npm run test:api` — all API tests pass (old + new)
6. Manual test: check resource state (`GET /resources`)
7. Manual test: rest stamina/mana (`POST /resources/rest`)
8. Manual test: create combat template (`POST /templates`)
9. Manual test: set active template, fight a mob — template actions appear in combat log
10. Manual test: encounter site carries stamina/mana between fights

---

## Phase 2: Skill Point System (Outline)

### Task 15: Skill Point Service
- `getSkillPoints(playerId)` → total earned (sum of all skill levels), spent, available
- `allocatePoints(playerId, nodeId)` → validate prerequisites, skill gates, available points. Persist allocation.
- `respecPoints(playerId)` → spend turns, reset all allocations
- `getUnlockedActions(playerId)` → all action IDs from talent nodes + equipped items

### Task 16: Skill Point Routes
- `GET /api/v1/skillpoints` → current state + all tree definitions
- `POST /api/v1/skillpoints/allocate` → allocate to a node
- `POST /api/v1/skillpoints/respec` → reset all

### Task 17: Integrate Skill Points with Template Validation
- Template creation/update validates actions against `getUnlockedActions()`
- Equipment change checks if any active template uses equipment-granted actions

### Task 18: Skill Points on Level-Up
- Modify XP service to recalculate available skill points on level-up
- No automatic allocation — points accumulate for player to spend

---

## Phase 3: PvP Rework (Outline)

### Task 19: PvP Template vs Template Combat
- Modify `pvpService.challenge()` to build `TemplateCombatant` for both players
- Fetch both players' active templates
- Call `runTemplateCombat()` instead of `runCombat()`
- Persist attacker's stamina/mana post-combat (defender is ghost — no state change)

### Task 20: Scout Rework
- Modify `pvpService.scoutOpponent()` to return partial template info:
  - Template length, action categories, resource profile
  - Does NOT return exact action sequence
- Create scout notification (new notification type)
- "You've been scouted by [player]" alert

### Task 21: PvP Combat Log Updates
- Extend combat log to include per-round actions for both players
- Full rotation visible post-fight

---

## Phase 4: Boss Encounter Rework (Outline)

### Task 22: Boss Template Definitions
- Define boss templates (action sequences) for existing boss mobs
- Convert boss spellPattern to template format with AoE/single-target markers
- Add `targetMode` to boss actions: 'single_target' | 'aoe'
- Add telegraphed nuke markers for mandatory Counter/Ward rounds

### Task 23: Individual HP Boss Model
- Rework `bossEncounterService.ts` to track individual player HP/stam/mana
- Remove shared raid pool model
- Each player's template resolves independently against the boss

### Task 24: Threat / Aggro System
- Track threat per player (damage dealt + taunt)
- Boss single-target actions hit highest threat
- Taunt forces targeting for N rounds

### Task 25: Boss Round Resolution Rewrite
- Rewrite `resolveBossRoundLogic()` for individual HP model
- Each participant's template action resolves against the boss
- Boss template action resolves against target(s)
- Death removes player from encounter

### Task 26: Contribution-Weighted Loot
- Rework `distributeBossLoot()` to weight by damage + healing + damage absorbed while tanking
- "Damage absorbed while tanking" = damage taken while holding aggro

### Task 27: Progressive Bestiary Reveal
- Track highest round survived per boss
- Reveal boss template actions up to that round in bestiary

---

## Phase 5: Potion System Expansion (Outline)

### Task 28: Stamina & Mana Potion Items
- Add stamina/mana potion item templates to seed data
- Add potion type field to item template (`potionType: 'hp' | 'stamina' | 'mana'`)
- Add alchemy recipes for stamina/mana potions

### Task 29: Unified Potion Sickness
- Shared cooldown across all potion types (4 rounds)
- `use_potion` action in template specifies which potion type
- Auto-potion logic reworked: player picks potion type priority in preferences

---

## Phase 6: Frontend — Template Editor & Resource UI (Outline)

### Task 30: Resource Bars (Stamina + Mana)
- Add stamina/mana bars alongside HP bar on game screen
- Poll `GET /resources` alongside existing HP state
- Same passive regen display as HP

### Task 31: Combat Template Editor Screen
- New screen: list templates, create/edit/delete
- Drag-and-drop action ordering
- Action palette (unlocked actions from skill tree + equipment)
- Sustainability indicator (estimated stam/mana drain vs regen per cycle)
- Set active button

### Task 32: Skill Tree UI
- New screen: 4 tabs (Melee, Ranged, Magic, General)
- Visual tree with tiers, prerequisite lines, locked/unlocked states
- Point allocation with confirmation
- Available points display
- Respec button

### Task 33: Combat Playback Updates
- Extend `CombatPlayback` to show action names per round
- Show stamina/mana bars alongside HP bars during playback
- Show "exhausted" indicator when player falls back to Defend
- Show interaction result (counter avoided, ward resisted, channeling bonus)

### Task 34: Boss UI Rework
- Individual HP bars per player instead of raid pool
- Threat indicator (who has aggro)
- Boss action history (progressive reveal)
- Role indicators (tank/healer/DPS based on template actions)

---

## Phase 7: World Boss & Expedition Adjustments (Outline)

### Task 35: World Boss Open Join/Rejoin
- Allow joining at any round
- Allow rejoining after recovery
- Configurable round interval (default 60s for world bosses)
- Dynamic boss HP scaling with player count

### Task 36: Guild Expedition Template Integration
- Expedition round resolution uses template combat
- Configurable round interval (30s-5min, set by raid leader)
- Resources carry between rooms
- Template swapping between rooms

---

## Implementation Order

1. **Phase 1** (Tasks 1-14): Foundation + core engine. Everything else depends on this.
2. **Phase 2** (Tasks 15-18): Skill points. Needed for template validation and ability unlocks.
3. **Phase 5** (Tasks 28-29): Potions. Quick win, extends existing crafting.
4. **Phase 3** (Tasks 19-21): PvP. Uses template combat + skill points.
5. **Phase 4** (Tasks 22-27): Boss rework. Largest single phase, most complex.
6. **Phase 6** (Tasks 30-34): Frontend. Can start in parallel with Phase 3-4 for resource bars and template editor.
7. **Phase 7** (Tasks 35-36): World boss + expedition. Final integration.
