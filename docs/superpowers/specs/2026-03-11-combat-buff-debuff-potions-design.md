# Combat Buff/Debuff Potion System — Design Spec

## Goal

Add cleanse and buff potions to the combat system so players can remove magic DOTs (e.g., Poison from spiders via Antivenom) and apply temporary stat buffs via consumable potions (Resist Potion, Elixir of Power).

## Scope

- New consumable effect types: `cleanse_magic_dot`, `buff_attack`, `buff_defence`
- Three new combat action slots: `use_cleanse_potion`, `use_resist_potion`, `use_elixir_of_power`
- All share the existing Potion Sickness timer (4 rounds, blocks all potions)
- Activate the three placeholder seed items: Antivenom Potion, Resist Potion, Elixir of Power
- No schema changes — everything fits in the existing `consumableEffect` JSON column

## Cleanse Mechanics

- Only removes **magic-type DOTs** (`dotDamageType: 'magic'`): Poison, Burn, Venom, Necrosis
- **Bleed** (`dotDamageType: 'physical'`) cannot be cleansed
- Groups active magic DOTs by effect name, sums `resolvedDamagePerRound` per group
- Removes the **entire group** with the highest total damage (all stacks of that DOT name)
- One potion = one cleanse (removes one DOT group, not all)

## Buff Mechanics

- **Elixir of Power** (Tier 5): `attackPercent` modifier (+25%) for 5 rounds
- **Resist Potion** (Tier 4): dual effect — `defence` +15 AND `magicDefence` +15 for 5 rounds
- Both respect `MAX_ACTIVE_BUFFS` cap (3)
- Same-name buff refreshes duration (existing behavior)

## Combat Template Actions

| Action ID | Category | Behavior |
|---|---|---|
| `use_cleanse_potion` | supportive, channeling | Reactive — auto-picks cleanse potion from pool when player has magic DOTs. Falls back to alternate branch → Defend if no debuffs or no potion. |
| `use_resist_potion` | supportive, channeling | Proactive — uses Resist Potion specifically. |
| `use_elixir_of_power` | supportive, channeling | Proactive — uses Elixir of Power specifically. |

All trigger and are blocked by Potion Sickness (shared timer).

## Constants

New group in `gameConstants.ts`:

```
BUFF_POTION_CONSTANTS:
  ELIXIR_ATTACK_PERCENT: 0.25      // +25% damage
  ELIXIR_DURATION: 5               // rounds
  RESIST_DEFENCE_BONUS: 15         // flat defence
  RESIST_MAGIC_DEFENCE_BONUS: 15   // flat magic defence
  RESIST_DURATION: 5               // rounds
```

## Type Changes

- `ConsumableEffectType`: add `'cleanse_magic_dot' | 'buff_attack' | 'buff_defence'`
- `ConsumableEffect`: add optional `duration?: number` field (for buff potions)
- `CombatPotion.potionType`: add `'cleanse' | 'buff_attack' | 'buff_defence'`
- `SupportiveAction`: add `'use_cleanse_potion' | 'use_buff_potion'`
- `ActionDefinition.potionType`: extend union to include new types
- `CombatAction`: add `'cleanse'` variant for log entries

## Seed Data Updates

- Antivenom Potion: `{ type: 'cleanse_magic_dot' }`
- Resist Potion: `{ type: 'buff_defence', value: 15, duration: 5 }`
- Elixir of Power: `{ type: 'buff_attack', value: 0.25, duration: 5 }`

## Engine Changes

- `templateCombatEngine.ts`: New `executeCleanseAction()` and `executeBuffPotionAction()` functions
- Potion pool building (`potionService.ts`): Map new effect types to new `potionType` values
- Potion fallback logic in main loop: extend to cover new potion types
- `potionService.ts`: `templateHasPotionActions` must recognize new action IDs
- `combatEffectNames.ts`: No changes needed (auto-extracts from action definitions)
