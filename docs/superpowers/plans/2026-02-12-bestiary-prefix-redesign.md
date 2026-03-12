# Bestiary Prefix Redesign

## Problem

170+ monsters × 10 prefixes = 1,700+ variant entries listed inline under each monster. All prefixes apply the same multipliers regardless of monster, so displaying them per-monster is redundant. Players learn nothing new from seeing "Weak Cave Bat" after already seeing "Weak Forest Rat".

## Solution

Split the Bestiary into two views and introduce a completionist tracking system.

## Design

### Prefix Encyclopedia (new "Prefixes" view)

A toggle at the top of the Bestiary screen switches between "Monsters" and "Prefixes" (default: Monsters).

The Prefixes view lists all 10 prefixes as cards. Undiscovered prefixes show as `???`.

**Progressive reveal** (based on total kills of any monster with that prefix):
- 1+ kills — prefix name revealed
- 3+ kills — stat multipliers shown (HP, damage, defence, etc.)
- 10+ kills — full details including spell patterns (shaman, venomous, spectral)

Each card shows total kills across all monsters as a counter.

### Monster Entry Changes

Remove the entire "Variants" section from each monster entry. Replace with a **prefix completion pip row**:

- 10 pips in fixed order: weak, frail, tough, gigantic, swift, ferocious, shaman, venomous, ancient, spectral
- Filled pip = killed at least one of this monster with that prefix
- Empty pip = not encountered
- Label: `3/10`
- Tooltip/tap on filled pip shows prefix name

**Mastered state:** All 10 filled → gold pips + "Mastered" badge on the monster card.

Everything else on monster entries stays the same (base stats, drops, zones, description, total kills, progressive stat reveal).

### API Changes

`GET /api/v1/bestiary` response changes:

**Per-monster:** Replace `prefixEncounters: Array<{ prefix, displayName, kills }>` with `prefixesEncountered: string[]` (just the prefix keys).

**Top-level:** Add `prefixSummary` array:
```typescript
prefixSummary: Array<{
  prefix: string
  displayName: string
  totalKills: number
  discovered: boolean
}>
```

Built from `GROUP BY prefix, SUM(kills)` on `PlayerBestiaryPrefix`.

### What Doesn't Change

- Database schema (no new tables)
- Combat routes / kill recording logic
- Game engine prefix logic
- Exploration / ambush flows

## Scope

- Bestiary API endpoint (read-side query changes)
- Bestiary.tsx (remove Variants, add toggle, add PrefixPipRow, add Prefixes view)
- Shared types (response shape update)
