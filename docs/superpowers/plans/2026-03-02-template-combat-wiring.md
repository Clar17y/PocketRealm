# Template Combat Wiring + Unified Resource Bars — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define all 24 talent action definitions, fix combat log serialization so template fields appear in the frontend, and create a unified ResourceStatusBar replacing fragmented HP/stamina/mana display.

**Architecture:** Add action definitions to the shared package, add a mapping layer in the combat API route to transform engine log fields to frontend field names, and build a single `ResourceStatusBar` component used across Dashboard, Explore, Combat tabs, and combat playback.

**Tech Stack:** TypeScript, React, Tailwind CSS, Express, Prisma (JSON columns).

**Design Doc:** `docs/superpowers/specs/2026-03-02-template-combat-wiring-design.md`

**Worktree:** `D:\Code\Adventure\.worktrees\adventure-combat-rework` (branch: `combat-rework`)

---

## Task 1: Define Talent Action Costs in gameConstants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (lines 465-491, COMBAT_ACTION_CONSTANTS)

**Step 1: Add talent action cost constants**

Add to `COMBAT_ACTION_CONSTANTS` (before the closing brace at line 491):

```typescript
  // Melee talent actions
  POWER_STRIKE_STAMINA: 15,
  CLEAVE_STAMINA: 25,
  BATTLE_CRY_STAMINA: 20,
  DEVASTATING_BLOW_STAMINA: 35,
  BERSERKER_RAGE_STAMINA: 30,
  EXECUTE_STAMINA: 40,
  TITANS_WRATH_STAMINA: 50,

  // Ranged talent actions
  AIMED_SHOT_STAMINA: 15,
  CRIPPLING_SHOT_STAMINA: 20,
  EAGLE_EYE_STAMINA: 15,
  VOLLEY_STAMINA: 30,
  SNIPERS_MARK_STAMINA: 25,
  PIERCING_SHOT_STAMINA: 35,
  DEATH_MARK_STAMINA: 45,

  // Magic talent actions
  FIRE_BOLT_MANA: 15,
  MINOR_HEAL_MANA: 20,
  FROST_NOVA_MANA: 20,
  ENHANCED_FORTITUDE_MANA: 25,
  CHAIN_LIGHTNING_MANA: 30,
  HEAL_ALLY_MANA: 35,
  ARCANE_BLAST_MANA: 40,
  REGENERATION_MANA: 30,
  METEOR_STRIKE_MANA: 50,

  // General talent actions
  TAUNT_STAMINA: 20,
  FORTIFY_STAMINA: 15,
  FORTIFY_MANA: 10,
```

**Step 2: Build packages**

Run: `npm run build --workspace=packages/shared`

**Step 3: Commit**

```
feat(shared): add talent action cost constants to gameConstants
```

---

## Task 2: Define 24 Talent Action Definitions

**Files:**
- Modify: `packages/shared/src/constants/combatActionDefinitions.ts`

**Step 1: Add melee action definitions**

After the `useManaPotion` definition (line 105) and before the registry (line 109), add all melee actions. Follow the same pattern as existing definitions. Example for power_strike:

```typescript
const powerStrike: ActionDefinition = {
  id: 'power_strike',
  name: 'Power Strike',
  description: 'A focused physical strike dealing 1.3x weapon damage.',
  actionType: 'skill_attack',
  category: 'offensive',
  cost: { stamina: COMBAT_ACTION_CONSTANTS.POWER_STRIKE_STAMINA, mana: 0 },
  damageMultiplier: 1.3,
  accuracyModifier: 0,
};
```

Define all 7 melee actions:
- `powerStrike`: 1.3x damage, `POWER_STRIKE_STAMINA` stamina
- `cleave`: 1.1x damage, `CLEAVE_STAMINA` stamina
- `battleCry`: category `'supportive'`, actionType `'buff'`, effect `{ name: 'Battle Cry', stat: 'attack', modifier: 15, duration: 4, isDebuff: false }`, `BATTLE_CRY_STAMINA` stamina
- `devastatingBlow`: 2.0x damage, `DEVASTATING_BLOW_STAMINA` stamina, `isChanneling: true`
- `berserkerRage`: category `'supportive'`, actionType `'buff'`, effect `{ name: 'Berserker Rage', stat: 'attack', modifier: 30, duration: 5, isDebuff: false }`, `BERSERKER_RAGE_STAMINA` stamina. Also add `defenceReduction: 15` to represent the -15% defence tradeoff.
- `execute`: 2.5x damage, `EXECUTE_STAMINA` stamina. (Engine will handle the <30% HP bonus logic via actionType `'skill_attack'`; the multiplier represents the high-end.)
- `titansWrath`: 2.5x damage, `TITANS_WRATH_STAMINA` stamina, `isChanneling: true`

**Step 2: Add ranged action definitions**

Define all 7 ranged actions:
- `aimedShot`: 1.3x damage, +5 accuracy, `AIMED_SHOT_STAMINA` stamina
- `cripplingShot`: 0.8x damage, `CRIPPLING_SHOT_STAMINA` stamina, effect `{ name: 'Crippled', stat: 'speed', modifier: -20, duration: 3, isDebuff: true }`
- `eagleEye`: category `'supportive'`, actionType `'buff'`, effect `{ name: 'Eagle Eye', stat: 'accuracy', modifier: 30, duration: 3 }`, `EAGLE_EYE_STAMINA` stamina
- `volley`: 0.7x damage, `VOLLEY_STAMINA` stamina (single-target mode; AoE in boss context handled by engine)
- `snipersMark`: category `'supportive'`, actionType `'debuff_spell'`, effect `{ name: "Sniper's Mark", stat: 'defence', modifier: -20, duration: 3, isDebuff: true }`, `SNIPERS_MARK_STAMINA` stamina
- `piercingShot`: 1.8x damage, `PIERCING_SHOT_STAMINA` stamina, `defenceReduction: 50`
- `deathMark`: 2.5x damage, `DEATH_MARK_STAMINA` stamina, effect `{ name: 'Death Mark', stat: 'defence', modifier: -40, duration: 4, isDebuff: true, damagePerRound: 5 }`

**Step 3: Add magic action definitions**

Define all 8 magic actions (mana costs, `damageType: 'magic'` for offensive):
- `fireBolt`: 1.2x magic damage, `FIRE_BOLT_MANA` mana, `damageType: 'magic'`
- `minorHeal`: category `'supportive'`, actionType `'heal_self'`, `healPercent: 0.20`, `MINOR_HEAL_MANA` mana, `isChanneling: true`
- `frostNova`: 0.9x magic damage, `FROST_NOVA_MANA` mana, `damageType: 'magic'`, effect `{ name: 'Frozen', stat: 'speed', modifier: -20, duration: 3, isDebuff: true }`
- `enhancedFortitude`: category `'defensive'`, actionType `'buff'`, effect `{ name: 'Fortitude', stat: 'defence', modifier: 20, duration: 4 }`, `ENHANCED_FORTITUDE_MANA` mana
- `chainLightning`: 1.5x magic damage, `CHAIN_LIGHTNING_MANA` mana, `damageType: 'magic'`
- `healAlly`: category `'supportive'`, actionType `'heal_ally'`, `healPercent: 0.30`, `HEAL_ALLY_MANA` mana, `isChanneling: true`
- `arcaneBlast`: 2.0x magic damage, `ARCANE_BLAST_MANA` mana, `damageType: 'magic'`, effect `{ name: 'Arcane Burn', stat: 'magicDefence', modifier: -15, duration: 3, isDebuff: true }`
- `regeneration`: category `'supportive'`, actionType `'heal_self'`, effect `{ name: 'Regeneration', stat: 'hp', modifier: 0, duration: 4, healPerRound: 8 }`, `REGENERATION_MANA` mana
- `meteorStrike`: 2.5x magic damage, `METEOR_STRIKE_MANA` mana, `damageType: 'magic'`, `isChanneling: true`

**Step 4: Add general action definitions**

Define 2 general actions:
- `taunt`: category `'defensive'`, actionType `'taunt'`, `tauntDuration: 2`, `TAUNT_STAMINA` stamina
- `fortify`: category `'defensive'`, actionType `'buff'`, effect `{ name: 'Fortified', stat: 'defence', modifier: 30, duration: 3 }`, `FORTIFY_STAMINA` stamina + `FORTIFY_MANA` mana

**Step 5: Register all 24 actions in BASE_ACTION_DEFINITIONS**

Add all 24 entries to the `BASE_ACTION_DEFINITIONS` record (lines 109-119):

```typescript
export const BASE_ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  // Base actions
  light_attack: lightAttack,
  normal_attack: normalAttack,
  heavy_attack: heavyAttack,
  defend,
  counter,
  ward,
  use_hp_potion: useHpPotion,
  use_stamina_potion: useStaminaPotion,
  use_mana_potion: useManaPotion,
  // Melee talents
  power_strike: powerStrike,
  cleave,
  battle_cry: battleCry,
  devastating_blow: devastatingBlow,
  berserker_rage: berserkerRage,
  execute,
  titans_wrath: titansWrath,
  // Ranged talents
  aimed_shot: aimedShot,
  crippling_shot: cripplingShot,
  eagle_eye: eagleEye,
  volley,
  snipers_mark: snipersMark,
  piercing_shot: piercingShot,
  death_mark: deathMark,
  // Magic talents
  fire_bolt: fireBolt,
  minor_heal: minorHeal,
  frost_nova: frostNova,
  enhanced_fortitude: enhancedFortitude,
  chain_lightning: chainLightning,
  heal_ally: healAlly,
  arcane_blast: arcaneBlast,
  regeneration,
  meteor_strike: meteorStrike,
  // General talents
  taunt,
  fortify,
};
```

**Step 6: Build and verify**

Run: `npm run build --workspace=packages/shared && npm run build:web`

**Step 7: Commit**

```
feat(shared): define 24 talent action definitions with costs and effects
```

---

## Task 3: Fix Combat Log Serialization

**Files:**
- Modify: `apps/api/src/routes/combat/start.ts`
- Modify: `apps/api/src/routes/combat/logs.ts`

**Step 1: Add log mapping helper to start.ts**

Add a helper function that transforms `TemplateCombatLogEntry[]` to the frontend-expected shape. Place it near the top of `start.ts` (after imports):

```typescript
import { getActionDefinition } from '@adventure/shared';

function mapTemplateCombatLog(log: TemplateCombatLogEntry[]): CombatLogEntryResponse[] {
  return log.map(entry => {
    const isA = entry.actor === 'combatantA';
    const actionId = isA ? entry.combatantAAction : entry.combatantBAction;
    const actionDef = actionId ? getActionDefinition(actionId) : undefined;
    return {
      ...entry,
      actionId: actionId ?? undefined,
      actionName: actionDef?.name ?? undefined,
      staminaAfter: isA ? entry.combatantAStaminaAfter : entry.combatantBStaminaAfter,
      manaAfter: isA ? entry.combatantAManaAfter : entry.combatantBManaAfter,
      staminaCost: actionDef?.cost?.stamina ?? undefined,
      manaCost: actionDef?.cost?.mana ?? undefined,
      wasExhausted: entry.wasExhausted ?? undefined,
      interactionResult: entry.interactionResult ?? undefined,
    };
  });
}
```

Note: The actual import path and type names need to match the codebase. Read the existing imports at the top of `start.ts` to determine the correct import style. `TemplateCombatLogEntry` is from `@adventure/game-engine`. `CombatLogEntryResponse` is a frontend type — the backend just needs to ensure these fields are present in the JSON response.

**Step 2: Apply mapping to immediate combat response**

Find where the combat result `log` is included in the response (around line 704 where `f.log` is returned). Apply the mapping:

```typescript
// Before: log: f.log
// After:  log: mapTemplateCombatLog(f.log)
```

Do the same for the log stored in the activity log DB entries (lines 575-610 and 618-645) — store the mapped version so historical retrieval also works.

**Step 3: Apply mapping to combat log detail endpoint**

In `apps/api/src/routes/combat/logs.ts`, find the `GET /logs/:id` handler (lines 307-383). The stored log is already in the DB as raw engine output. When returning it, apply the mapping:

```typescript
// After reading the combat log from DB:
if (combat.log && Array.isArray(combat.log)) {
  combat.log = mapTemplateCombatLog(combat.log);
}
```

Extract the `mapTemplateCombatLog` helper into a shared utility (e.g., `apps/api/src/services/combatLogMapper.ts`) so both `start.ts` and `logs.ts` can import it.

**Step 4: Build and verify**

Run: `npm run build:api`

**Step 5: Test manually**

Start the dev server, create a template with "Heavy Attack", fight a mob. Check:
1. The immediate combat result shows `actionName: "Heavy Attack"` in log entries
2. The combat history detail also shows the action names

**Step 6: Commit**

```
feat(api): map template combat log fields to frontend response shape
```

---

## Task 4: Create ResourceStatusBar Component

**Files:**
- Create: `apps/web/src/components/common/ResourceStatusBar.tsx`

**Step 1: Create the component**

```tsx
'use client';

import { HP_CONSTANTS } from '@adventure/shared';
import { StatBar } from '@/components/StatBar';

interface ResourceStatusBarProps {
  currentHp: number;
  maxHp: number;
  currentStamina: number;
  maxStamina: number;
  currentMana: number;
  maxMana: number;
  hpRegenPerSecond?: number;
  isRecovering?: boolean;
  recoveryCost?: number | null;
  onQuickRest?: () => Promise<void>;
  onRecover?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
  compact?: boolean;
}

export function ResourceStatusBar({
  currentHp, maxHp,
  currentStamina, maxStamina,
  currentMana, maxMana,
  hpRegenPerSecond,
  isRecovering, recoveryCost,
  onQuickRest, onRecover,
  quickRestPercent, busyAction,
  compact,
}: ResourceStatusBarProps) {
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  const showRestButton = onQuickRest && currentHp < maxHp && !isRecovering;
  const showRecoverButton = onRecover && isRecovering;

  return (
    <div className={`bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg ${compact ? 'p-2' : 'p-3'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold font-mono ${
          isRecovering ? 'text-[var(--rpg-red)]'
          : hpRatio < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD ? 'text-[var(--rpg-red)]'
          : hpRatio < 0.5 ? 'text-yellow-400'
          : 'text-[var(--rpg-green-light)]'
        }`}>
          {isRecovering ? 'KO' : `${Math.floor(currentHp)} / ${maxHp} HP`}
        </span>
        <div className="flex items-center gap-2">
          {typeof hpRegenPerSecond === 'number' && !isRecovering && (
            <span className="text-xs text-[var(--rpg-text-secondary)]">+{hpRegenPerSecond}/s</span>
          )}
          {showRestButton && (
            <button
              className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--rpg-green-light)] text-black hover:brightness-110 transition-all disabled:opacity-50"
              onClick={onQuickRest}
              disabled={busyAction != null}
            >
              {busyAction === 'quick_rest' ? 'Resting...' : `Rest ${quickRestPercent ?? 100}%`}
            </button>
          )}
          {showRecoverButton && (
            <button
              className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--rpg-red)] text-white hover:brightness-110 transition-all disabled:opacity-50"
              onClick={onRecover}
              disabled={busyAction != null}
            >
              {busyAction === 'recovering' ? 'Recovering...' : `Recover (${recoveryCost ?? '?'} turns)`}
            </button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <StatBar current={isRecovering ? 0 : currentHp} max={maxHp} color="health" size="sm" showNumbers={false} />
        <StatBar current={currentStamina} max={maxStamina} color="stamina" size="sm" showNumbers={false} />
        <StatBar current={currentMana} max={maxMana} color="mana" size="sm" showNumbers={false} />
      </div>
    </div>
  );
}
```

**Step 2: Build and verify**

Run: `npm run build:web`

**Step 3: Commit**

```
feat(web): create unified ResourceStatusBar component
```

---

## Task 5: Replace HpStatusBar with ResourceStatusBar

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx` (line 8 import, line 125 usage)
- Modify: `apps/web/src/app/game/page.tsx` (thread staminaState/manaState to Exploration)
- Delete or deprecate: `apps/web/src/components/common/HpStatusBar.tsx` (after all usages replaced)

**Step 1: Update Exploration.tsx**

Replace `HpStatusBar` import with `ResourceStatusBar`. Update the props interface to accept stamina/mana state. Replace the render:

```tsx
{!playbackData && typeof currentHp === 'number' && typeof maxHp === 'number' && !isRecovering && (
  <ResourceStatusBar
    currentHp={currentHp}
    maxHp={maxHp}
    currentStamina={currentStamina}
    maxStamina={maxStamina}
    currentMana={currentMana}
    maxMana={maxMana}
    hpRegenPerSecond={regenPerSecond}
    onQuickRest={onQuickRest}
    quickRestPercent={quickRestPercent}
    busyAction={busyAction}
  />
)}
```

**Step 2: Thread stamina/mana to Exploration in page.tsx**

In the `case 'explore':` section of `renderScreen()`, add:
```typescript
currentStamina={staminaState.current}
maxStamina={staminaState.max}
currentMana={manaState.current}
maxMana={manaState.max}
```

**Step 3: Check for other HpStatusBar usages**

Search for `HpStatusBar` imports across the codebase. Replace all with `ResourceStatusBar`. If none remain, delete `HpStatusBar.tsx`.

**Step 4: Also add ResourceStatusBar to the Combat tab**

In `page.tsx`, find where the combat screen is rendered. Add `ResourceStatusBar` above the combat content (similar pattern to how Exploration shows it). This gives the player resource visibility when browsing encounter sites.

**Step 5: Build and verify**

Run: `npm run build:web`

**Step 6: Commit**

```
feat(web): replace HpStatusBar with ResourceStatusBar across screens
```

---

## Task 6: Remove Health Section from Dashboard

**Files:**
- Modify: `apps/web/src/components/screens/Dashboard.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Remove the Health PixelCard from Dashboard**

In `Dashboard.tsx`, remove:
- The PixelCard with Heart icon + HP display (lines 143-202)
- The stamina/mana bar rows (lines 204-224)

**Step 2: Remove HP/resource props from DashboardProps**

Remove from `DashboardProps.playerData`:
- `currentHp`, `maxHp`, `hpRegenRate`, `isRecovering`, `recoveryCost`
- `currentStamina`, `maxStamina`, `staminaRegenRate`
- `currentMana`, `maxMana`, `manaRegenRate`

**Step 3: Remove threading in page.tsx**

In the `case 'home':` section of `renderScreen()`, remove the corresponding props from the `playerData` object.

**Step 4: Add ResourceStatusBar to the Home tab**

In `page.tsx`, add `ResourceStatusBar` above the Dashboard content for the `'home'` screen, similar to how Exploration has it. This replaces the removed Dashboard health display:

```tsx
case 'home':
  return (
    <>
      <ResourceStatusBar
        currentHp={hpState.currentHp}
        maxHp={hpState.maxHp}
        currentStamina={staminaState.current}
        maxStamina={staminaState.max}
        currentMana={manaState.current}
        maxMana={manaState.max}
        hpRegenPerSecond={hpState.regenPerSecond}
        isRecovering={hpState.isRecovering}
        recoveryCost={hpState.recoveryCost}
        onQuickRest={handleQuickRest}
        onRecover={handleRecover}
        quickRestPercent={quickRestPercent}
        busyAction={busyAction}
      />
      <Dashboard ... />
    </>
  );
```

Look up `handleQuickRest`, `handleRecover`, `quickRestPercent`, and `busyAction` from the existing controller to thread correctly.

**Step 5: Build and verify**

Run: `npm run build:web`

**Step 6: Commit**

```
feat(web): remove health section from Dashboard, use ResourceStatusBar
```

---

## Task 7: Update CombatPlayback to Use ResourceStatusBar

**Files:**
- Modify: `apps/web/src/components/combat/CombatPlayback.tsx`

**Step 1: Replace custom HP bar rendering**

In `CombatPlayback.tsx`, the player's HP display (lines 178-218) uses custom `div` rendering with inline styles. Replace with `ResourceStatusBar`:

```tsx
<ResourceStatusBar
  currentHp={currentPlayerHp}
  maxHp={playerMaxHp}
  currentStamina={currentStamina}
  maxStamina={100}
  currentMana={currentMana}
  maxMana={100}
  compact
/>
```

For the mob, keep a simpler display (just HP bar, no stamina/mana) since mobs don't show resources to the player. Use `StatBar` directly for the mob HP.

**Step 2: Remove old custom bar divs**

Delete the manual `div` bar rendering for the player side. Keep the mob HP bar as a simple `StatBar`.

**Step 3: Verify shake animation still works**

The shake effect is applied to a wrapper `div` around the bars. Ensure the `ResourceStatusBar` is inside the shake wrapper so it still animates on hits.

**Step 4: Build and verify**

Run: `npm run build:web`

**Step 5: Commit**

```
feat(web): use ResourceStatusBar in combat playback
```

---

## Verification Checklist

After completing all 7 tasks:

1. `npm run build` — full build passes (packages + API + web)
2. `npm run test` — all tests pass
3. Manual test: Create a template with "Heavy Attack", fight a mob. Combat log should show "Heavy Attack" as the action name for each player round.
4. Manual test: Combat playback should show stamina/mana bars that deplete as actions cost resources.
5. Manual test: Dashboard shows ResourceStatusBar (HP + stamina + mana) instead of the old Health card.
6. Manual test: Exploration screen shows ResourceStatusBar with all three bars.
7. Manual test: Template editor shows all 24 talent actions (locked until unlocked via skill tree).
8. Manual test: Unlock a talent (e.g., Power Strike), verify it appears as available in the template editor.
