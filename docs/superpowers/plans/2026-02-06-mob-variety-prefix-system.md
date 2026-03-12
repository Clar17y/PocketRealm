# Mob Variety: Prefix System, New Mobs, Loot & Recipes

## Summary
Add a prefix/modifier system for mobs (e.g., "Weak Forest Rat", "Gigantic Wild Boar"), 5 new base mobs, mob-specific loot drops, and new crafting recipes using those drops. Update the bestiary to show prefix variants.

---

## Step 1: Database Schema Changes

**File:** `packages/database/prisma/schema.prisma`

### Add `mobPrefix` to PendingEncounter (line ~298)
```prisma
mobPrefix    String?  @map("mob_prefix") @db.VarChar(32)
```

### Add PlayerBestiaryPrefix model (new)
```prisma
model PlayerBestiaryPrefix {
  playerId      String   @map("player_id")
  mobTemplateId String   @map("mob_template_id")
  prefix        String   @db.VarChar(32)
  kills         Int      @default(0)
  firstSeenAt   DateTime @default(now()) @map("first_seen_at")

  player      Player      @relation(fields: [playerId], references: [id], onDelete: Cascade)
  mobTemplate MobTemplate @relation(fields: [mobTemplateId], references: [id], onDelete: Cascade)

  @@id([playerId, mobTemplateId, prefix])
  @@map("player_bestiary_prefixes")
}
```

Add relation arrays to `Player` and `MobTemplate` models.

Create migration, run `db:generate` and `db:migrate`.

---

## Step 2: Shared Types & Constants

### New file: `packages/shared/src/types/mobPrefix.types.ts`
```typescript
export interface SpellTemplate {
  startRound: number;
  interval: number;
  damageFormula: 'avg' | 'min' | 'max';
  damageMultiplier: number;
  actionName: string;
}

export interface MobPrefixDefinition {
  key: string;
  displayName: string;
  description: string;
  weight: number;
  statMultipliers: {
    hp?: number;
    attack?: number;
    defence?: number;
    evasion?: number;
    damageMin?: number;
    damageMax?: number;
  };
  xpMultiplier: number;
  dropChanceMultiplier: number;
  spellTemplate: SpellTemplate | null;
}
```

### New file: `packages/shared/src/constants/mobPrefixes.ts`

10 prefixes across 3 tiers. `NO_PREFIX_WEIGHT: 100`, total prefix weight ~56 = ~36% prefixed encounters.

| Key | Name | HP | Atk | Def | Eva | Dmg | XP | Drop | Special | Weight |
|-----|------|-----|-----|-----|-----|-----|-----|------|---------|--------|
| `weak` | Weak | 0.6x | 0.8x | 0.7x | 1x | 0.7x | 0.6x | 0.8x | - | 15 |
| `frail` | Frail | 0.8x | 1x | 0.5x | 0.5x | 1x | 0.9x | 1x | - | 8 |
| `tough` | Tough | 1.5x | 1x | 1.3x | 1x | 1.1x | 1.3x | 1.2x | - | 8 |
| `gigantic` | Gigantic | 2x | 1x | 1.2x | 0.5x | 1.3x | 1.6x | 1.3x | - | 4 |
| `swift` | Swift | 0.8x | 1x | 0.8x | 2x | 0.95x | 1.2x | 1x | - | 6 |
| `ferocious` | Ferocious | 1.2x | 1.4x | 0.9x | 1x | 1.4x | 1.4x | 1.2x | - | 5 |
| `shaman` | Shaman | 1x | 0.8x | 0.8x | 1x | 0.8x | 1.5x | 1.3x | Spell R3 every 3 | 3 |
| `venomous` | Venomous | 1.1x | 1x | 1x | 1x | 1x | 1.3x | 1.2x | Poison R2 every 4 | 4 |
| `ancient` | Ancient | 1.5x | 1.3x | 1.3x | 1.3x | 1.3x | 2x | 2x | - | 1 |
| `spectral` | Spectral | 0.7x | 1x | 0.5x | 3x | 0.6x | 1.7x | 1.5x | Spell R2 every 2 | 2 |

Export helpers: `getMobPrefixDefinition(key)`, `getAllMobPrefixes()`.

Update `packages/shared/src/index.ts` with new exports.
Build shared: `npm run build --workspace=packages/shared`

---

## Step 3: Game Engine - Prefix Logic

### New file: `packages/game-engine/src/combat/mobPrefixes.ts`

Three pure functions:

1. **`rollMobPrefix(): string | null`** - Weighted random between no-prefix (weight 100) and all prefix definitions
2. **`applyMobPrefix(mob, prefix): modified mob`** - Applies stat multipliers (floor, min 1 for hp/damage), prepends display name, generates spells from template if present, merges with base spellPattern
3. **`generatePrefixSpells(template, damageMin, damageMax): SpellAction[]`** - Converts a SpellTemplate into concrete spell actions for rounds up to 100

Export from `packages/game-engine/src/index.ts`.
Build: `npm run build --workspace=packages/game-engine`

---

## Step 4: Seed Data - New Mobs, Items, Drop Tables, Recipes

**File:** `packages/database/prisma/seed.ts`

### 5 New Base Mobs

**Forest Edge:**
| Mob | HP | Atk | Def | Eva | Dmg | XP | Weight |
|-----|-----|-----|-----|-----|-----|-----|--------|
| Forest Spider | 12 | 10 | 2 | 4 | 1-3 | 8 | 90 |
| Woodland Bandit | 20 | 11 | 5 | 3 | 2-5 | 15 | 60 |

**Deep Forest:**
| Mob | HP | Atk | Def | Eva | Dmg | XP | Weight |
|-----|-----|-----|-----|-----|-----|-----|--------|
| Forest Bear | 50 | 15 | 15 | 2 | 5-10 | 50 | 70 |
| Dark Treant | 60 | 12 | 20 | 0 | 3-7 | 45 | 50 |
| Forest Sprite | 20 | 14 | 6 | 10 | 3-6 | 35 | 40 |

Forest Sprite gets a base spellPattern: Nature's Wrath (R3, 8 dmg) and Thorn Barrage (R6, 12 dmg).

### 9 New Resource Items (all stackable)
| Item | Tier | Dropped By |
|------|------|-----------|
| Rat Tail | 1 | Forest Rat |
| Boar Tusk | 1 | Wild Boar |
| Spider Silk | 1 | Forest Spider |
| Bandit's Pouch | 1 | Woodland Bandit |
| Wolf Pelt | 2 | Forest Wolf, Forest Bear |
| Wolf Fang | 2 | Forest Wolf |
| Bear Claw | 2 | Forest Bear |
| Ancient Bark | 2 | Dark Treant |
| Sprite Dust | 2 | Forest Sprite |

### Updated Drop Tables
Every mob gets 2-3 drops: one common mob-specific material (50-60%), one shared resource (15-30%), one rare equipment/potion (5-12%).

| Mob | Drop | Chance | Qty |
|-----|------|--------|-----|
| **Forest Rat** | Rat Tail | 0.60 | 1-2 |
| **Forest Rat** | Copper Ore | 0.50 | 1-3 |
| **Wild Boar** | Boar Tusk | 0.55 | 1-2 |
| **Wild Boar** | Copper Ore | 0.30 | 1-2 |
| **Wild Boar** | Wooden Sword | 0.10 | 1 |
| **Forest Spider** | Spider Silk | 0.60 | 1-3 |
| **Forest Spider** | Minor Health Potion | 0.08 | 1 |
| **Woodland Bandit** | Bandit's Pouch | 0.50 | 1 |
| **Woodland Bandit** | Copper Ore | 0.25 | 2-4 |
| **Woodland Bandit** | Wooden Sword | 0.06 | 1 |
| **Forest Wolf** | Wolf Pelt | 0.55 | 1-2 |
| **Forest Wolf** | Wolf Fang | 0.35 | 1-2 |
| **Forest Wolf** | Leather Cap | 0.12 | 1 |
| **Forest Bear** | Bear Claw | 0.50 | 1-3 |
| **Forest Bear** | Wolf Pelt | 0.20 | 1-2 |
| **Forest Bear** | Health Potion | 0.06 | 1 |
| **Dark Treant** | Ancient Bark | 0.60 | 2-4 |
| **Dark Treant** | Oak Log | 0.30 | 2-5 |
| **Dark Treant** | Maple Log | 0.15 | 1-3 |
| **Forest Sprite** | Sprite Dust | 0.55 | 1-3 |
| **Forest Sprite** | Moonpetal | 0.25 | 1-2 |
| **Forest Sprite** | Minor Health Potion | 0.10 | 1 |

### New Crafting Recipes (using mob drops)

| Recipe | Skill | Level | Materials | Result |
|--------|-------|-------|-----------|--------|
| Copper Dagger | weaponsmithing | 3 | 8x Copper Ore, 3x Rat Tail | Copper Dagger (+8 atk, melee) |
| Boar Tusk Mace | weaponsmithing | 5 | 5x Boar Tusk, 5x Oak Log | Boar Tusk Mace (+10 atk, melee) |
| Spider Silk Robe | weaponsmithing | 5 | 10x Spider Silk, 3x Forest Sage | Spider Silk Robe (+4 armor, +3 evasion, chest) |
| Wolf Fang Dagger | weaponsmithing | 8 | 6x Wolf Fang, 4x Iron Ore | Wolf Fang Dagger (+12 atk, melee) |
| Antivenom Potion | alchemy | 5 | 4x Spider Silk, 3x Forest Sage | Antivenom Potion (consumable, tier 1) |
| Bear Hide Vest | weaponsmithing | 10 | 8x Wolf Pelt, 4x Bear Claw | Bear Hide Vest (+8 armor, chest) |
| Ancient Staff | weaponsmithing | 10 | 6x Ancient Bark, 4x Sprite Dust | Ancient Staff (+12 magic, main_hand) |

New item templates needed for recipe outputs (Copper Dagger, Boar Tusk Mace, Spider Silk Robe, Wolf Fang Dagger, Antivenom Potion, Bear Hide Vest, Ancient Staff).

---

## Step 5: API Changes

### `apps/api/src/services/lootService.ts`
- Add `dropChanceMultiplier` param (default 1.0)
- Apply: `Math.min(1, entry.dropChance.toNumber() * dropChanceMultiplier)`

### `apps/api/src/routes/exploration.ts` (~line 134-141)
- Import `rollMobPrefix` from game-engine, `getMobPrefixDefinition` from shared
- After `pickWeighted(mobTemplates)`, call `rollMobPrefix()`
- Add `mobPrefix` to `mobEncounters` array entries
- Pass `mobPrefix` into `PendingEncounter.create` data (~line 191)
- Include `mobPrefix` + prefix display name in exploration response (~line 214)

### `apps/api/src/routes/combat.ts`
- When loading pending encounter (~line 243-245), also select `mobPrefix`
- After loading mob template, apply prefix: `applyMobPrefix(mob, mobPrefix)`
- Use prefixed mob in `runCombat()` (~line 313)
- Pass `dropChanceMultiplier` to `rollAndGrantLoot()` (~line 336)
- For direct combat (no pendingEncounterId), roll prefix at combat time
- After bestiary base upsert (~line 356), upsert `PlayerBestiaryPrefix` if prefix present
- Include `mobPrefix` and `mobDisplayName` in activity log and response

### `apps/api/src/routes/bestiary.ts`
- Also query `PlayerBestiaryPrefix` for the player
- Include `prefixEncounters: [{ prefix, displayName, kills }]` per mob in response

---

## Step 6: Frontend Changes

### `apps/web/src/lib/api.ts`
- Add `mobPrefix: string | null` to exploration response mob encounter type
- Add `mobPrefix: string | null` and `mobDisplayName: string` to combat response type

### `apps/web/src/app/game/useGameController.ts`
- Add `mobPrefix` to PendingEncounter interface

### `apps/web/src/app/game/screens/CombatScreen.tsx`
- Display prefix in a distinct color (e.g., `--rpg-gold` for rare prefixes) before mob name
- Pending encounter list shows prefixed mob names

### `apps/web/src/components/screens/Bestiary.tsx`
- Add "Variant" section in mob detail modal
- Show encountered prefixes with kill counts
- Progressive unlock: prefix name visible after 1+ kills, stat effects after 3+ kills of that prefix

---

## Step 7: Verification

1. `npm run typecheck` - must pass
2. `npm run db:migrate && npm run db:seed` - seed completes
3. Explore -> verify some encounters show prefixed mob names
4. Fight prefixed mobs -> verify stat modifiers apply (Weak deals less damage, Gigantic has more HP)
5. Verify Shaman/Venomous/Spectral spells fire on correct rounds
6. Verify XP and loot multipliers work (Ancient gives 2x XP and loot chance)
7. Bestiary -> verify prefix variants section appears with kill tracking
8. Craft new recipes -> verify mob drop materials are consumed correctly
9. `npm run test:engine` - existing tests still pass

---

## Files Modified (existing)
- `packages/database/prisma/schema.prisma` - add PendingEncounter.mobPrefix, PlayerBestiaryPrefix model
- `packages/database/prisma/seed.ts` - new mobs, items, drop tables, recipes
- `packages/shared/src/index.ts` - export new types/constants
- `packages/game-engine/src/index.ts` - export new functions
- `apps/api/src/routes/exploration.ts` - roll prefix on encounter creation
- `apps/api/src/routes/combat.ts` - apply prefix, track bestiary, response
- `apps/api/src/routes/bestiary.ts` - return prefix encounter data
- `apps/api/src/services/lootService.ts` - add dropChanceMultiplier param
- `apps/web/src/lib/api.ts` - update response types
- `apps/web/src/app/game/useGameController.ts` - add mobPrefix to types
- `apps/web/src/app/game/screens/CombatScreen.tsx` - prefix display
- `apps/web/src/components/screens/Bestiary.tsx` - prefix variants section

## Files Created (new)
- `packages/shared/src/types/mobPrefix.types.ts`
- `packages/shared/src/constants/mobPrefixes.ts`
- `packages/game-engine/src/combat/mobPrefixes.ts`
- `packages/database/prisma/migrations/<timestamp>_add_mob_prefix_system/migration.sql`
