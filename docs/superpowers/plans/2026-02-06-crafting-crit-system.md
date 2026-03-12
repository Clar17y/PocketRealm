# Crafting Crit System

When crafting weapons/armor, players have a chance to "crit" adding a random bonus stat (+1 to +5). Crit chance scales with skill level above recipe requirement + equipped luck stat.

## Files to Modify

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma:125` | Add `bonusStats Json?` to Item model |
| `packages/shared/src/constants/gameConstants.ts:139` | Add crit constants to CRAFTING_CONSTANTS |
| `packages/shared/src/types/item.types.ts:16` | Add `bonusStats: ItemStats \| null` to Item interface |
| `packages/game-engine/src/crafting/craftingCrit.ts` | **NEW** - Pure crit calculation functions |
| `packages/game-engine/src/index.ts` | Export new crafting module |
| `apps/api/src/services/equipmentService.ts:6` | Add `luck` to EquipmentStats, sum bonusStats + luck in getEquipmentStats |
| `apps/api/src/routes/crafting.ts:164` | Integrate crit roll into item creation, return crit details |
| `apps/web/src/lib/api.ts:572` | Add `bonusStats` to getInventory response type |
| `apps/web/src/lib/api.ts:682` | Add `craftedItemDetails` to craft response type |
| `apps/web/src/app/game/useGameController.ts:121` | Add `bonusStats` to inventory state type |
| `apps/web/src/app/game/useGameController.ts:636` | Add crit log message in handleCraft |
| `apps/web/src/app/game/page.tsx:277` | Pass `bonusStats` through to Inventory component |
| `apps/web/src/app/game/page.tsx:306` | Pass `bonusStats` through to Equipment component |
| `apps/web/src/components/screens/Inventory.tsx:11` | Add `bonusStats` to Item interface, display in detail modal |
| `apps/web/src/components/screens/Equipment.tsx:11` | Add `bonusStats` to interfaces, include in stat comparisons |

New migration file for Prisma.

## Step 1: Schema + Migration

Add to `Item` model in `schema.prisma:131`:
```prisma
bonusStats  Json?  @map("bonus_stats")
```

Migration SQL:
```sql
ALTER TABLE items ADD COLUMN bonus_stats JSONB;
```

## Step 2: Shared Types + Constants

**`item.types.ts`** - Add `bonusStats: ItemStats | null` to the `Item` interface.

**`gameConstants.ts`** - Extend CRAFTING_CONSTANTS:
```typescript
// Crafting Crit
BASE_CRIT_CHANCE: 0.05,           // 5% at exact recipe level
CRIT_CHANCE_PER_LEVEL: 0.01,      // +1% per level above recipe
LUCK_CRIT_BONUS_PER_POINT: 0.002, // +0.2% per luck point
MIN_CRIT_CHANCE: 0.01,            // 1% floor
MAX_CRIT_CHANCE: 0.50,            // 50% ceiling
MIN_BONUS_MAGNITUDE: 1,
MAX_BONUS_MAGNITUDE: 5,
```

## Step 3: Game Engine - craftingCrit.ts (NEW)

Pure functions following the flee mechanics pattern (`fleeMechanics.ts`):

1. **`calculateCritChance(skillLevel, requiredLevel, luckStat)`** - clamped float
2. **`getEligibleBonusStats(itemType)`** - string[] of valid stat keys
   - weapon: `['attack', 'magicPower', 'rangedPower', 'evasion', 'luck']`
   - armor: `['armor', 'health', 'evasion', 'luck']`
   - resource/consumable: `[]` (never crit)
3. **`rollBonusStat(eligibleStats)`** - `{ stat, value }` or null
4. **`calculateCraftingCrit(input, roll?)`** - `CraftingCritResult`
   - Accepts optional `roll` param for deterministic testing

Export from `packages/game-engine/src/index.ts`.

## Step 4: Equipment Service

**`equipmentService.ts`**:
- Add `luck: number` to `EquipmentStats` interface
- In `getEquipmentStats`: sum both `baseStats` AND `bonusStats` from each equipped item (bonusStats comes from `slot.item?.bonusStats`)
- Return luck in the result

## Step 5: Crafting Route Integration

In the non-stackable item creation loop (`crafting.ts:198-212`):

1. Fetch equipment stats for luck: `const equipStats = await getEquipmentStats(playerId)`
2. For each item in the loop, call `calculateCraftingCrit({ skillLevel, requiredLevel, luckStat: equipStats.luck, itemType, slot })`
3. If crit: build `bonusStats = { [critResult.bonusStat]: critResult.bonusValue }`
4. Pass `bonusStats` to `prisma.item.create()`
5. Track crit details in a `craftedItemDetails` array
6. Return `craftedItemDetails` in both the activity log and API response

Stackable items (resources/consumables) skip crit logic entirely.

## Step 6: Frontend Data Flow

**`api.ts`**:
- `getInventory`: Add `bonusStats: Record<string, number> | null` to item type
- `craft`: Add `craftedItemDetails: Array<{ id, isCrit, bonusStat?, bonusValue? }>` to crafted response

**`useGameController.ts`**:
- Add `bonusStats?: Record<string, number> | null` to inventory state type
- In `handleCraft`: check `craftedItemDetails` for crits, add log line: `"Critical craft! +{value} {StatName}"`

**`page.tsx`**:
- Inventory mapping (line 277): pass `bonusStats: item.bonusStats ?? null`
- Equipment mapping (line 306): pass `bonusStats` for both equipped items and inventory candidates

## Step 7: Frontend Display

**`Inventory.tsx`**:
- Add `bonusStats?: Record<string, unknown> | null` to Item interface
- After the base stats grid (line 199), render bonus stats section in green/gold with same icon patterns
- Only show if `bonusStats` has non-zero entries

**`Equipment.tsx`**:
- Add `bonusStats` to EquippedItem and inventory item interfaces
- Stat comparison (line 304-318): include bonusStats in both `current*` and `next*` stat calculations so the diff arrows are accurate
- Show bonus stats on currently equipped item display

## Build Order

1. Schema migration: `npm run db:generate && npm run db:migrate`
2. Shared types + constants: `npm run build --workspace=packages/shared`
3. Game engine module: `npm run build --workspace=packages/game-engine`
4. API changes (equipment service + crafting route)
5. Frontend changes (api types, controller, page, components)

## Verification

1. `npm run typecheck` - no new TS errors
2. Unit tests for `craftingCrit.ts` - crit chance math, eligible stats, edge cases
3. Manual test: craft a weapon at level 1 - rarely crits (~5%)
4. Manual test: craft at 20+ levels above recipe - crits often (~25%+)
5. Equip luck gear - verify higher crit rate
6. Craft a resource/consumable - verify never crits
7. Equip a crit item - verify bonus stats apply in combat
8. Check inventory modal - bonus stats display correctly in green
9. Check equipment comparison - stat diffs include bonusStats
