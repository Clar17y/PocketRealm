# Tradeskill Vocation Mastery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the exploratory generic honing implementation with a first-class vocation mastery system that feels native to Pocketrealm: active turn honing, passive vocation progress, named techniques, visible craft marks, gathering field techniques, equipment combat modifiers, achievements, titles, and town mentors.

**Architecture:** Keep normal `PlayerSkill` XP/levels as requirements and base capability. Add a separate vocation mastery layer with shared definitions, normalized player progress tables, API services/routes, craft/gather integration, equipment mark support in combat calculation, achievement counters, and frontend mentor/technique UI. Do not store vocation state inside `PlayerSkill.honing`.

**Tech Stack:** Next.js 16, Express 4, Prisma 6/PostgreSQL 16, Redis 7, Socket.IO, Zod, Vitest, Playwright, TypeScript strict mode.

---

## Current State

The worktree currently contains an exploratory implementation that adds generic tradeskill honing. It introduced broad `+x%` perks, JSON state on `PlayerSkill`, global daily honing fields on `Player`, a generic `HoningStation`, and routes under crafting. The target implementation replaces that design.

Known exploratory files and changes to remove or rewrite during implementation:

- `apps/api/src/routes/crafting/honing.ts`
- `apps/api/src/routes/crafting/honing.test.ts`
- `apps/api/src/services/honingService.ts`
- `apps/api/src/services/honingService.test.ts`
- `apps/api/src/services/__tests__/honingService.test.ts`
- `apps/web/src/app/game/hooks/useHoningActions.ts`
- `apps/web/src/components/common/HoningStation.tsx`
- `apps/web/src/lib/api/honing.ts`
- `packages/database/prisma/migrations/20260520081527_add_tradeskill_honing/`
- Generic honing edits in `crafting.ts`, `player.ts`, crafting/gathering route services, `gameConstants.ts`, shared player/state update types, web screens, and web API exports.

Do not delete unrelated user work. Confirm each deletion is one of the generic honing files above or a schema/type edit that only belongs to the exploratory honing system.

---

## Target Data Model

### Vocation List

Launch with these vocation IDs:

- `prospector`
- `forester`
- `herbalist`
- `weaponsmith`
- `bowyer`
- `staffwright`
- `armorer`
- `leatherworker`
- `tailor`
- `jeweller`
- `alchemist`

### New Prisma Models

Add normalized player vocation state:

```prisma
model PlayerVocation {
  playerId       String   @map("player_id")
  vocationId     String   @map("vocation_id")
  xp             Int      @default(0)
  rank           Int      @default(0)
  masteryPoints  Int      @default(0) @map("mastery_points")
  spentPoints    Int      @default(0) @map("spent_points")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  player         Player   @relation(fields: [playerId], references: [id], onDelete: Cascade)
  techniques     PlayerVocationTechnique[]

  @@id([playerId, vocationId])
  @@map("player_vocations")
}

model PlayerVocationTechnique {
  playerId    String   @map("player_id")
  vocationId  String   @map("vocation_id")
  techniqueId String   @map("technique_id")
  learnedAt   DateTime @default(now()) @map("learned_at")

  vocation PlayerVocation @relation(fields: [playerId, vocationId], references: [playerId, vocationId], onDelete: Cascade)

  @@id([playerId, vocationId, techniqueId])
  @@map("player_vocation_techniques")
}

model PlayerVocationDailyCap {
  playerId        String   @id @map("player_id")
  dayStart        DateTime @map("day_start")
  turnsSpent      Int      @default(0) @map("turns_spent")
  updatedAt       DateTime @updatedAt @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@map("player_vocation_daily_caps")
}

model PlayerVocationCounter {
  playerId  String @map("player_id")
  statKey   String @map("stat_key")
  value     Int    @default(0)

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@id([playerId, statKey])
  @@map("player_vocation_counters")
}
```

Add explicit recipe mapping and item marks:

```prisma
model CraftingRecipe {
  // existing fields
  vocationId String? @map("vocation_id")
}

model Item {
  // existing fields
  craftMarks Json? @map("craft_marks")
}
```

Remove exploratory generic honing schema fields:

- `Player.dailyHoningTurnsSpent`
- `Player.lastHoningResetAt`
- `PlayerSkill.honing`

---

## Shared Runtime Shape

Create shared types and definitions in `packages/shared` so API and web use one source of truth.

Recommended files:

- `packages/shared/src/types/vocation.types.ts`
- `packages/shared/src/constants/vocationDefinitions.ts`
- `packages/shared/src/utils/vocationProgress.ts`
- `packages/shared/src/utils/vocationCraftMarks.ts`
- `packages/shared/src/utils/vocationTechniqueEffects.ts`

Core types:

```ts
export type VocationId =
  | 'prospector'
  | 'forester'
  | 'herbalist'
  | 'weaponsmith'
  | 'bowyer'
  | 'staffwright'
  | 'armorer'
  | 'leatherworker'
  | 'tailor'
  | 'jeweller'
  | 'alchemist';

export type VocationBranchId =
  | 'foundation'
  | 'fieldcraft'
  | 'output'
  | 'combat-profile'
  | 'prestige';

export type TechniqueEffect =
  | CraftTechniqueEffect
  | GatheringTechniqueEffect
  | EquipmentActionModifierEffect;

export interface VocationDefinition {
  id: VocationId;
  name: string;
  fantasy: string;
  mentorTowns: Array<'millbrook' | 'thornwall'>;
  passiveSources: VocationPassiveSource[];
  techniques: VocationTechniqueDefinition[];
}

export interface VocationTechniqueDefinition {
  id: string;
  vocationId: VocationId;
  branchId: VocationBranchId;
  name: string;
  rankRequired: number;
  pointCost: number;
  mentorTier: 'basic' | 'advanced' | 'prestige';
  appliesTo: VocationApplicationRule;
  craftMark?: CraftMarkDefinition;
  effects: TechniqueEffect[];
}
```

Use named effects rather than generic perk buckets. Every technique should have a craft fantasy and an in-game tradeoff or specific utility.

---

## Vocation Definition Starter Set

Define all 11 vocations at launch with 2-3 branches and 2-3 techniques per branch. Keep values modest for first launch, but make the techniques distinct.

### Prospector

- Branch: `Vein Reading`
  - `clean_split`: ore gather actions spend fewer turns when node capacity is high.
  - `seam_following`: chance not to reduce node capacity after a normal ore yield.
  - `deep_ear`: higher existing gem crit chance on metal nodes, no new resource grade.
- Branch: `Field Kit`
  - `reinforced_pick_points`: reduced tool durability loss for mining tools.
  - `load_balance`: extra ore yield only when inventory has enough remaining capacity.
- Branch: `Refiner's Eye`
  - `low_slag_batch`: smelting/refining outputs get better material efficiency for metal intermediate recipes.
  - `bright_inlay_stock`: jewellery recipes using metal components gain a small gem crit synergy.

### Forester

- Branch: `Wood Sense`
  - `grain_reading`: wood gather actions have reduced turn cost on healthy nodes.
  - `clean_felling`: chance not to reduce node capacity after normal timber yield.
  - `sapline_cut`: increased existing crit output chance on tree nodes.
- Branch: `Drying and Seasoning`
  - `seasoned_staves`: staff crafts can receive stability marks.
  - `bow_stave_selection`: bow crafts can receive draw marks.
- Branch: `Field Kit`
  - `edge_maintenance`: reduced axe durability loss.
  - `pack_lashing`: small inventory pressure relief for wood-heavy returns.

### Herbalist

- Branch: `Foraging`
  - `leaf_memory`: herb gather actions have lower turn cost after the first gather from the same node.
  - `gentle_pull`: chance not to reduce herb node capacity.
  - `rare_bloom_eye`: increased existing crit chance on herb nodes.
- Branch: `Preparation`
  - `clean_maceration`: alchemy recipes with herb materials can select purity marks.
  - `dry_bundle`: increases output quantity for basic reagent preparation recipes.
- Branch: `Field Kit`
  - `soft_wraps`: reduced sickle/tool durability loss.
  - `tidy_satchel`: small capacity convenience for herb-heavy returns.

### Weaponsmith

- Branch: `Edge Geometry`
  - `keen_edge`: weapon mark that increases damage for matching melee action families and increases durability wear.
  - `weighted_spine`: weapon mark that increases stamina cost and damage for heavy melee actions.
  - `true_balance`: weapon mark that improves accuracy for named precision melee actions.
- Branch: `Heat Treatment`
  - `spring_temper`: reduces durability penalty on aggressive marks.
  - `hard_quench`: improves armor penetration style modifiers where supported by existing action effects.
- Branch: `Workshop Flow`
  - `clean_forging`: modest material efficiency on weapon recipes.
  - `steady_jigs`: reduced turn cost on weapon recipes.

### Bowyer

- Branch: `Draw Profile`
  - `tight_string`: bow mark that increases damage for bow/ranged action families and increases stamina cost.
  - `soft_release`: bow mark that reduces stamina cost and slightly lowers damage.
  - `snap_nock`: bow mark that improves crit chance for named ranged actions.
- Branch: `Limb Work`
  - `layered_limb`: reduces durability penalty on high-draw marks.
  - `quick_tiller`: reduced turn cost on bow recipes.
- Branch: `Fletching`
  - `true_fletch`: improves accuracy for bow action families.
  - `broadhead_set`: increases damage for heavy ranged actions with extra durability wear.

### Staffwright

- Branch: `Focus Channel`
  - `wide_channel`: staff mark that increases mana cost and spell damage for matching magic action families.
  - `soft_channel`: staff mark that lowers mana cost and slightly lowers spell damage.
  - `steady_focus`: staff mark that improves accuracy or reliability for named spells.
- Branch: `Core Selection`
  - `resonant_core`: improves crit/effect chance for compatible magic actions.
  - `sealed_grain`: reduces durability penalty on high-channel marks.
- Branch: `Workshop Flow`
  - `lathe_rhythm`: reduced turn cost on staff recipes.
  - `smooth_finish`: modest material efficiency on staff recipes.

### Armorer

- Branch: `Plate Profile`
  - `heavy_plate`: armor mark that increases armor and reduces dodge/evasion.
  - `sloped_plate`: armor mark that improves defense against heavy melee families with extra durability wear.
  - `jointed_plate`: armor mark that reduces dodge penalty from heavy armor recipes.
- Branch: `Reinforcement`
  - `double_rivet`: increases max durability on metal armor at a material cost premium.
  - `field_repair_fit`: improves repair efficiency for marked armor if repair systems support item marks.
- Branch: `Workshop Flow`
  - `template_plates`: reduced turn cost on metal armor recipes.
  - `nested_cuts`: modest material efficiency on metal armor recipes.

### Leatherworker

- Branch: `Mobility Cut`
  - `supple_cut`: leather armor mark that improves dodge/evasion and reduces armor.
  - `layered_hide`: leather armor mark that increases armor and slightly increases stamina cost for physical actions.
  - `quiet_stitch`: improves stealth/evasion style action families when those actions exist.
- Branch: `Reinforcement`
  - `waxed_seam`: reduces durability wear from mobility marks.
  - `hard_patch`: improves resistance profile through existing armor/magic defense stats.
- Branch: `Workshop Flow`
  - `pattern_stack`: reduced turn cost on leather armor recipes.
  - `scrap_sense`: modest material efficiency on leather recipes.

### Tailor

- Branch: `Cloth Fall`
  - `light_drape`: cloth armor mark that improves dodge/evasion and reduces armor.
  - `ward_weave`: cloth armor mark that improves magic defense and reduces physical armor.
  - `focus_threads`: robe mark that improves mana efficiency for compatible magic action families and lowers damage slightly.
- Branch: `Weaving`
  - `tight_weave`: increases durability for cloth armor.
  - `spell_lining`: improves compatible named spell effects through item action modifiers.
- Branch: `Workshop Flow`
  - `loom_rhythm`: reduced turn cost on cloth armor recipes.
  - `clean_pattern`: modest material efficiency on cloth recipes.

### Jeweller

- Branch: `Setting`
  - `secure_set`: jewellery mark that improves durability or reduces gem-related failure where applicable.
  - `sharp_facets`: jewellery mark that improves crit chance for compatible action families.
  - `calm_setting`: jewellery mark that improves accuracy/reliability instead of crit.
- Branch: `Attunement`
  - `battle_sigils`: ring/amulet mark that targets one action family for a small modifier.
  - `spell_sigils`: ring/amulet mark that targets one magic action family for a small modifier.
- Branch: `Workshop Flow`
  - `fine_tweezers`: reduced turn cost on jewellery recipes.
  - `stone_saver`: modest material efficiency on gem recipes.

### Alchemist

- Branch: `Extraction`
  - `strong_extract`: potion mark that improves effect magnitude and reduces output quantity or increases ingredient use.
  - `thin_extract`: potion mark that increases output quantity and lowers effect magnitude.
  - `stable_mix`: potion mark that improves reliability/duration where consumable effects support it.
- Branch: `Catalysts`
  - `hot_catalyst`: increases potion potency at higher material cost.
  - `cool_catalyst`: lowers potency but improves batch yield.
- Branch: `Workshop Flow`
  - `clean_flask`: reduced turn cost on alchemy recipes.
  - `measured_pour`: modest material efficiency on alchemy recipes.

---

## Phase 1 - Remove Generic Honing Scaffolding

### Task 1.1 - Create a Clean Diff Inventory

- [ ] Run:

```powershell
rtk git status --short
rtk git diff --stat
```

- [ ] Record the exploratory honing files listed in the Current State section.
- [ ] Inspect each modified file before editing and separate generic honing changes from unrelated user work.

### Task 1.2 - Remove Generic Honing Files

- [ ] Delete only these untracked generic honing files:

```powershell
Resolve-Path apps/api/src/routes/crafting/honing.ts
Resolve-Path apps/api/src/routes/crafting/honing.test.ts
Resolve-Path apps/api/src/services/honingService.ts
Resolve-Path apps/api/src/services/honingService.test.ts
Resolve-Path apps/api/src/services/__tests__/honingService.test.ts
Resolve-Path apps/web/src/app/game/hooks/useHoningActions.ts
Resolve-Path apps/web/src/components/common/HoningStation.tsx
Resolve-Path apps/web/src/lib/api/honing.ts
Resolve-Path packages/database/prisma/migrations/20260520081527_add_tradeskill_honing
Remove-Item -LiteralPath apps/api/src/routes/crafting/honing.ts
Remove-Item -LiteralPath apps/api/src/routes/crafting/honing.test.ts
Remove-Item -LiteralPath apps/api/src/services/honingService.ts
Remove-Item -LiteralPath apps/api/src/services/honingService.test.ts
Remove-Item -LiteralPath apps/api/src/services/__tests__/honingService.test.ts
Remove-Item -LiteralPath apps/web/src/app/game/hooks/useHoningActions.ts
Remove-Item -LiteralPath apps/web/src/components/common/HoningStation.tsx
Remove-Item -LiteralPath apps/web/src/lib/api/honing.ts
Remove-Item -Recurse -LiteralPath packages/database/prisma/migrations/20260520081527_add_tradeskill_honing
```

- [ ] Use `apply_patch` to remove generic honing imports, router registration, UI panels, analytics events, state update fields, and constants from modified files while preserving unrelated edits.
- [ ] Remove `TRADESKILL_HONING_CONSTANTS`, `PlayerSkillHoning`, `HoningPerkType`, and related state update shapes.

### Task 1.3 - Restore Baseline Tests

- [ ] Run:

```powershell
npm run typecheck
npm run test:api -- stateUpdateHelpers
```

- [ ] Fix compile errors caused by removing generic honing references.
- [ ] Commit:

```powershell
git add .
git commit -m "chore: remove generic tradeskill honing scaffold"
```

---

## Phase 2 - Shared Vocation Definitions

### Task 2.0 - Add Launch Constants

- [ ] Edit `packages/shared/src/constants/gameConstants.ts`.
- [ ] Add the initial tuning block:

```ts
export const VOCATION_MASTERY = {
  DAILY_HONING_TURN_LIMIT: 120,
  ACTIVE_XP_PER_TURN: 10,
  PASSIVE_CRAFT_XP_MULTIPLIER: 0.2,
  PASSIVE_GATHER_XP_MULTIPLIER: 0.15,
  RESPEC_REFUND_RATE: 0.6,
} as const;
```

- [ ] Keep the constants in shared code so API, tests, and UI use the same values.

### Task 2.1 - Add Shared Vocation Types

- [ ] Create `packages/shared/src/types/vocation.types.ts`.
- [ ] Export:
  - `VocationId`
  - `VocationRank`
  - `VocationProgress`
  - `VocationTechniqueDefinition`
  - `CraftMarkDefinition`
  - `CraftMark`
  - `EquipmentActionModifier`
  - `VocationApplicationRule`
  - `VocationSnapshot`
  - request/response DTOs for API and frontend use.
- [ ] Add exports to `packages/shared/src/types/index.ts` or `packages/shared/src/index.ts`, following the existing export layout.

Core DTOs:

```ts
export interface PlayerVocationState {
  vocationId: VocationId;
  xp: number;
  rank: number;
  masteryPoints: number;
  spentPoints: number;
  learnedTechniqueIds: string[];
}

export interface VocationSnapshot {
  vocations: PlayerVocationState[];
  dailyCap: {
    dayStart: string;
    turnsSpent: number;
    turnsLimit: number;
    turnsRemaining: number;
  };
}
```

### Task 2.2 - Add Progress Math

- [ ] Create `packages/shared/src/utils/vocationProgress.ts`.
- [ ] Implement pure functions:

```ts
export function getVocationRankForXp(xp: number): number;
export function getMasteryPointsForRank(rank: number): number;
export function getVocationXpForRank(rank: number): number;
export function getPartialRespecRefund(spentPoints: number): number;
```

- [ ] Keep the curve slower than normal skill levels and bounded for first launch. Use constants from `packages/shared/src/constants/gameConstants.ts` for tunable values.
- [ ] Add tests in `packages/shared/src/utils/vocationProgress.test.ts`:
  - rank is monotonic as XP increases.
  - mastery points never decrease.
  - partial respec refunds less than full spent points and at least one point when enough points were spent.

### Task 2.3 - Add Vocation Definitions

- [ ] Create `packages/shared/src/constants/vocationDefinitions.ts`.
- [ ] Define all 11 vocations with branch and technique data from the starter set.
- [ ] Add `getVocationDefinition(vocationId)`, `getTechniqueDefinition(techniqueId)`, and `assertValidVocationDefinitions()`.
- [ ] Ensure technique IDs are globally unique.
- [ ] Add tests in `packages/shared/src/constants/vocationDefinitions.test.ts`:
  - every launch vocation exists.
  - every vocation has at least 2 branches and at least 6 techniques.
  - every technique references its own vocation.
  - every technique has rank requirement, point cost, application rule, and at least one effect.
  - no effect uses generic perk IDs such as `efficiency`, `yield`, `quality`, `costReduction`, or `specialization`.

### Task 2.4 - Verification

- [ ] Run:

```powershell
npm run test -w packages/shared -- vocationProgress.test.ts vocationDefinitions.test.ts
npm run typecheck
```

- [ ] Commit:

```powershell
git add packages/shared
git commit -m "feat(shared): add vocation mastery definitions"
```

---

## Phase 3 - Database Schema and Migration

### Task 3.1 - Update Prisma Schema

- [ ] Edit `packages/database/prisma/schema.prisma`.
- [ ] Add `PlayerVocation`, `PlayerVocationTechnique`, `PlayerVocationDailyCap`, and `PlayerVocationCounter`.
- [ ] Add relations on `Player`:

```prisma
vocations         PlayerVocation[]
vocationDailyCap  PlayerVocationDailyCap?
vocationCounters  PlayerVocationCounter[]
```

- [ ] Add `vocationId String? @map("vocation_id")` to `CraftingRecipe`.
- [ ] Add `craftMarks Json? @map("craft_marks")` to `Item`.
- [ ] Remove exploratory generic honing fields from `Player` and `PlayerSkill`.

### Task 3.2 - Generate Migration

- [ ] Run:

```powershell
npm run db:migrate -- --name add_vocation_mastery
npm run db:generate
```

- [ ] Inspect the generated SQL migration. Confirm it:
  - creates the new tables.
  - adds `craft_marks` and `vocation_id`.
  - removes only exploratory honing columns if they are present in the migration history.
  - does not drop unrelated data.

### Task 3.3 - Seed Recipe Vocation IDs

- [ ] Locate recipe seed files with:

```powershell
rg "CraftingRecipe|craftingRecipe|recipe" packages apps -g "*.ts"
```

- [ ] Update recipe seed data so every launch craft recipe has a `vocationId` where the mapping is not derivable from output type.
- [ ] Use explicit mappings for ambiguous outputs:
  - bows -> `bowyer`
  - staves/wands -> `staffwright`
  - melee weapons -> `weaponsmith`
  - metal armor -> `armorer`
  - leather armor -> `leatherworker`
  - cloth armor -> `tailor`
  - jewellery -> `jeweller`
  - potions/reagents -> `alchemist`

### Task 3.4 - Verification

- [ ] Run:

```powershell
npm run db:generate
npm run typecheck
```

- [ ] Commit:

```powershell
git add packages/database
git commit -m "feat(database): add vocation mastery schema"
```

---

## Phase 4 - Pure Vocation Helpers

### Task 4.1 - Add Recipe and Gathering Mapping Helpers

- [ ] Create `packages/shared/src/utils/vocationMapping.ts`.
- [ ] Implement:

```ts
export function resolveRecipeVocation(input: {
  recipeVocationId?: string | null;
  resultSlot?: string | null;
  resultItemType?: string | null;
  recipeSkillType?: string | null;
}): VocationId | null;

export function resolveGatheringVocation(skillType: string): VocationId | null;
```

- [ ] Prefer explicit `recipeVocationId`. Fall back to output type only for unambiguous cases.
- [ ] Never infer `bowyer`, `staffwright`, and `weaponsmith` only from a broad `weaponsmithing` skill without output context.

### Task 4.2 - Add Technique Eligibility Helpers

- [ ] Create `packages/shared/src/utils/vocationTechniqueEffects.ts`.
- [ ] Implement pure helpers:

```ts
export function getEligibleTechniquesForCraft(input: {
  vocationId: VocationId;
  learnedTechniqueIds: string[];
  recipeId: string;
  resultSlot?: string | null;
  resultItemType?: string | null;
}): VocationTechniqueDefinition[];

export function getEligibleTechniquesForGathering(input: {
  vocationId: VocationId;
  learnedTechniqueIds: string[];
  skillType: string;
  nodeType?: string | null;
}): VocationTechniqueDefinition[];
```

- [ ] Add effect application helpers:

```ts
export interface CraftTechniqueApplication {
  turnCostMultiplier: number;
  materialCostMultiplier: number;
  outputQuantityDelta: number;
  craftMarks: CraftMark[];
}

export interface GatheringTechniqueApplication {
  turnCostMultiplier: number;
  yieldMultiplier: number;
  capacityConsumptionMultiplier: number;
  critChanceAdd: number;
}
```

- [ ] Preserve default multipliers as `1` and additive values as `0`.
- [ ] Reject multiple selected techniques for launch if the design allows one applied technique per craft/gather action. If multiple are allowed later, add a stacking rule before changing this.

### Task 4.3 - Verification

- [ ] Add tests:
  - `packages/shared/src/utils/vocationMapping.test.ts`
  - `packages/shared/src/utils/vocationTechniqueEffects.test.ts`
- [ ] Run:

```powershell
npm run test -w packages/shared -- vocationMapping.test.ts vocationTechniqueEffects.test.ts
npm run typecheck
```

- [ ] Commit:

```powershell
git add packages/shared
git commit -m "feat(shared): add vocation effect helpers"
```

---

## Phase 5 - API Vocation Service

### Task 5.1 - Add Vocation Service

- [ ] Create `apps/api/src/services/vocationService.ts`.
- [ ] Use Prisma transactions for multi-step updates.
- [ ] Reuse `getDayStart()` from `apps/api/src/utils/dateHelpers.ts` for UTC daily reset.
- [ ] Reuse the existing turn spending helper that applies guild tax atomically. Every active honing turn spend must apply the same turn-tax rules as other turn-spending actions.

Service functions:

```ts
export async function getVocationSnapshot(playerId: string): Promise<VocationSnapshot>;

export async function honeVocation(input: {
  playerId: string;
  vocationId: VocationId;
  turns: number;
}): Promise<VocationActionResult>;

export async function grantPassiveVocationXpTx(input: {
  tx: Prisma.TransactionClient;
  playerId: string;
  vocationId: VocationId;
  source: 'craft' | 'gather';
  baseXp: number;
}): Promise<PlayerVocationState>;

export async function learnTechnique(input: {
  playerId: string;
  vocationId: VocationId;
  techniqueId: string;
}): Promise<VocationActionResult>;

export async function respecVocation(input: {
  playerId: string;
  vocationId: VocationId;
}): Promise<VocationActionResult>;
```

### Task 5.2 - Active Honing Rules

- [ ] Store daily usage in `PlayerVocationDailyCap`.
- [ ] Reset cap when stored `dayStart` is before current `getDayStart()`.
- [ ] Enforce a global per-player daily limit from `gameConstants.ts`, not per vocation.
- [ ] Grant active mastery XP using a constant such as `VOCATION_MASTERY.ACTIVE_XP_PER_TURN`.
- [ ] Require the player to be in a town that has the vocation mentor tier needed for the requested action.
- [ ] Return updated turns, vocation snapshot, and state update payload.

### Task 5.3 - Technique Learning and Respec Rules

- [ ] Validate technique exists, belongs to vocation, rank requirement is met, mentor tier is available, and unspent mastery points cover `pointCost`.
- [ ] Insert learned technique and update `spentPoints` in the same transaction.
- [ ] Respec deletes learned techniques, refunds partial points with `getPartialRespecRefund(spentPoints)`, preserves XP and rank, and records a vocation counter for respecs.
- [ ] Return clear typed errors for:
  - unknown vocation.
  - unknown technique.
  - rank too low.
  - not enough mastery points.
  - daily cap exceeded.
  - not enough turns.
  - wrong town/mentor.

### Task 5.4 - Service Tests

- [ ] Add `apps/api/src/services/vocationService.test.ts`.
- [ ] Cover:
  - active honing spends turns and increments daily cap.
  - daily cap resets at UTC day start.
  - active honing cannot exceed cap.
  - passive XP ranks up and grants mastery points.
  - learning a technique spends points.
  - respec refunds partial points and keeps XP.
  - wrong-town mentor gates reject actions.

### Task 5.5 - Verification

- [ ] Run:

```powershell
npm run test:api -- vocationService.test.ts
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api/src/services packages/shared
git commit -m "feat(api): add vocation mastery service"
```

---

## Phase 6 - API Routes and State Updates

### Task 6.1 - Add Route Schemas

- [ ] Create `apps/api/src/routes/vocations.ts`.
- [ ] Use Zod for all payloads:

```ts
const honeVocationSchema = z.object({
  vocationId: z.string(),
  turns: z.number().int().positive().max(100),
});

const learnTechniqueSchema = z.object({
  vocationId: z.string(),
  techniqueId: z.string(),
});
```

- [ ] Endpoints:
  - `GET /api/v1/vocations`
  - `POST /api/v1/vocations/hone`
  - `POST /api/v1/vocations/techniques/learn`
  - `POST /api/v1/vocations/respec`

### Task 6.2 - Register Router

- [ ] Edit `apps/api/src/app.ts`.
- [ ] Register:

```ts
app.use('/api/v1/vocations', vocationsRouter);
```

- [ ] Do not register vocation routes inside the crafting router.

### Task 6.3 - Shared State Update Types

- [ ] Edit `packages/shared/src/types/stateUpdates.types.ts`.
- [ ] Add vocation updates:

```ts
vocations?: VocationSnapshot;
```

- [ ] Ensure `apps/api/src/services/stateUpdateHelpers.ts` can include vocation snapshots without special-casing generic honing.
- [ ] Add or adjust `apps/api/src/services/stateUpdateHelpers.test.ts`.

### Task 6.4 - Route Tests

- [ ] Add `apps/api/src/routes/vocations.test.ts`.
- [ ] Cover auth, Zod validation, happy paths, and typed service errors.

### Task 6.5 - Verification

- [ ] Run:

```powershell
npm run test:api -- vocations.test.ts stateUpdateHelpers.test.ts
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api packages/shared
git commit -m "feat(api): expose vocation mastery routes"
```

---

## Phase 7 - Crafting Integration

### Task 7.1 - Accept Technique Selection

- [ ] Edit crafting route schemas in `apps/api/src/routes/crafting/`.
- [ ] Add optional `techniqueId` to craft requests.
- [ ] Validate it as a string and let the service decide eligibility.

### Task 7.2 - Apply Craft Technique Effects

- [ ] Edit `apps/api/src/services/crafting/craftRouteService.ts`.
- [ ] Resolve vocation with `resolveRecipeVocation()`.
- [ ] Load the player's learned techniques for that vocation.
- [ ] If `techniqueId` is present, validate it is learned and eligible for the recipe/output.
- [ ] Apply craft effect modifiers to:
  - turn cost before turns are spent.
  - material quantities before inventory removal.
  - output quantity.
  - item `craftMarks`.
- [ ] Grant passive vocation XP after a successful craft using `grantPassiveVocationXpTx()`.
- [ ] Increment vocation counters for:
  - craft completed by vocation.
  - technique used.
  - craft mark applied.
  - marked equipment created.

### Task 7.3 - Stackable Item Mark Handling

- [ ] Locate item creation/stacking helpers with:

```powershell
rg "stackable|quantity|addItem|createItem" apps/api/src packages -g "*.ts"
```

- [ ] Update stack matching so stackable outputs only merge when template, rarity, bonus stats, and `craftMarks` match.
- [ ] For stackable alchemy outputs, marked batches must not merge with unmarked batches.
- [ ] Add tests around marked potion stack separation.

### Task 7.4 - Crafting Tests

- [ ] Add or update crafting service tests:
  - crafting without a selected technique behaves as before except passive vocation XP is granted.
  - selected learned craft technique applies its named mark.
  - unlearned technique rejects the craft.
  - technique from the wrong vocation rejects the craft.
  - material and turn modifiers are applied before inventory/turn spending.
  - marked stackable outputs do not merge with unmarked outputs.

### Task 7.5 - Verification

- [ ] Run:

```powershell
npm run test:api -- craftRouteService
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api packages/shared packages/database
git commit -m "feat(api): apply vocation techniques to crafting"
```

---

## Phase 8 - Gathering Integration

### Task 8.1 - Accept Gathering Technique Selection

- [ ] Edit gathering route schemas and request handling in `apps/api/src/services/gatheringRouteService.ts` and its route file.
- [ ] Add optional `techniqueId` to gather requests.
- [ ] Resolve vocation from the gathering skill type:
  - mining -> `prospector`
  - woodcutting -> `forester`
  - herbalism/foraging -> `herbalist`

### Task 8.2 - Apply Gathering Technique Effects

- [ ] Apply technique effects to:
  - turn cost before spending turns.
  - yield calculation.
  - node capacity/depletion.
  - existing crit/gem crit chance.
  - tool durability loss where supported by current code.
- [ ] Do not introduce new resource grades.
- [ ] Grant passive vocation XP after successful gather.
- [ ] Increment vocation counters for:
  - gather completed by vocation.
  - technique used.
  - crit/gem crit caused while technique is selected.
  - capacity preservation.

### Task 8.3 - Gathering Tests

- [ ] Add or update tests:
  - gathering without technique behaves as before except passive vocation XP is granted.
  - selected learned gathering technique applies to turn cost.
  - crit modifier affects existing crit path.
  - capacity preservation cannot increase capacity above current max.
  - unlearned technique rejects the gather.

### Task 8.4 - Verification

- [ ] Run:

```powershell
npm run test:api -- gatheringRouteService
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api packages/shared
git commit -m "feat(api): apply vocation techniques to gathering"
```

---

## Phase 9 - Equipment Craft Marks in Combat

### Task 9.1 - Add Shared Craft Mark Resolver

- [ ] Create `packages/shared/src/utils/vocationCraftMarks.ts`.
- [ ] Implement:

```ts
export function parseCraftMarks(value: unknown): CraftMark[];

export function getEquipmentActionModifiers(input: {
  slot: string;
  craftMarks: CraftMark[];
}): EquipmentActionModifier[];
```

- [ ] Validate that marks target existing action families or named actions. Marks never unlock actions.

### Task 9.2 - Extend Equipment Stat Aggregation

- [ ] Edit `apps/api/src/services/equipmentService.ts`.
- [ ] Keep existing numeric stat aggregation.
- [ ] Add a parallel `actionModifiers` collection derived from equipped items' `craftMarks`.
- [ ] Include action modifiers in the combatant build input without placing them inside `bonusStats`.

### Task 9.3 - Apply Modifiers Before Action Resolution

- [ ] Locate combatant builders and action dispatch with:

```powershell
rg "PerActionScaling|actionDefinitions|resolveAction|buildPlayer" packages/game-engine apps/api/src -g "*.ts"
```

- [ ] Add a pure helper in `packages/game-engine`:

```ts
export function applyEquipmentActionModifiers(input: {
  action: ActionDefinition;
  modifiers: EquipmentActionModifier[];
}): ActionDefinition;
```

- [ ] Apply modifiers before affordability checks and before damage calculation.
- [ ] Support launch modifier fields:
  - damage multiplier delta.
  - accuracy delta.
  - crit chance delta if action resolution already supports it.
  - stamina cost delta.
  - mana cost delta.
  - durability wear multiplier for the equipped item.
- [ ] Ensure modifiers only apply when action family or action ID matches.
- [ ] If a player does not use the matching action, the mark has no effect.

### Task 9.4 - Durability Wear for Mark Tradeoffs

- [ ] Locate durability updates with:

```powershell
rg "durability|currentDurability|maxDurability" apps/api/src packages/game-engine -g "*.ts"
```

- [ ] Apply mark-specific durability wear multipliers to the item that provided the mark.
- [ ] Keep durability tradeoffs small enough for launch constants.
- [ ] Add tests proving high-output marks wear faster.

### Task 9.5 - Combat Tests

- [ ] Add tests in `packages/game-engine` for pure modifier behavior:
  - matching family applies modifier.
  - named action applies modifier.
  - non-matching action receives no modifier.
  - stamina/mana cost changes before affordability.
- [ ] Add API service tests for equipped marked item effects if existing combat tests live in API.

### Task 9.6 - Verification

- [ ] Run:

```powershell
npm run test:engine -- equipmentActionModifiers
npm run test:api -- combat
npm run typecheck
```

- [ ] Commit:

```powershell
git add packages/game-engine packages/shared apps/api
git commit -m "feat(combat): apply artisan craft marks"
```

---

## Phase 10 - Achievements and Titles

### Task 10.1 - Add Vocation Counters to Stats Service

- [ ] Edit `apps/api/src/services/statsService.ts`.
- [ ] Add helper functions for `PlayerVocationCounter`.
- [ ] Add derived stat resolution for vocation ranks from `PlayerVocation`.
- [ ] Supported stat key patterns:
  - `vocation_rank_<vocationId>`
  - `vocation_honed_turns_total`
  - `vocation_crafts_<vocationId>`
  - `vocation_gathers_<vocationId>`
  - `vocation_technique_uses_<techniqueId>`
  - `vocation_mark_crafted_<markId>`
  - `vocation_respecs_total`

### Task 10.2 - Add Achievement Definitions

- [ ] Edit `packages/shared/src/constants/achievementDefinitions.ts`.
- [ ] Add broad and vocation-specific achievements:
  - first hone.
  - first learned technique.
  - rank milestones per vocation.
  - first visible craft mark.
  - craft mark usage milestones.
  - gathering technique milestones.
  - all-vocation permanent-realm style milestones.
- [ ] Keep achievements as recognition/prestige, not gates for core techniques.

### Task 10.3 - Add Titles

- [ ] Locate title definitions with:

```powershell
rg "title|titles|PlayerTitle|achievement.*title" packages apps -g "*.ts"
```

- [ ] Add titles for branch/deed identity:
  - `Vein Reader`
  - `Master Bowyer`
  - `Edgewright`
  - `Ward Weaver`
  - `Sigil Setter`
  - `Grand Artisan`
- [ ] Wire title unlocks through existing achievement reward flow.

### Task 10.4 - Tests

- [ ] Add tests for:
  - vocation counter increments unlock achievements.
  - derived rank achievements work without duplicating rank into counters.
  - titles unlock from achievement reward flow.

### Task 10.5 - Verification

- [ ] Run:

```powershell
npm run test:api -- statsService achievement
npm run test -w packages/shared -- achievementDefinitions
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/api packages/shared
git commit -m "feat(progression): add vocation achievements and titles"
```

---

## Phase 11 - Frontend API, State, and UI

### Task 11.1 - Add Web API Client

- [ ] Create `apps/web/src/lib/api/vocations.ts`.
- [ ] Add:

```ts
export async function getVocations(): Promise<VocationSnapshot>;
export async function honeVocation(vocationId: VocationId, turns: number): Promise<VocationActionResponse>;
export async function learnVocationTechnique(vocationId: VocationId, techniqueId: string): Promise<VocationActionResponse>;
export async function respecVocation(vocationId: VocationId): Promise<VocationActionResponse>;
```

- [ ] Export from `apps/web/src/lib/api/index.ts`.

### Task 11.2 - Add Vocation Hook

- [ ] Create `apps/web/src/app/game/hooks/useVocationActions.ts`.
- [ ] Mirror existing game action hooks and state update handling.
- [ ] Support loading, error display, optimistic disable states, and response state updates.

### Task 11.3 - Add Mentor Panel

- [ ] Create `apps/web/src/components/common/VocationMentorPanel.tsx`.
- [ ] Use existing UI components such as `PixelCard`, `PixelButton`, existing tabs/menus, and established screen layout.
- [ ] Show:
  - vocation name, rank, XP progress, unspent points.
  - daily cap remaining.
  - mentor availability based on current town.
  - hone turn amount control.
  - branch list with named techniques.
  - learn and respec actions.
- [ ] Do not present this as a generic perk screen. Copy and layout should frame the panel as a mentor/workshop interaction.

### Task 11.4 - Add Technique Selectors to Crafting and Gathering

- [ ] Edit `apps/web/src/components/screens/Crafting.tsx`.
- [ ] Edit `apps/web/src/components/screens/Gathering.tsx`.
- [ ] Add a compact technique selector where an action is performed.
- [ ] Only list techniques learned by the player and eligible for the selected recipe/node.
- [ ] Show tradeoffs and craft mark names.
- [ ] Include no selected technique as a valid state.

### Task 11.5 - Show Craft Marks on Items

- [ ] Locate item renderers with:

```powershell
rg "bonusStats|durability|ItemCard|Inventory|Equipment" apps/web/src -g "*.tsx"
```

- [ ] Add `CraftMarkBadge` component.
- [ ] Show visible named marks in inventory, equipment, crafting output previews, and item tooltips.
- [ ] Show action-family relevance in concise text so players understand when a mark matters.

### Task 11.6 - Frontend Tests

- [ ] Add component/hook tests where the repo already tests web components.
- [ ] Cover:
  - vocation snapshot rendering.
  - daily cap display.
  - learned technique selector filtering.
  - craft mark badge rendering.
  - disabled learn button when rank/points are insufficient.

### Task 11.7 - Verification

- [ ] Run:

```powershell
npm run test -w apps/web -- VocationMentorPanel
npm run typecheck
```

- [ ] Commit:

```powershell
git add apps/web packages/shared
git commit -m "feat(web): add vocation mastery UI"
```

---

## Phase 12 - End-to-End Flow and Balancing Pass

### Task 12.1 - Add Integrated Scenario Tests

- [ ] Add API integration tests for the full flow:
  - player hones Bowyer.
  - player learns `tight_string`.
  - player crafts a bow with `tight_string`.
  - bow item has visible craft mark.
  - equipping the bow changes matching ranged action cost/damage.
  - unrelated action is unchanged.
  - achievement/title counters advance.

- [ ] Add a gathering scenario:
  - player hones Prospector.
  - player learns `deep_ear`.
  - mining with `deep_ear` increases existing gem crit path.
  - no new resource grade appears.

### Task 12.2 - Balance Constants Review

- [ ] Edit `packages/shared/src/constants/gameConstants.ts`.
- [ ] Review the `VOCATION_MASTERY` constants added in Phase 2 against test results and first-pass play feel.
- [ ] Validate constants against both realm types:
  - permanent characters can eventually broaden into many vocations.
  - seasonal characters must specialize to stay competitive.

### Task 12.3 - Documentation

- [ ] Update the design doc if implementation intentionally changes a named technique or launch constant:
  - `docs/superpowers/specs/2026-05-21-tradeskill-vocation-mastery-design.md`
- [ ] Add short implementation notes to the relevant existing docs only if the project has a current feature index for game systems.

### Task 12.4 - Simplify Pass

- [ ] Invoke `superpowers:simplify` because code changed.
- [ ] Review touched code only.
- [ ] Apply simplifications that remove duplication or improve type clarity without changing behavior.

### Task 12.5 - Final Verification

- [ ] Run focused and broad checks:

```powershell
npm run test -w packages/shared
npm run test:engine
npm run test:api
npm run test -w apps/web
npm run typecheck
npm run lint
```

- [ ] If web UI changed significantly and the user asks for browser verification, start the dev server using the project scripts and use the Browser plugin to verify the relevant screens.
- [ ] Commit:

```powershell
git add .
git commit -m "feat: add tradeskill vocation mastery"
```

---

## Implementation Notes

### Turn Spending

Active honing is a turn-spending action. It must use the existing turn spending path that handles guild tax and atomic updates. Do not directly decrement `Player.turns`.

### Daily Reset

Use UTC midnight through `getDayStart()`. Do not use a rolling 24 hour skill XP window for active honing caps.

### Passive XP

Passive vocation XP is awarded only on successful craft/gather actions. Failed or rejected actions must not award vocation XP.

### Technique Selection

First launch supports at most one selected technique per craft/gather action. Learned passive convenience techniques can apply automatically only when they are explicitly modeled as always-on effects. Craft marks are selected per craft.

### Craft Marks

Craft marks live on items as structured JSON and are visible to players. They modify equipment behavior only when equipped and only for matching action families or named actions. They never unlock actions.

### Stackable Marked Items

Stackable marked items require stack identity to include `craftMarks`; otherwise marked potions or reagents will merge with unmarked stacks and lose meaning.

### Achievements

Achievements and titles recognize vocation investment and deeds. They do not gate core progression or technique access for launch.

### Migration Safety

The exploratory migration can be removed before it is shared if it has not been applied outside this worktree. If it has already been applied in a shared environment, add a forward migration that drops the exploratory columns and creates the final tables.

---

## Self-Review Checklist

- [ ] The plan removes generic `+x%` honing and replaces it with named vocation techniques.
- [ ] The plan keeps normal skill XP/levels separate from vocation mastery.
- [ ] Active honing is turn-only and globally daily capped.
- [ ] Passive progress comes from natural craft/gather actions.
- [ ] All 11 vocations launch together.
- [ ] Techniques are selected per craft/gather action where applicable.
- [ ] Craft marks are visible and item-specific.
- [ ] Equipment marks modify existing actions and never unlock combat actions.
- [ ] Gathering techniques use existing yield, turn cost, capacity, depletion, discovery, and crit paths.
- [ ] Achievements and titles are included.
- [ ] Mentor/town gating is included.
- [ ] Exploratory `PlayerSkill.honing` state is removed.
- [ ] Tests cover shared math, services, routes, craft, gathering, combat marks, achievements, and UI.
