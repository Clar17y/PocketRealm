# Enhanced Combat Log Design

## Overview

Improve combat logs to show health tracking, explain hit/miss/damage calculations, display XP breakdown by skill, and provide historical access to all past fights.

## Data Model Changes

### Extended CombatLogEntry

```typescript
interface CombatLogEntry {
  round: number;
  actor: 'player' | 'mob';
  action: CombatAction;

  // Existing
  roll?: number;
  damage?: number;
  message: string;

  // New - expanded detail view
  attackModifier?: number;
  targetDefence?: number;
  rawDamage?: number;
  armorReduction?: number;
  isCritical?: boolean;

  // New - HP tracking
  playerHpAfter: number;
  mobHpAfter: number;
}
```

### New Game Constants

```typescript
COMBAT_XP_CONSTANTS = {
  DEFENCE_XP_PER_HIT_TAKEN: 1,
  EVASION_XP_PER_DODGE: 1,
  VITALITY_XP_FROM_COMBAT: 0,
}
```

### Combat Result Additions

```typescript
interface CombatResult {
  // ... existing fields

  secondarySkillXp: {
    defence: { events: number; xpGained: number };
    evasion: { events: number; xpGained: number };
  };
}
```

## UI Components

### Summary Panel

Pre-fight stats comparison at top of combat log.

- Shows player vs enemy stats side-by-side
- Enemy stats use bestiary unlock tiers ("??" for unrevealed)
- Info line shows kills needed for next unlock
- Mob level color-coded relative to player (green/yellow/red)

### Combat Log Entries

**Collapsed (default):**
```
R3  You  💥 Crit!  18 dmg  94/100  19/45
```

Shows: round, actor, outcome icon, damage, player HP, mob HP

**Icons:** ⚔️ Hit, ❌ Miss, 💨 Dodged, 💥 Crit, 🛡️ Blocked

**Expanded (on tap):**
```
Roll: 19 + 12 attack = 31 vs 18 — Hit!
Base damage: 14 × 1.5 crit = 21
Armor reduced: 3
Final damage: 18
```

### Rewards Summary

Post-combat rewards below the log.

**XP display format:**
```
⚔️ Melee    +150 XP (100%)  1,240/2,000 L11
🛡️ Defence   +4 XP (100%)     89/100 L2
   (4 hits taken)
💨 Evasion   +2 XP (100%)     34/100 L1
   (2 attacks dodged)
```

- Shows efficiency % and progress to next level
- Level-up highlighted inline: "⬆️ LEVEL 12!"
- Warning when approaching 6-hour XP cap
- Secondary skills show event count context

### Combat History Page

Dedicated page for reviewing past fights.

**Filters:** Zone, Mob type, Outcome (victory/defeat/fled), Sort (recent/XP)

**List item shows:**
- Outcome icon
- Mob name and level
- Zone name
- Time ago
- Round count
- Total XP gained

**Pagination:** Reusable component for combat history, resource nodes, inventory, etc.

## Secondary Skill XP

Combat awards tiny passive XP to secondary skills:

| Skill | From Combat | From Trainers |
|-------|-------------|---------------|
| Attack (melee/ranged/magic) | Full XP | Available |
| Defence | 1 XP per hit taken | Full XP |
| Evasion | 1 XP per dodge | Full XP |
| Vitality | None | Full XP |

All rates configurable via `COMBAT_XP_CONSTANTS`.

## File Changes

### New Files

- `apps/web/src/components/combat/CombatSummaryPanel.tsx`
- `apps/web/src/components/combat/CombatLogEntry.tsx`
- `apps/web/src/components/combat/CombatRewardsSummary.tsx`
- `apps/web/src/components/common/Pagination.tsx`
- `apps/web/src/components/screens/CombatHistory.tsx`

### Modified Files

- `packages/shared/src/types/combat.types.ts`
- `packages/shared/src/constants/gameConstants.ts`
- `packages/game-engine/src/combat/combatEngine.ts`
- `apps/api/src/routes/combat.ts`
- `apps/api/src/services/xpService.ts`
- `apps/web/src/components/screens/CombatLog.tsx`

### API Changes

- `GET /api/v1/combat/logs` — paginated list with filters (new)
- `GET /api/v1/combat/logs/:id` — existing, no changes
