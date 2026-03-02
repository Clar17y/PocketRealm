# Template Combat Wiring + Unified Resource Bars — Design

## Problem

1. Combat logs don't show action names, stamina/mana, or interaction results — the backend `runTemplateCombat()` populates these fields but the API route doesn't map them to the frontend response shape
2. 30 talent-tree-unlocked actions have no `ActionDefinition` entries, so they can't be used in templates or resolved by the combat engine
3. HP/stamina/mana display is fragmented across Dashboard (Health card + separate bars), HpStatusBar (HP only), and CombatPlayback (custom inline bars)

## Part 1: Fix Combat Log Serialization

**Root cause:** The engine returns `combatantAAction`, `combatantAStaminaAfter`, etc. (combatant-indexed). The frontend expects `actionName`, `staminaAfter`, etc. (actor-relative). The API route stores/returns the raw engine output without mapping.

**Fix:** In the combat route response serialization, map template combat fields per-entry based on which combatant is the actor:

```
entry.actor === 'combatantA' → staminaAfter = combatantAStaminaAfter, actionName = lookup(combatantAAction)
entry.actor === 'combatantB' → staminaAfter = combatantBStaminaAfter, actionName = lookup(combatantBAction)
```

The `actionName` display name comes from `getActionDefinition(actionId)?.name`.

**Files:** `apps/api/src/routes/combat/start.ts` — add a `mapTemplateCombatLog()` helper that transforms `TemplateCombatLogEntry[]` to the frontend `CombatLogEntryResponse[]` shape before returning or storing.

Also update `GET /combat/logs/:id` to apply the same mapping when reading stored logs (the raw data is in the DB, just needs reshaping on read).

## Part 2: Define 30 Talent Action Definitions

Add all talent-unlocked actions to `packages/shared/src/constants/combatActionDefinitions.ts` and register them in `BASE_ACTION_DEFINITIONS`.

**Melee tree (7 actions):** Physical damage, stamina-heavy costs.
- power_strike: 1.3x damage, 15 stamina — reliable upgrade over normal_attack
- cleave: 1.0x damage + hits twice (2 log entries), 25 stamina — AoE placeholder for boss
- battle_cry: buff +15% damage for 3 rounds, 20 stamina — self-buff
- devastating_blow: 2.0x damage, 35 stamina, channeling — high-risk nuke
- berserker_rage: buff +25% damage, -15% defence for 4 rounds, 30 stamina
- execute: 2.5x damage when target < 30% HP else 0.5x, 40 stamina — finisher
- titans_wrath: 3.0x damage, 50 stamina, channeling — capstone

**Ranged tree (7 actions):** Physical damage with debuffs, stamina costs.
- aimed_shot: 1.4x damage +5 accuracy, 15 stamina
- crippling_shot: 0.8x damage + debuff -20% speed 3 rounds, 20 stamina
- eagle_eye: buff +30% accuracy 3 rounds, 15 stamina
- volley: 0.7x damage hits twice, 30 stamina — multi-hit
- snipers_mark: debuff -25% defence on target 3 rounds, 25 stamina
- piercing_shot: 1.8x damage ignoring 50% armour, 35 stamina
- death_mark: debuff -40% defence + DoT 5/round for 4 rounds, 45 stamina — capstone

**Magic tree (8 actions):** Magic damage and healing, mana-heavy costs.
- fire_bolt: 1.2x magic damage, 15 mana
- minor_heal: heal 20% max HP, 20 mana, channeling
- frost_nova: 0.9x magic damage + debuff -20% speed 2 rounds, 20 mana
- enhanced_fortitude: buff +20% max HP for 4 rounds, 25 mana
- chain_lightning: 1.5x magic damage, 30 mana
- heal_ally: heal 30% max HP (boss context: heals lowest HP ally), 35 mana, channeling
- arcane_blast: 2.0x magic damage + debuff -15% magic defence, 40 mana
- regeneration: HoT 8% max HP/round for 4 rounds, 30 mana
- meteor_strike: 3.0x magic damage, 50 mana, channeling — capstone

**General tree (2 actions):** Utility, mixed costs.
- taunt: forces boss to target user for 2 rounds, 20 stamina — boss tank
- fortify: buff +30% defence for 3 rounds, 15 stamina + 10 mana

All costs added as new entries in `COMBAT_ACTION_CONSTANTS` in gameConstants.ts for easy tuning.

## Part 3: Unified Resource Status Bar

Replace `HpStatusBar` with `ResourceStatusBar` — a single component showing HP, stamina, and mana.

**Layout:**
```
┌──────────────────────────────────────┐
│ 85/100 HP                +0.4/s [Rest]│
│ ████████████████░░░░░░░░░░░ (sm)      │
│ ██████████████░░░░░░░░░░░░░ (sm)      │
│ ████████░░░░░░░░░░░░░░░░░░░ (sm)      │
└──────────────────────────────────────┘
```

- All three bars equal size (`sm`)
- HP text + regen rate + optional Rest button on top row
- Bars: green (HP), teal (stamina), blue (mana) — distinctive enough without labels
- `StatBar` gets `transition: width 0.4s ease-out` CSS for animated updates
- Optional `animate` prop to enable/disable transitions (enabled for playback, disabled for static)

**Props:**
```typescript
interface ResourceStatusBarProps {
  currentHp: number;
  maxHp: number;
  currentStamina: number;
  maxStamina: number;
  currentMana: number;
  maxMana: number;
  hpRegenPerSecond?: number;
  onQuickRest?: () => Promise<void>;
  quickRestPercent?: number;
  busyAction?: string | null;
  animate?: boolean; // enables CSS transitions for playback
  compact?: boolean; // smaller padding for inline use
}
```

**Used in:**
- Dashboard: replaces Health card + stam/mana rows
- Explore tab / Combat tab: replaces HpStatusBar
- Combat playback: replaces custom inline HP + stamina/mana bars (pass round-by-round values)

**NOT used in:**
- Boss panel participant list (keeps small per-participant inline bars)

## Part 4: Dashboard Cleanup

Remove from Dashboard:
- The `PixelCard` Health card with Heart icon, HP text, KO state, StatBar
- The stamina/mana bar rows below it
- Related `playerData` props: `currentHp`, `maxHp`, `hpRegenRate`, `isRecovering`, `recoveryCost`, `currentStamina`, `maxStamina`, `staminaRegenRate`, `currentMana`, `maxMana`, `manaRegenRate`

The `ResourceStatusBar` at the page level (above screen content, same placement as current `HpStatusBar`) handles all resource display.

If the player is knocked out, the `ResourceStatusBar` shows the KO state inline (red HP text, rest button becomes "Recover" button).
