# Flavour Text System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 77 lore files into the game, surfacing flavour text across items, mobs, zones, NPCs, and achievements.

**Architecture:** DB fields for items/mobs/zones (embedded in existing API responses, no new endpoints). TS constants for NPC dialogue and achievement flavour. Bestiary progressive reveal gated by kill count thresholds. NPC dialogue as inline speech bubbles in existing panels.

**Tech Stack:** Prisma 6 migrations, TypeScript constants, React components, Vitest.

**Spec:** `docs/superpowers/specs/2026-03-16-flavour-text-system-design.md`

---

## Chunk 1: Items + Drops Flavour Text

### Task 1: Add `flavorText` field to ItemTemplate schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma:186-208` (ItemTemplate model)

- [ ] **Step 1: Add flavorText field to ItemTemplate model**

In `schema.prisma`, add after the `sellPrice` field (line 200):

```prisma
flavorText    String? @map("flavor_text") @db.Text
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/database && npx prisma migrate dev --name add-item-flavor-text`
Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add flavorText field to ItemTemplate"
```

### Task 2: Create item flavour text lookup and seed data

**Files:**
- Create: `packages/database/prisma/seed-data/flavorText.ts`
- Modify: `packages/database/prisma/seed.ts:130-135` (merge flavour text into items before `createMany`)

**Lore source files:**
- `docs/loop-v2/lore/*-t1-weapons.md` through `*-t5-weapons.md`
- `docs/loop-v2/lore/*-potions.md`, `*-stamina-mana-potions.md`
- `docs/loop-v2/lore/*-t1-t2-gems.md`
- `docs/loop-v2/lore/*-t1-mob-drops.md` through `*-t5-mob-drops.md`
- `docs/loop-v2/lore/*-boss-trophies-gear.md`
- `docs/loop-v2/lore/*-backpacks.md`
- `docs/loop-v2/lore/*-jewellery.md`
- `docs/loop-v2/lore/*-soulbound-gear.md`
- `docs/loop-v2/lore/*-quest-shop-scrolls.md`
- `docs/loop-v2/lore/*-achievement-family-items.md`
- `docs/loop-v2/lore/*-t1-resources.md`

- [ ] **Step 1: Create flavorText.ts with item flavour text map**

Create `packages/database/prisma/seed-data/flavorText.ts`. This file exports a `Record<string, string>` mapping item template names to their flavour text, extracted from the lore markdown files. The key is the exact item name as it appears in the seed data (e.g. `'Wooden Sword'`, `'Oak Shortbow'`).

```typescript
/**
 * Item flavour text extracted from docs/loop-v2/lore/ files.
 * Keyed by item template name (must match seed data exactly).
 */
export const ITEM_FLAVOR_TEXT: Record<string, string> = {
  // T1 Weapons (from t1-weapons.md)
  'Wooden Sword': 'Carved from a single plank by someone who clearly valued enthusiasm over craftsmanship. The edge is about as sharp as a strong opinion, but it will do until something tries to eat you.',
  'Oak Shortbow': 'A simple hunting bow, still smelling of sawdust and fresh lacquer. Millbrook\'s bowyer swears each one is "personally tested," though nobody has ever seen him hit a target.',
  'Oak Staff': 'A length of oak heartwood, stripped and sanded smooth. Faint lines of natural grain pulse when held by someone with even a scrap of magical talent. For everyone else, it makes a passable walking stick.',
  'Copper Dagger': 'Light, quick, and almost pretty in the right light. Favoured by those who prefer not to be where the blade was a moment ago. The copper holds an edge poorly, but the things you will be stabbing at this point barely notice.',
  // ... continue for ALL items from ALL lore files
  // T2 Weapons, T3 Weapons, T4 Weapons, T5 Weapons
  // Potions, Stamina/Mana Potions
  // Gems (T1-T2)
  // Mob Drops T1-T5
  // Boss Trophies + Gear
  // Backpacks
  // Jewellery
  // Soulbound Gear
  // Quest Shop Scrolls
  // Achievement Family Items
  // T1 Resources
};
```

Extract every item description from each lore file's `## Content` section. Each item's bold name maps to its description paragraph. Expect approximately 150-200 entries across all item lore files.

- [ ] **Step 2: Merge flavour text into seed data before `createMany`**

The seed uses `createMany` (not upsert) — see `packages/database/prisma/seed.ts:130-135`. The `seedItemTemplates()` function calls `getAllItemTemplates()` to get an array, then passes it directly to `prisma.itemTemplate.createMany({ data: items })`.

Modify `seedItemTemplates()` to merge flavour text into the items array before the `createMany` call:

```typescript
import { ITEM_FLAVOR_TEXT } from './seed-data/flavorText';

async function seedItemTemplates() {
  console.log('  Seeding item templates...');
  const items = getAllItemTemplates().map(item => ({
    ...item,
    flavorText: ITEM_FLAVOR_TEXT[item.name] ?? null,
  }));
  await prisma.itemTemplate.createMany({ data: items });
  console.log(`  ${items.length} item templates created.`);

  // Log unmatched flavour text entries
  const itemNames = new Set(items.map(i => i.name));
  for (const name of Object.keys(ITEM_FLAVOR_TEXT)) {
    if (!itemNames.has(name)) console.warn(`  ⚠ Unmatched item flavour text: "${name}"`);
  }
}
```

This approach does NOT modify `items.ts` or the `it()` helper — flavour text is applied at the seed level only.

- [ ] **Step 4: Run seed to verify**

Run: `npm run db:seed`
Expected: Seed completes. Check for any "unmatched flavour text" warnings. Verify a few items have text:

```bash
npx prisma studio
```

Open ItemTemplate table, filter by `flavorText IS NOT NULL`, confirm entries exist.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/seed-data/flavorText.ts packages/database/prisma/seed.ts
git commit -m "feat(seed): add item flavour text from lore files"
```

### Task 3: Display item flavour text in Inventory UI

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:556` (map flavorText instead of itemType)
- Modify: `apps/web/src/components/screens/Inventory.tsx:764` (style the description)

- [ ] **Step 1: Update game page item mapping**

In `apps/web/src/app/game/page.tsx:556`, change:

```typescript
// Before:
description: item.template.itemType,

// After:
description: item.template.flavorText || item.template.itemType,
```

This falls back to itemType if no flavour text is set.

- [ ] **Step 2: Style the description as italic in Inventory modal**

In `apps/web/src/components/screens/Inventory.tsx:764`, update the description paragraph to use italic styling when it's flavour text (not just an item type):

```tsx
// Before:
<p className="text-sm text-[var(--rpg-text-secondary)] mb-4">{selectedItem.description}</p>

// After:
<p className={`text-sm text-[var(--rpg-text-secondary)] mb-4 ${
  selectedItem.description !== selectedItem.type ? 'italic' : ''
}`}>{selectedItem.description}</p>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds with no type errors. The `flavorText` field flows through from Prisma `include: { template: true }` automatically — no API route changes needed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/game/page.tsx apps/web/src/components/screens/Inventory.tsx
git commit -m "feat(ui): display item flavour text in inventory modal"
```

---

## Chunk 2: Mobs + Bestiary Flavour Text

### Task 4: Add flavour fields to MobTemplate and MobFamily schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma:309-342` (MobTemplate model)
- Modify: `packages/database/prisma/schema.prisma:486-500` (MobFamily model)

- [ ] **Step 1: Add three flavour fields to MobTemplate**

In `schema.prisma`, add after `bossBaseHp` (line 329):

```prisma
flavorAppearance String? @map("flavor_appearance") @db.Text
flavorBehavior   String? @map("flavor_behavior") @db.Text
flavorLore       String? @map("flavor_lore") @db.Text
```

- [ ] **Step 2: Add flavorOverview to MobFamily**

In `schema.prisma`, add after `siteNounLarge` (line 491):

```prisma
flavorOverview String? @map("flavor_overview") @db.Text
```

- [ ] **Step 3: Generate migration**

Run: `cd packages/database && npx prisma migrate dev --name add-mob-flavor-text`
Expected: Migration created successfully.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add flavour text fields to MobTemplate and MobFamily"
```

### Task 5: Add bestiary flavour thresholds to game constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts:1453-1457` (BESTIARY_UNLOCK_CONSTANTS)

- [ ] **Step 1: Add flavour threshold constants**

In `gameConstants.ts`, add to `BESTIARY_UNLOCK_CONSTANTS` (after line 1456):

```typescript
export const BESTIARY_UNLOCK_CONSTANTS = {
  DISCOVERED_THRESHOLD: 1,
  STATS_THRESHOLD: 3,
  ROTATION_THRESHOLD: 5,
  FLAVOR_APPEARANCE_THRESHOLD: 1,
  FLAVOR_BEHAVIOR_THRESHOLD: 10,
  FLAVOR_LORE_THRESHOLD: 25,
} as const;
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat(constants): add bestiary flavour text unlock thresholds"
```

### Task 6: Seed mob and family flavour text

**Files:**
- Create: `packages/database/prisma/seed-data/mobFlavorText.ts`
- Modify: `packages/database/prisma/seed.ts:141-146` (merge mob flavour text before `createMany`)
- Modify: `packages/database/prisma/seed.ts:152-158` (merge family flavour text before `createMany`)

**Lore source files:**
- `docs/loop-v2/lore/*-vermin-bestiary.md` and all other `*-bestiary.md` files (16 files)

- [ ] **Step 1: Create mobFlavorText.ts**

Create `packages/database/prisma/seed-data/mobFlavorText.ts` with two exports:

```typescript
/** Mob flavour text keyed by mob template name. Each entry has appearance, behavior, and lore. */
export const MOB_FLAVOR_TEXT: Record<string, {
  appearance: string;
  behavior: string;
  lore: string;
}> = {
  // From vermin-bestiary.md
  'Forest Rat': {
    appearance: 'A brown rat the size of a housecat, with matted fur and eyes like wet pebbles.',
    behavior: 'Skittish but territorial. Forest rats travel in loose clusters along the woodland floor, bolting at loud noises only to circle back the moment you turn around. They are less afraid of you than they should be.',
    lore: 'Millbrook\'s farmers consider them a seasonal nuisance, like bad weather with whiskers. Every year someone proposes a formal bounty. Every year the rats outlast the budget.',
  },
  // ... continue for ALL mobs from ALL bestiary lore files
};

/** Mob family overview text keyed by family name. */
export const MOB_FAMILY_FLAVOR: Record<string, string> = {
  'Vermin': 'Vermin are the first lesson the Pocketrealm teaches, and the lesson is this: everything here wants to bite you, and most of it is smaller than your boot. The forests and caves near Millbrook crawl with rodents, insects, and other creatures that exist mainly to remind adventurers that even the lowest rung of the food chain has teeth.',
  // ... continue for ALL mob families
};
```

Extract from each bestiary lore file: the `### Family Overview` section goes into `MOB_FAMILY_FLAVOR`, and each mob's `*Appearance:*`, `*Behavior:*`, and `*Lore:*` sections go into `MOB_FLAVOR_TEXT`.

- [ ] **Step 2: Merge flavour text into seed data before `createMany`**

The seed uses `createMany` for both mobs (`seed.ts:141-146`) and families (`seed.ts:152-158`). Modify both functions to merge flavour text before the `createMany` call:

```typescript
import { MOB_FLAVOR_TEXT, MOB_FAMILY_FLAVOR } from './seed-data/mobFlavorText';

async function seedMobs() {
  console.log('  Seeding mob templates...');
  const mobs = getAllMobTemplates().map(mob => {
    const flavor = MOB_FLAVOR_TEXT[mob.name];
    return {
      ...mob,
      flavorAppearance: flavor?.appearance ?? null,
      flavorBehavior: flavor?.behavior ?? null,
      flavorLore: flavor?.lore ?? null,
    };
  });
  await prisma.mobTemplate.createMany({ data: mobs });
  console.log(`  ${mobs.length} mob templates created.`);

  // Log unmatched
  const mobNames = new Set(mobs.map(m => m.name));
  for (const name of Object.keys(MOB_FLAVOR_TEXT)) {
    if (!mobNames.has(name)) console.warn(`  ⚠ Unmatched mob flavour text: "${name}"`);
  }
}

async function seedMobFamilies() {
  console.log('  Seeding mob families...');
  const p = prisma as any;
  const families = getAllMobFamilies().map(f => ({
    ...f,
    flavorOverview: MOB_FAMILY_FLAVOR[f.name] ?? null,
  }));
  await p.mobFamily.createMany({ data: families });
  // ... rest of function unchanged (members, zoneFamilies)
}
```

Log warnings for unmatched names.

- [ ] **Step 3: Run seed and verify**

Run: `npm run db:seed`
Expected: Seed completes, mob templates have flavour text. Check via Prisma Studio.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/seed-data/mobFlavorText.ts packages/database/prisma/seed.ts
git commit -m "feat(seed): add mob and family flavour text from bestiary lore"
```

### Task 7: Create bestiary service with progressive reveal

**Files:**
- Create: `apps/api/src/services/bestiaryService.ts`
- Create: `apps/api/src/services/__tests__/bestiaryService.test.ts`
- Modify: `apps/api/src/routes/bestiary.ts:80-145` (delegate to service)

- [ ] **Step 1: Write the failing test for progressive reveal**

Create `apps/api/src/services/__tests__/bestiaryService.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getBestiaryFlavorText } from '../bestiaryService';

describe('getBestiaryFlavorText', () => {
  const mob = {
    flavorAppearance: 'A brown rat the size of a housecat.',
    flavorBehavior: 'Skittish but territorial.',
    flavorLore: 'Farmers consider them a seasonal nuisance.',
  };

  it('returns null for all fields when kills is 0', () => {
    const result = getBestiaryFlavorText(mob, 0);
    expect(result).toEqual({
      flavorAppearance: null,
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns only appearance at threshold (1 kill)', () => {
    const result = getBestiaryFlavorText(mob, 1);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns only appearance at 9 kills (just below behavior threshold)', () => {
    const result = getBestiaryFlavorText(mob, 9);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns appearance + behavior at exactly 10 kills (behavior threshold)', () => {
    const result = getBestiaryFlavorText(mob, 10);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: null,
    });
  });

  it('returns appearance + behavior at 24 kills (just below lore threshold)', () => {
    const result = getBestiaryFlavorText(mob, 24);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: null,
    });
  });

  it('returns all fields at exactly 25 kills (lore threshold)', () => {
    const result = getBestiaryFlavorText(mob, 25);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: 'Farmers consider them a seasonal nuisance.',
    });
  });

  it('returns all fields well above thresholds (100 kills)', () => {
    const result = getBestiaryFlavorText(mob, 100);
    expect(result).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: 'Farmers consider them a seasonal nuisance.',
    });
  });

  it('handles mob with no flavour text', () => {
    const emptyMob = { flavorAppearance: null, flavorBehavior: null, flavorLore: null };
    const result = getBestiaryFlavorText(emptyMob, 100);
    expect(result).toEqual({
      flavorAppearance: null,
      flavorBehavior: null,
      flavorLore: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/api/src/services/__tests__/bestiaryService.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the bestiaryService**

Create `apps/api/src/services/bestiaryService.ts`:

```typescript
import { BESTIARY_UNLOCK_CONSTANTS } from '@pocketrealm/shared';

const {
  FLAVOR_APPEARANCE_THRESHOLD,
  FLAVOR_BEHAVIOR_THRESHOLD,
  FLAVOR_LORE_THRESHOLD,
} = BESTIARY_UNLOCK_CONSTANTS;

interface MobFlavorFields {
  flavorAppearance: string | null;
  flavorBehavior: string | null;
  flavorLore: string | null;
}

export function getBestiaryFlavorText(
  mob: MobFlavorFields,
  kills: number,
): MobFlavorFields {
  return {
    flavorAppearance: kills >= FLAVOR_APPEARANCE_THRESHOLD ? mob.flavorAppearance : null,
    flavorBehavior: kills >= FLAVOR_BEHAVIOR_THRESHOLD ? mob.flavorBehavior : null,
    flavorLore: kills >= FLAVOR_LORE_THRESHOLD ? mob.flavorLore : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/api/src/services/__tests__/bestiaryService.test.ts`
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/bestiaryService.ts apps/api/src/services/__tests__/bestiaryService.test.ts
git commit -m "feat(api): add bestiaryService with progressive flavour text reveal"
```

### Task 8: Wire bestiary route to use service and return flavour fields

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts:96-118` (replace hardcoded description, add flavour fields)

- [ ] **Step 1: Update bestiary route to return progressive flavour text**

In `apps/api/src/routes/bestiary.ts`:

1. Add import at top: `import { getBestiaryFlavorText } from '../services/bestiaryService';`
2. Before the `return {` block at line 96, compute the flavour text:

```typescript
      const flavor = isHidden
        ? { flavorAppearance: null, flavorBehavior: null, flavorLore: null }
        : getBestiaryFlavorText(mob, kills);
```

3. Replace line 110:
```typescript
// Before:
description: isHidden ? null : `A creature found in ${mob.zone.name}.`,

// After:
description: isHidden ? null : (flavor.flavorAppearance || `A creature found in ${mob.zone.name}.`),
flavorAppearance: flavor.flavorAppearance,
flavorBehavior: flavor.flavorBehavior,
flavorLore: flavor.flavorLore,
```

This keeps `description` as a backwards-compatible field (appearance text or fallback), and adds the three granular fields.

- [ ] **Step 2: Build and verify**

Run: `npm run build:api`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/bestiary.ts
git commit -m "feat(api): wire bestiary route to progressive flavour text service"
```

### Task 9: Update Bestiary UI for progressive flavour text

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx:24-52` (update Monster interface)
- Modify: `apps/web/src/components/screens/Bestiary.tsx:653` (replace description display)

- [ ] **Step 1: Update Monster interface**

In `Bestiary.tsx`, add three optional fields to the `Monster` interface (after line 38):

```typescript
flavorAppearance?: string | null;
flavorBehavior?: string | null;
flavorLore?: string | null;
```

- [ ] **Step 2: Replace description display with progressive reveal sections**

In `Bestiary.tsx`, replace line 653:

```tsx
// Before:
<p className="text-sm text-[var(--rpg-text-secondary)] mb-4">{selectedMonster.description}</p>

// After:
<div className="mb-4 space-y-2">
  {selectedMonster.flavorAppearance ? (
    <div>
      <span className="text-xs font-semibold text-[var(--rpg-text-secondary)] uppercase tracking-wide">Appearance</span>
      <p className="text-sm italic text-[var(--rpg-text-secondary)]">{selectedMonster.flavorAppearance}</p>
    </div>
  ) : (
    <p className="text-sm text-[var(--rpg-text-secondary)]">{selectedMonster.description}</p>
  )}
  {selectedMonster.flavorBehavior ? (
    <div>
      <span className="text-xs font-semibold text-[var(--rpg-text-secondary)] uppercase tracking-wide">Behavior</span>
      <p className="text-sm italic text-[var(--rpg-text-secondary)]">{selectedMonster.flavorBehavior}</p>
    </div>
  ) : selectedMonster.flavorAppearance ? (
    <p className="text-xs text-[var(--rpg-text-secondary)] opacity-50">??? (keep hunting to learn more)</p>
  ) : null}
  {selectedMonster.flavorLore ? (
    <div>
      <span className="text-xs font-semibold text-[var(--rpg-text-secondary)] uppercase tracking-wide">Lore</span>
      <p className="text-sm italic text-[var(--rpg-text-secondary)]">{selectedMonster.flavorLore}</p>
    </div>
  ) : selectedMonster.flavorBehavior ? (
    <p className="text-xs text-[var(--rpg-text-secondary)] opacity-50">??? (keep hunting to learn more)</p>
  ) : null}
</div>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/screens/Bestiary.tsx
git commit -m "feat(ui): progressive flavour text reveal in bestiary monster detail"
```

---

## Chunk 3: Zone Flavour Text

### Task 10: Add zone flavour fields to schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma:235-262` (Zone model)

- [ ] **Step 1: Add three fields to Zone model**

In `schema.prisma`, add after `description` (line 238):

```prisma
arrivalText        String? @map("arrival_text") @db.Text
ambientTexts       Json?   @map("ambient_texts")
environmentalTexts Json?   @map("environmental_texts")
```

- [ ] **Step 2: Generate migration**

Run: `cd packages/database && npx prisma migrate dev --name add-zone-flavor-text`
Expected: Migration created.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add zone flavour text fields (arrivalText, ambientTexts, environmentalTexts)"
```

### Task 11: Seed zone flavour text

**Files:**
- Create: `packages/database/prisma/seed-data/zoneFlavorText.ts`
- Modify: `packages/database/prisma/seed.ts` (apply zone flavour text)

**Lore source files:**
- `docs/loop-v2/lore/*-millbrook-zone.md` and all other `*-zone.md` files (11 files)

- [ ] **Step 1: Create zoneFlavorText.ts**

```typescript
interface ZoneFlavorData {
  arrivalText: string;
  ambientTexts: { morning: string; afternoon: string; evening: string; night: string };
  environmentalTexts: Record<string, string>;
}

/** Zone flavour text keyed by zone name. */
export const ZONE_FLAVOR_TEXT: Record<string, ZoneFlavorData> = {
  'Millbrook': {
    arrivalText: 'The road narrows, the trees thin, and there it is: Millbrook. A cluster of timber-framed buildings at the point where farmland meets forest, smelling of woodsmoke and fresh bread and just a little bit of manure. It is not much. But it is yours, for now.',
    ambientTexts: {
      morning: 'Sunlight slants across the cobblestones as shutters bang open along the main street...',
      afternoon: 'The market square hums with low commerce...',
      evening: 'Lanterns flicker to life along the main road...',
      night: 'Millbrook goes quiet, but never quite silent...',
    },
    environmentalTexts: {
      'The Main Street': 'A dirt road paved with ambition and about twelve yards of actual cobblestone...',
      'The Town Square': 'A modest clearing with a well at its center...',
      'The Crafting Quarter': 'Three workshops crowd together behind the tavern...',
      'The Gate': 'A wooden palisade with a single gate facing the Forest Edge...',
      'The Crooked Antler': 'The oldest building in Millbrook...',
    },
  },
  // ... continue for ALL zones from ALL zone lore files
};
```

- [ ] **Step 2: Merge flavour text into zone seed data before `createMany`**

Zones are defined inline in `seed.ts:76-88` as a `Prisma.ZoneCreateManyInput[]` array, then created via `prisma.zone.createMany({ data: zones })` at line 90. Unlike items/mobs, there is no `getAllZones()` helper — the data is right there in the function.

Modify `seedZones()` to merge flavour text into each zone entry:

```typescript
import { ZONE_FLAVOR_TEXT } from './seed-data/zoneFlavorText';

async function seedZones() {
  console.log('  Seeding zones...');
  const explorationTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  const zones: Prisma.ZoneCreateManyInput[] = [
    { id: IDS.zones.millbrook, name: 'Millbrook', /* ... existing fields ... */ },
    // ... all existing zone entries unchanged ...
  ].map(z => {
    const flavor = ZONE_FLAVOR_TEXT[z.name];
    return {
      ...z,
      arrivalText: flavor?.arrivalText ?? null,
      ambientTexts: flavor?.ambientTexts ?? Prisma.JsonNull,
      environmentalTexts: flavor?.environmentalTexts ?? Prisma.JsonNull,
    };
  });

  await prisma.zone.createMany({ data: zones });
  console.log(`  ${zones.length} zones created.`);

  // Log unmatched
  const zoneNames = new Set(zones.map(z => z.name));
  for (const name of Object.keys(ZONE_FLAVOR_TEXT)) {
    if (!zoneNames.has(name)) console.warn(`  ⚠ Unmatched zone flavour text: "${name}"`);
  }
}
```

- [ ] **Step 3: Run seed and verify**

Run: `npm run db:seed`
Expected: Seed completes, zones have flavour text.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma/seed-data/zoneFlavorText.ts packages/database/prisma/seed.ts
git commit -m "feat(seed): add zone flavour text from lore files"
```

### Task 12: Update zone API response mapping

**Files:**
- Modify: `apps/api/src/routes/zones.ts:119-149` (add new fields to response mapping)

- [ ] **Step 1: Add flavour fields to zone response**

The Prisma query at `zones.ts:60` uses `prisma.zone.findMany({})` with no explicit `select`, so new DB columns are automatically fetched — no query changes needed. However, the response mapping at lines 120-139 explicitly picks which fields to return. Add the new fields inside `zones.map()` after the `description` field (line 125):

```typescript
arrivalText: discovered ? z.arrivalText : null,
ambientTexts: discovered ? z.ambientTexts : null,
environmentalTexts: discovered ? z.environmentalTexts : null,
```

- [ ] **Step 2: Build and verify**

Run: `npm run build:api`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/zones.ts
git commit -m "feat(api): include zone flavour text fields in zone response"
```

### Task 13: Display zone flavour text in frontend

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx:329-333` (add arrival text and ambient text)

- [ ] **Step 1: Add arrival text display**

In `ZoneMap.tsx`, update the zone description section (lines 329-333). Replace the simple description display with:

```tsx
{selectedZone.arrivalText && (
  <p className="text-sm italic leading-snug text-[var(--rpg-text-secondary)] mb-2 border-l-2 border-[var(--rpg-gold)] pl-3">
    {selectedZone.arrivalText}
  </p>
)}
{selectedZone.description && (
  <p className="text-sm leading-snug text-[var(--rpg-text-secondary)] mb-2">
    {selectedZone.description}
  </p>
)}
{ambientText && (
  <p className="text-xs italic leading-snug text-[var(--rpg-text-secondary)] opacity-70 mb-2">
    {ambientText}
  </p>
)}
```

Add a `useMemo` above the JSX to stabilise the random selection (so it doesn't flicker on re-render):

```typescript
const ambientText = useMemo(() => {
  if (!selectedZone?.ambientTexts) return null;
  const texts = selectedZone.ambientTexts as Record<string, string>;
  const keys = Object.keys(texts);
  return keys.length > 0 ? texts[keys[Math.floor(Math.random() * keys.length)]] : null;
}, [selectedZone?.id]);
```

Make sure `useMemo` is imported from React at the top of the file.

**Note:** `environmentalTexts` is seeded and returned from the API but not displayed in any UI in this phase. It is intentionally deferred — the data is available for future sub-location tooltips or a "look around" feature.

- [ ] **Step 2: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx
git commit -m "feat(ui): display zone arrival and ambient text in zone map panel"
```

---

## Chunk 4: NPC Dialogue

### Task 14: Create NPC dialogue constants

**Files:**
- Create: `packages/shared/src/constants/npcDialogue.ts`

**Lore source files:**
- `docs/loop-v2/lore/*-general-store-shopkeeper.md`
- `docs/loop-v2/lore/*-blacksmith-npc.md`
- `docs/loop-v2/lore/*-tavern-keeper-npc.md`
- `docs/loop-v2/lore/*-herbalist-npc.md`
- `docs/loop-v2/lore/*-quest-board-npc.md`
- `docs/loop-v2/lore/*-gathering-guide-npc.md`
- `docs/loop-v2/lore/*-casino-dealer-npc.md`
- `docs/loop-v2/lore/*-guild-recruiter-npc.md`
- `docs/loop-v2/lore/*-thornwall-merchant-npc.md`
- `docs/loop-v2/lore/*-wandering-merchant-npc.md`
- `docs/loop-v2/lore/*-mysterious-stranger-npc.md`
- `docs/loop-v2/lore/*-town-guard-npc.md`

- [ ] **Step 1: Create npcDialogue.ts**

```typescript
export type DialogueEvent = 'greeting' | 'idle' | 'buy' | 'sell' | 'farewell';

export interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>; // Partial — not all NPCs have all event types (e.g. guards don't have buy/sell). Spec says Record but Partial is more accurate.
}

export const NPC_DIALOGUE: Record<string, NpcDialogue> = {
  'millbrook-general-store': {
    name: 'Bram Holloway',
    location: 'Left side of Main Street, Millbrook',
    personality: 'Practical, unhurried, faintly amused by everything.',
    lines: {
      greeting: [
        "Welcome, welcome. Everything's priced fair and stacked where you can see it. I don't haggle, I don't barter, and I don't accept 'interesting stories' as currency. We tried that once. The economy did not recover.",
        "Ah, another fresh face. Or a familiar one, hard to tell with all the mud. Come in, have a look. Try not to bleed on the merchandise.",
        "Morning. Or evening. Honestly, I stopped keeping track. What do you need?",
      ],
      idle: [
        "Take your time. I'm not going anywhere. Tried once, got as far as the gate, turned right back around. Terrible commute.",
        "If you're looking for something specific, just ask. If you're looking for something that doesn't exist, also ask. I'll tell you no, but at least we'll both know.",
      ],
      buy: [
        "Solid choice. Or at least a choice. You'll find out which one soon enough.",
        "Pleasure doing business. Come back alive and we'll do it again.",
      ],
      sell: [
        "Let me see... yes, I can take that off your hands. Won't ask where you got it. Learned that lesson years ago.",
        "Rat pelts again? I swear, half this town's economy runs on dead vermin. Fine, I'll add it to the pile.",
      ],
      farewell: [
        "Safe travels. And if the Forest Edge gives you trouble, remember: the store opens at dawn. Assuming I'm awake.",
        "Off you go, then. Try not to die out there. It's terrible for repeat business.",
      ],
    },
  },
  // ... continue for ALL NPCs from ALL NPC lore files:
  // 'millbrook-blacksmith', 'millbrook-tavern', 'millbrook-herbalist',
  // 'millbrook-quest-board', 'millbrook-gathering-guide', 'millbrook-casino',
  // 'millbrook-guild-recruiter', 'thornwall-merchant', 'wandering-merchant',
  // 'mysterious-stranger', 'town-guard'
};

/** Pick a random line for the given NPC and event. Returns null if no lines exist. */
export function getNpcLine(npcKey: string, event: DialogueEvent): string | null {
  const npc = NPC_DIALOGUE[npcKey];
  if (!npc) return null;
  const lines = npc.lines[event];
  if (!lines || lines.length === 0) return null;
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Get the NPC name for display. */
export function getNpcName(npcKey: string): string | null {
  return NPC_DIALOGUE[npcKey]?.name ?? null;
}
```

- [ ] **Step 2: Export from shared package**

Add `export * from './constants/npcDialogue';` to the shared package's index/barrel file.

- [ ] **Step 3: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts packages/shared/src/index.ts
git commit -m "feat(shared): add NPC dialogue constants from lore files"
```

### Task 15: Write NPC dialogue helper tests

**Files:**
- Create: `packages/shared/src/constants/__tests__/npcDialogue.test.ts`

- [ ] **Step 1: Write tests for getNpcLine and getNpcName**

```typescript
import { describe, it, expect } from 'vitest';
import { getNpcLine, getNpcName, NPC_DIALOGUE } from '../npcDialogue';

describe('getNpcLine', () => {
  it('returns a string for valid NPC and event', () => {
    const line = getNpcLine('millbrook-general-store', 'greeting');
    expect(typeof line).toBe('string');
    expect(line!.length).toBeGreaterThan(0);
  });

  it('returns null for unknown NPC', () => {
    expect(getNpcLine('nonexistent-npc', 'greeting')).toBeNull();
  });

  it('returns null for NPC with no lines for a specific event', () => {
    // town-guard NPC has greeting/idle lines but no buy/sell/farewell lines
    // (guards don't sell anything). If town-guard doesn't have 'buy' lines,
    // this confirms the Partial<Record> handling works.
    // If all NPCs happen to have all events, test with a mock:
    const originalData = NPC_DIALOGUE['millbrook-general-store'];
    const savedBuy = originalData.lines.buy;
    delete originalData.lines.buy;
    expect(getNpcLine('millbrook-general-store', 'buy')).toBeNull();
    originalData.lines.buy = savedBuy; // restore
  });
});

describe('getNpcName', () => {
  it('returns name for valid NPC', () => {
    expect(getNpcName('millbrook-general-store')).toBe('Bram Holloway');
  });

  it('returns null for unknown NPC', () => {
    expect(getNpcName('nonexistent')).toBeNull();
  });
});

describe('NPC_DIALOGUE completeness', () => {
  it('has entries for all expected NPC keys', () => {
    const expectedKeys = [
      'millbrook-general-store',
      'millbrook-blacksmith',
      'millbrook-tavern',
    ];
    for (const key of expectedKeys) {
      expect(NPC_DIALOGUE[key]).toBeDefined();
      expect(NPC_DIALOGUE[key].name).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run packages/shared/src/constants/__tests__/npcDialogue.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/__tests__/npcDialogue.test.ts
git commit -m "test(shared): add NPC dialogue helper tests"
```

### Task 16: Create NpcDialogueBanner component

**Files:**
- Create: `apps/web/src/components/common/NpcDialogueBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNpcLine, getNpcName, type DialogueEvent } from '@pocketrealm/shared';

interface NpcDialogueBannerProps {
  npcKey: string;
  event: DialogueEvent;
  idleIntervalMs?: number;
}

export function NpcDialogueBanner({ npcKey, event, idleIntervalMs = 15000 }: NpcDialogueBannerProps) {
  const name = getNpcName(npcKey);
  const [line, setLine] = useState<string | null>(() => getNpcLine(npcKey, event));
  const [currentEvent, setCurrentEvent] = useState(event);

  // Update line when event changes (e.g. greeting → idle → buy)
  useEffect(() => {
    if (event !== currentEvent) {
      setCurrentEvent(event);
      setLine(getNpcLine(npcKey, event));
    }
  }, [event, currentEvent, npcKey]);

  // Rotate idle lines on timer
  useEffect(() => {
    if (event !== 'idle') return;
    const interval = setInterval(() => {
      setLine(getNpcLine(npcKey, 'idle'));
    }, idleIntervalMs);
    return () => clearInterval(interval);
  }, [event, npcKey, idleIntervalMs]);

  if (!name || !line) return null;

  return (
    <div className="mb-3 p-3 rounded-lg bg-[var(--rpg-surface)] border border-[var(--rpg-border)]">
      <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide block mb-1">
        {name}
      </span>
      <p className="text-sm italic text-[var(--rpg-text-secondary)] leading-snug">
        &ldquo;{line}&rdquo;
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/NpcDialogueBanner.tsx
git commit -m "feat(ui): create NpcDialogueBanner component for shop/craft panels"
```

### Task 17: Wire NpcDialogueBanner into shop and craft panels

**Files:**
- Modify: `apps/web/src/components/screens/Quests.tsx` (shop tab — add general store NPC banner)
- Modify: `apps/web/src/components/screens/Crafting.tsx` (add blacksmith NPC banner)
- Modify: `apps/web/src/components/screens/Forge.tsx` (add blacksmith NPC banner if applicable)

- [ ] **Step 1: Add NPC banner to Shop tab in Quests.tsx**

In `Quests.tsx`, import `NpcDialogueBanner` and add it at the top of the shop tab content. Track the current dialogue event based on user actions:

```tsx
import { NpcDialogueBanner } from '../common/NpcDialogueBanner';

// Inside ShopTab component, add state:
const [dialogueEvent, setDialogueEvent] = useState<'greeting' | 'idle' | 'buy' | 'sell'>('greeting');

// After initial render, switch to idle after 3 seconds:
useEffect(() => {
  const timer = setTimeout(() => setDialogueEvent('idle'), 3000);
  return () => clearTimeout(timer);
}, []);

// On purchase, briefly show buy line:
// In the buy handler, add: setDialogueEvent('buy'); setTimeout(() => setDialogueEvent('idle'), 4000);

// Render at top of shop content:
<NpcDialogueBanner npcKey="millbrook-general-store" event={dialogueEvent} />
```

- [ ] **Step 2: Add NPC banner to Crafting.tsx**

Similar pattern — use `'millbrook-blacksmith'` NPC key. Show greeting on open, idle on timer.

- [ ] **Step 3: Wire remaining panels**

Add NPC banners to other panels as appropriate:
- Forge → `'millbrook-blacksmith'`
- Guild screen → `'millbrook-guild-recruiter'`

Not every panel needs a banner — only those with a clear NPC mapping from the lore files.

- [ ] **Step 4: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/screens/Quests.tsx apps/web/src/components/screens/Crafting.tsx apps/web/src/components/screens/Forge.tsx
git commit -m "feat(ui): wire NPC dialogue banners into shop and craft panels"
```

---

## Chunk 5: Achievement Flavour Text

### Task 18: Update AchievementDef type and definitions

**Files:**
- Modify: `packages/shared/src/types/achievement.types.ts:20-32` (add flavorText to AchievementDef)
- Modify: `packages/shared/src/types/achievement.types.ts:34-50` (add flavorText to PlayerAchievementProgress)
- Modify: `packages/shared/src/constants/achievementDefinitions.ts` (update descriptions, add flavorText)
- Modify: `apps/api/src/services/achievementService.ts:150-166` (pass flavorText through to response)

**Lore source files:**
- `docs/loop-v2/lore/*-combat-achievements.md`
- `docs/loop-v2/lore/*-boss-achievements.md`
- `docs/loop-v2/lore/*-pvp-achievements.md`
- `docs/loop-v2/lore/*-exploration-achievements.md`
- `docs/loop-v2/lore/*-crafting-achievements.md`
- `docs/loop-v2/lore/*-gathering-achievements.md`
- `docs/loop-v2/lore/*-bestiary-achievements.md`
- `docs/loop-v2/lore/*-skills-achievements.md`
- `docs/loop-v2/lore/*-general-achievements.md`
- `docs/loop-v2/lore/*-secret-achievements.md`
- `docs/loop-v2/lore/*-guild-achievements.md`
- `docs/loop-v2/lore/*-casino-achievements.md`

- [ ] **Step 1: Add flavorText to both AchievementDef and PlayerAchievementProgress types**

In `achievement.types.ts`, add `flavorText?: string;` in two places:

1. In `AchievementDef` (line 24, after `description`):
```typescript
flavorText?: string;
```

2. In `PlayerAchievementProgress` (line 38, after `description`):
```typescript
flavorText?: string;
```

Both types need the field because the API maps `AchievementDef` → `PlayerAchievementProgress` before sending to the frontend.

- [ ] **Step 2: Update achievement definitions with lore text**

In `achievementDefinitions.ts`, for each achievement that has lore:
- Replace the `description` value with the "Unlock text" from the lore file
- Add `flavorText` with the longer italic passage from the lore file

Example for Monster Hunter (combat_kills_100):

```typescript
// Before:
{
  id: 'combat_kills_100',
  category: 'combat',
  title: 'Monster Hunter',
  description: 'Kill 100 monsters',
  statKey: 'totalKills',
  threshold: 100,
}

// After:
{
  id: 'combat_kills_100',
  category: 'combat',
  title: 'Monster Hunter',
  description: 'A hundred down. The Pocketrealm has noticed you, and it is not impressed. Keep going.',
  flavorText: 'One hundred creatures have fallen to your hand. The Forest Edge knows your name now, or at least your smell. Either way, they\'ve stopped underestimating you.',
  statKey: 'totalKills',
  threshold: 100,
}
```

Only update achievements that have entries in the lore files. Leave others unchanged.

- [ ] **Step 3: Pass flavorText through achievementService.ts**

In `apps/api/src/services/achievementService.ts:150-166`, the API maps `AchievementDef` fields into the response object. Add `flavorText` to the return object at line 155 (after `description`):

```typescript
// Add after line 154 (description):
flavorText: isUnlocked ? def.flavorText : undefined,
```

Only reveal flavour text for unlocked achievements (same pattern as `titleReward`).

- [ ] **Step 5: Build shared and API**

Run: `npm run build --workspace=packages/shared && npm run build:api`
Expected: Both builds succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/achievement.types.ts packages/shared/src/constants/achievementDefinitions.ts apps/api/src/services/achievementService.ts
git commit -m "feat(shared): update achievement descriptions with lore text and add flavorText"
```

### Task 19: Update Achievement UI with expandable flavour text

**Files:**
- Modify: `apps/web/src/components/screens/Achievements.tsx:199-261` (add expand/collapse for flavorText)

- [ ] **Step 1: Add expand state and toggle**

In `Achievements.tsx`, add state for tracking which achievement's flavour text is expanded:

```typescript
const [expandedId, setExpandedId] = useState<string | null>(null);
```

- [ ] **Step 2: Update achievement card rendering**

In the achievement card (lines 224-226), replace the description paragraph:

```tsx
// Before:
<p className="text-sm text-[var(--rpg-text-secondary)]">
  {achievement.description}
</p>

// After:
<p className="text-sm text-[var(--rpg-text-secondary)]">
  {achievement.description}
</p>
{achievement.flavorText && achievement.unlocked && (
  <button
    className="text-xs text-[var(--rpg-gold)] hover:text-[var(--rpg-text-primary)] mt-1"
    onClick={() => setExpandedId(expandedId === achievement.id ? null : achievement.id)}
  >
    {expandedId === achievement.id ? '▾ Hide lore' : '▸ Read more...'}
  </button>
)}
{expandedId === achievement.id && achievement.flavorText && (
  <p className="text-sm italic text-[var(--rpg-text-secondary)] mt-1 pl-3 border-l-2 border-[var(--rpg-gold)]">
    {achievement.flavorText}
  </p>
)}
```

The flavour text is only visible for unlocked achievements (no spoilers).

- [ ] **Step 3: Build and verify**

Run: `npm run build:web`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/screens/Achievements.tsx
git commit -m "feat(ui): add expandable flavour text to achievement cards"
```

---

## Final Task

### Task 20: Integration verification and cleanup

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: No new type errors (pre-existing `page.tsx:333` error may still appear).

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass, including new bestiaryService and npcDialogue tests.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Full build succeeds.

- [ ] **Step 4: Seed fresh database and verify**

Run: `npm run db:seed`
Expected: Seed completes with all flavour text populated. Check for warnings about unmatched lore entries.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
- Open inventory → check item tooltips show flavour text
- Open bestiary → check progressive reveal works (kill count dependent)
- Open zone map → check arrival text and ambient text display
- Open shop → check NPC speech bubble appears with greeting, rotates to idle
- Open achievements → check updated descriptions, expand lore on unlocked ones

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git commit -m "chore: integration cleanup for flavour text system"
```
