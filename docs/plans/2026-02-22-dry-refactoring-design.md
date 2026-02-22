# DRY Refactoring Design

## Goal

Extract 14 categories of duplicated code across the codebase into shared utilities, types, and helpers. Purely mechanical — no behavior changes.

## New Files

### Backend Utilities (`apps/api/src/utils/`)

| File | Exports | Replaces |
|------|---------|----------|
| `asyncHandler.ts` | `asyncHandler(fn)` — wraps Express handlers, catches errors, calls `next(err)` | 65 try/catch blocks across 24 route files |
| `pickWeighted.ts` | `pickWeighted<T>(items, getWeight): T \| null` — generic weighted random selection | 5 separate implementations |
| `prismaAny.ts` | `prismaAny` — `prisma as unknown as any` | Per-file casting in 11 files |

### Expanded `routeHelpers.ts`

| Export | Replaces | Occurrences |
|--------|----------|-------------|
| `assertNotRecovering(playerId)` | `getHpState` + throw if recovering | 12 in 9 files |
| `getOwnedItem(playerId, itemId, opts?)` | Fetch + ownership + equipment/stack checks | 5 in 4 files |
| `recordBestiaryKill(playerId, mobTemplateId, prefix?)` | Bestiary upsert + prefix upsert | 4 in 3 files |
| `trackAchievements(playerId, counters, statKeys?, familyIds?)` | incrementStats + checkAchievements + emitNotifications | 19 in 8 files |
| `buildCombatActivityLog(playerId, params)` | Activity log data object construction | ~10 in 3 files |
| `handleCombatDefeat(playerId, params)` | Flee calc + knockout + respawn + stats | 4 in 3 files |
| `toMobTemplate(raw)` | Prisma row → MobTemplate with spellPattern coercion | 6 in 3 files |

### Shared Types (`packages/shared/src/types/encounter.types.ts`)

- `EncounterSiteSize` — `'small' | 'medium' | 'large'`
- `EncounterMobRole` — `'trash' | 'elite' | 'boss'`
- `EncounterMobStatus` — `'alive' | 'defeated' | 'decayed'`
- `EncounterMobSlot` — common mob slot interface

### Frontend (`apps/web/src/lib/statFormat.ts`)

- `PERCENT_STATS`, `prettyStatName`, `formatStatValue`, `formatSignedStatValue`, `signedClass`, `numStat`, `prettyWeightClass`
- Replaces inline copies in Inventory, Equipment, Crafting, Forge, useGameController (5 files)

### Test Helper (`apps/api/src/__test__/setup.ts`)

- Performs `vi.mock` for database, exports pre-cast `mockPrisma`
- Replaces 3-line boilerplate in 27 test files

### Backend Import Consolidation

- `getSkillLevel()` — already exported from `combatStatsService.ts`; delete 3 duplicate copies in gathering.ts, crafting/helpers.ts, pvpService.ts

## Phasing

1. **Create utility files** — no existing code changes
2. **Mechanical replacements** — getSkillLevel, prismaAny, pickWeighted, encounter types, statFormat, spellPattern coercion
3. **Route handler extractions** — isRecovering, bestiary, item validation, achievements, activity log, defeat handling
4. **asyncHandler migration** — all 24 route files
5. **Test mock cleanup** — 27 test files
6. **Verification** — full test suite, typecheck, lint

## Constraints

- No behavior changes — all extractions must be pure refactors
- Tests must pass after each phase
- Existing test coverage validates correctness of extractions
