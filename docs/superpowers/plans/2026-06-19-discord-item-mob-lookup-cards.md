# Discord `/item` and `/mob` Lookup Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public Discord `/item` and `/mob` slash commands that return rich Components V2 lookup cards (built from real game data) with fuzzy "did you mean" matching.

**Architecture:** Two new internal-bot-auth API endpoints (`/api/v1/discord/items/lookup`, `/api/v1/discord/mobs/lookup`) resolve a name server-side and return `{ match, suggestions }`. A pure match module handles ranking; a lookup service assembles card data from Prisma. The Discord bot renders the result as a Components V2 card, a suggestion card, or a not-found card — reusing the existing `v2Card`/`emojis` helpers.

**Tech Stack:** Express 4 + Zod + Prisma 6 (API), discord.js 14 + Components V2 (bot), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-discord-item-mob-lookup-cards-design.md`

## Global Constraints

- **No `any`** — strict TypeScript everywhere (CLAUDE.md guideline 3).
- **Service layer owns DB access** — routes delegate to `apps/api/src/services/` (guideline 5/6).
- **Zod validation at the API boundary** — query parsed with `.strict()` (guideline 8).
- **File ops** — use Write/Edit tools only (guideline 11).
- **Mob cards never expose combat stats** — no HP, damage, accuracy, defence, attributes, or boss rotation. Zones + drops + flavor only.
- **Item source = drop + craft only** — no shop source (`ShopItem` is not linked to `ItemTemplate`).
- **Public responses** — every handler calls `deferReply({ ephemeral: false })` and sets `allowedMentions: { parse: [] }`.
- **Name column width is 64 chars** — query schema caps `q` at 64.
- **Active season constant:** `SEASON_STATUSES.ACTIVE === 'active'` from `@pocketrealm/shared`.
- **Drop rate %:** `Math.round(dropChance * 10000) / 100` (matches `bestiary.ts`).
- **Run commands from the worktree:** `D:\Code\Adventure\.worktrees\pocketrealm-discord_lookup_cards`. API tests: `npm run test:api`. Bot tests: `cd apps/discord-bot && npm test`.

---

## Task 1: Pure name-match module (API)

**Files:**
- Create: `apps/api/src/services/discordLookupMatch.ts`
- Test: `apps/api/src/services/discordLookupMatch.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `normalizeLookupName(value: string): string`
  - `matchLookupName(query: string, names: string[]): { matchedName: string | null; suggestions: string[] }`
    - `matchedName` = the original-cased name whose normalized form equals the normalized query (first such name), else `null`.
    - `suggestions` = up to 5 distinct original-cased names ranked startsWith > contains > edit-distance(≤3), empty when `matchedName` is set or nothing is close.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/discordLookupMatch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { matchLookupName, normalizeLookupName } from './discordLookupMatch';

describe('normalizeLookupName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeLookupName('  Spider   Silk  ')).toBe('spider silk');
  });
});

describe('matchLookupName', () => {
  const names = ['Spider Silk', 'Spider Fang', 'Warg Pelt', 'Iron Ingot', 'Copper Ore'];

  it('returns an exact match (case-insensitive) and no suggestions', () => {
    expect(matchLookupName('spider silk', names)).toEqual({
      matchedName: 'Spider Silk',
      suggestions: [],
    });
  });

  it('suggests prefix and contains matches when there is no exact match', () => {
    const result = matchLookupName('spider', names);
    expect(result.matchedName).toBeNull();
    expect(result.suggestions).toContain('Spider Silk');
    expect(result.suggestions).toContain('Spider Fang');
  });

  it('suggests close edit-distance matches for typos', () => {
    const result = matchLookupName('iron ingto', names);
    expect(result.matchedName).toBeNull();
    expect(result.suggestions).toContain('Iron Ingot');
  });

  it('caps suggestions at 5 and de-duplicates names', () => {
    const many = ['Slime A', 'Slime B', 'Slime C', 'Slime D', 'Slime E', 'Slime F', 'Slime A'];
    const result = matchLookupName('slime', many);
    expect(result.suggestions).toHaveLength(5);
    expect(new Set(result.suggestions).size).toBe(5);
  });

  it('returns no suggestions when nothing is close', () => {
    expect(matchLookupName('zzzzzz', names)).toEqual({ matchedName: null, suggestions: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- discordLookupMatch`
Expected: FAIL — cannot find module `./discordLookupMatch`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/services/discordLookupMatch.ts`:

```ts
const MAX_SUGGESTIONS = 5;
const MAX_EDIT_DISTANCE = 3;

/** Lowercase, trim, and collapse internal whitespace for case-insensitive matching. */
export function normalizeLookupName(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

interface RankedName {
  name: string;
  tier: number; // 0 = startsWith, 1 = contains, 2 = edit-distance
  distance: number;
}

export function matchLookupName(
  query: string,
  names: string[],
): { matchedName: string | null; suggestions: string[] } {
  const normalizedQuery = normalizeLookupName(query);
  if (!normalizedQuery) {
    return { matchedName: null, suggestions: [] };
  }

  const seen = new Set<string>();
  const ranked: RankedName[] = [];

  for (const name of names) {
    const normalized = normalizeLookupName(name);
    if (normalized === normalizedQuery) {
      return { matchedName: name, suggestions: [] };
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (normalized.startsWith(normalizedQuery)) {
      ranked.push({ name, tier: 0, distance: 0 });
    } else if (normalized.includes(normalizedQuery)) {
      ranked.push({ name, tier: 1, distance: 0 });
    } else {
      const distance = editDistance(normalizedQuery, normalized);
      if (distance <= MAX_EDIT_DISTANCE) {
        ranked.push({ name, tier: 2, distance });
      }
    }
  }

  ranked.sort((a, b) => a.tier - b.tier || a.distance - b.distance || a.name.localeCompare(b.name));

  return {
    matchedName: null,
    suggestions: ranked.slice(0, MAX_SUGGESTIONS).map((entry) => entry.name),
  };
}

/** Standard Levenshtein distance. */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, i) => i);

  for (let i = 1; i < rows; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[cols - 1];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- discordLookupMatch`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/discordLookupMatch.ts apps/api/src/services/discordLookupMatch.test.ts
git commit -m "feat(api): pure name-match helper for Discord lookups (#331)"
```

---

## Task 2: Lookup service (API)

**Files:**
- Create: `apps/api/src/services/discordLookupService.ts`
- Test: `apps/api/src/services/discordLookupService.test.ts`

**Interfaces:**
- Consumes: `matchLookupName` (Task 1); `prisma` from `@pocketrealm/database`; `SEASON_STATUSES`, `ItemStats` from `@pocketrealm/shared`.
- Produces:

```ts
export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  setId: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;
  stats: Array<{ key: string; value: number }>;
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;
    } | null;
  };
}
export interface MobCardData {
  name: string;
  isBoss: boolean;
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}
export interface ItemLookupResult { match: ItemCardData | null; suggestions: string[]; }
export interface MobLookupResult { match: MobCardData | null; suggestions: string[]; }
export function lookupItemForDiscord(query: string): Promise<ItemLookupResult>;
export function lookupMobForDiscord(query: string): Promise<MobLookupResult>;
```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/discordLookupService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { lookupItemForDiscord, lookupMobForDiscord } from './discordLookupService';

describe('lookupItemForDiscord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.season.findFirst.mockResolvedValue(null);
  });

  it('returns a full item card for an exact match with drop and craft sources', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'item-1',
        name: 'Iron Ingot',
        itemType: 'resource',
        slot: null,
        tier: 2,
        weightClass: null,
        setId: null,
        requiredSkill: null,
        requiredLevel: 1,
        sellPrice: 10,
        flavorText: 'A sturdy bar of iron.',
        baseStats: {},
        seasonId: null,
        season: null,
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([
      {
        dropChance: 0.25,
        minQuantity: 1,
        maxQuantity: 2,
        mobTemplate: { name: 'Iron Golem', zone: { name: 'Iron Hills' } },
      },
    ]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce({
      skillType: 'refining',
      requiredLevel: 12,
      turnCost: 12,
      xpReward: 22,
      materials: [{ itemTemplateId: 'ore-1', quantity: 2 }],
    });
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([{ id: 'ore-1', name: 'Iron Ore' }]);

    const result = await lookupItemForDiscord('iron ingot');

    expect(result.suggestions).toEqual([]);
    expect(result.match).toMatchObject({
      name: 'Iron Ingot',
      tier: 2,
      season: null,
      sources: {
        drops: [{ mobName: 'Iron Golem', zoneName: 'Iron Hills', dropRatePct: 25, minQty: 1, maxQty: 2 }],
        craft: { skillType: 'refining', materials: [{ name: 'Iron Ore', quantity: 2 }] },
      },
    });
  });

  it('returns non-zero stats in canonical order', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      {
        id: 'sword-1', name: 'Iron Sword', itemType: 'weapon', slot: 'mainhand', tier: 2,
        weightClass: 'medium', setId: null, requiredSkill: 'melee', requiredLevel: 5,
        sellPrice: 40, flavorText: null, baseStats: { armor: 0, attack: 12, accuracy: 3 },
        seasonId: null, season: null,
      },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce(null);

    const result = await lookupItemForDiscord('Iron Sword');

    expect(result.match?.stats).toEqual([
      { key: 'attack', value: 12 },
      { key: 'accuracy', value: 3 },
    ]);
  });

  it('returns suggestions when there is no exact match', async () => {
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'a', name: 'Spider Silk', baseStats: {}, seasonId: null, season: null },
      { id: 'b', name: 'Spider Fang', baseStats: {}, seasonId: null, season: null },
    ]);

    const result = await lookupItemForDiscord('spider');

    expect(result.match).toBeNull();
    expect(result.suggestions).toEqual(expect.arrayContaining(['Spider Silk', 'Spider Fang']));
  });

  it('prefers the active-season template and labels the season', async () => {
    mockPrisma.season.findFirst.mockResolvedValue({ id: 'season-2', name: 'Season of Embers' });
    mockPrisma.itemTemplate.findMany.mockResolvedValueOnce([
      { id: 'base', name: 'Ember Blade', baseStats: {}, seasonId: null, season: null, itemType: 'weapon', slot: 'mainhand', tier: 3, weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1, sellPrice: null, flavorText: null },
      { id: 'seasonal', name: 'Ember Blade', baseStats: {}, seasonId: 'season-2', season: { id: 'season-2', name: 'Season of Embers', startsAt: new Date('2026-06-01') }, itemType: 'weapon', slot: 'mainhand', tier: 5, weightClass: null, setId: null, requiredSkill: null, requiredLevel: 1, sellPrice: null, flavorText: null },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([]);
    mockPrisma.craftingRecipe.findFirst.mockResolvedValueOnce(null);

    const result = await lookupItemForDiscord('Ember Blade');

    expect(result.match?.tier).toBe(5);
    expect(result.match?.season).toEqual({ name: 'Season of Embers' });
    // drops queried only for the seasonal template id
    expect(mockPrisma.dropTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { itemTemplateId: { in: ['seasonal'] } } }),
    );
  });
});

describe('lookupMobForDiscord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.season.findFirst.mockResolvedValue(null);
  });

  it('aggregates zones across same-named mobs and omits combat stats', async () => {
    mockPrisma.mobTemplate.findMany.mockResolvedValueOnce([
      { id: 'm1', name: 'Warg', isBoss: false, flavorAppearance: 'A grey wolf.', seasonId: null, season: null, zone: { name: 'Whispering Plains' } },
      { id: 'm2', name: 'Warg', isBoss: false, flavorAppearance: 'A grey wolf.', seasonId: null, season: null, zone: { name: 'Frostpeak' } },
    ]);
    mockPrisma.dropTable.findMany.mockResolvedValueOnce([
      { dropChance: 0.5, minQuantity: 1, maxQuantity: 1, itemTemplate: { name: 'Warg Pelt', itemType: 'resource', tier: 1 } },
    ]);

    const result = await lookupMobForDiscord('warg');

    expect(result.match).toEqual({
      name: 'Warg',
      isBoss: false,
      season: null,
      zones: ['Whispering Plains', 'Frostpeak'],
      flavorAppearance: 'A grey wolf.',
      drops: [{ itemName: 'Warg Pelt', itemType: 'resource', tier: 1, dropRatePct: 50, minQty: 1, maxQty: 1 }],
    });
    expect(JSON.stringify(result.match)).not.toContain('hp');
  });

  it('returns suggestions when no exact mob match exists', async () => {
    mockPrisma.mobTemplate.findMany.mockResolvedValueOnce([
      { id: 'm1', name: 'Forest Spider', seasonId: null, season: null, zone: { name: 'Forest Edge' } },
    ]);

    const result = await lookupMobForDiscord('spider');

    expect(result.match).toBeNull();
    expect(result.suggestions).toContain('Forest Spider');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- discordLookupService`
Expected: FAIL — cannot find module `./discordLookupService`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/src/services/discordLookupService.ts`:

```ts
import { prisma } from '@pocketrealm/database';
import { SEASON_STATUSES, type ItemStats } from '@pocketrealm/shared';
import { matchLookupName, normalizeLookupName } from './discordLookupMatch';

export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  setId: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;
  stats: Array<{ key: string; value: number }>;
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;
    } | null;
  };
}

export interface MobCardData {
  name: string;
  isBoss: boolean;
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}

export interface ItemLookupResult { match: ItemCardData | null; suggestions: string[]; }
export interface MobLookupResult { match: MobCardData | null; suggestions: string[]; }

const STAT_ORDER: Array<keyof ItemStats> = [
  'attack', 'magicPower', 'rangedPower', 'accuracy', 'dodge', 'armor',
  'magicDefence', 'health', 'luck', 'critChance', 'critDamage', 'inventorySlots',
];

function dropRatePct(dropChance: unknown): number {
  return Math.round(Number(dropChance) * 10000) / 100;
}

interface SeasonRef { id: string; name: string; startsAt?: Date | string | null }
interface SeasonedRow { id: string; seasonId: string | null; season: SeasonRef | null }

async function activeSeasonId(): Promise<string | null> {
  const season = await prisma.season.findFirst({
    where: { status: SEASON_STATUSES.ACTIVE },
    select: { id: true, name: true },
  });
  return season?.id ?? null;
}

/**
 * Given rows that share the matched name, pick the season scope to display by
 * priority: active season -> base (null) -> most recent season. Returns the
 * rows in that scope plus a season label.
 */
function resolveSeasonScope<T extends SeasonedRow>(
  rows: T[],
  activeId: string | null,
): { scoped: T[]; season: { name: string } | null } {
  const hasActive = activeId !== null && rows.some((row) => row.seasonId === activeId);
  if (hasActive) {
    const scoped = rows.filter((row) => row.seasonId === activeId);
    return { scoped, season: scoped[0]?.season ? { name: scoped[0].season!.name } : null };
  }

  const hasBase = rows.some((row) => row.seasonId === null);
  if (hasBase) {
    return { scoped: rows.filter((row) => row.seasonId === null), season: null };
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(b.season?.startsAt ?? 0).getTime() - new Date(a.season?.startsAt ?? 0).getTime(),
  );
  const newestSeasonId = sorted[0]?.seasonId ?? null;
  const scoped = rows.filter((row) => row.seasonId === newestSeasonId);
  return { scoped, season: scoped[0]?.season ? { name: scoped[0].season!.name } : null };
}

export async function lookupItemForDiscord(query: string): Promise<ItemLookupResult> {
  const templates = await prisma.itemTemplate.findMany({
    select: {
      id: true, name: true, itemType: true, slot: true, tier: true, weightClass: true,
      setId: true, requiredSkill: true, requiredLevel: true, sellPrice: true,
      flavorText: true, baseStats: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
    },
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const { scoped, season } = resolveSeasonScope(rows, await activeSeasonId());
  const ids = scoped.map((row) => row.id);
  const primary = scoped[0]!;

  const dropRows = await prisma.dropTable.findMany({
    where: { itemTemplateId: { in: ids } },
    select: {
      dropChance: true, minQuantity: true, maxQuantity: true,
      mobTemplate: { select: { name: true, zone: { select: { name: true } } } },
    },
  });
  const drops = dropRows
    .map((row) => ({
      mobName: row.mobTemplate.name,
      zoneName: row.mobTemplate.zone.name,
      dropRatePct: dropRatePct(row.dropChance),
      minQty: row.minQuantity,
      maxQty: row.maxQuantity,
    }))
    .sort((a, b) => b.dropRatePct - a.dropRatePct);

  const recipe = await prisma.craftingRecipe.findFirst({
    where: { resultTemplateId: { in: ids } },
    select: { skillType: true, requiredLevel: true, turnCost: true, xpReward: true, materials: true },
  });

  let craft: ItemCardData['sources']['craft'] = null;
  if (recipe) {
    const materialList = Array.isArray(recipe.materials)
      ? (recipe.materials as Array<{ itemTemplateId: string; quantity: number }>)
      : [];
    const matTemplates = materialList.length
      ? await prisma.itemTemplate.findMany({
          where: { id: { in: materialList.map((m) => m.itemTemplateId) } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(matTemplates.map((t) => [t.id, t.name]));
    craft = {
      skillType: recipe.skillType,
      requiredLevel: recipe.requiredLevel,
      turnCost: recipe.turnCost,
      xpReward: recipe.xpReward,
      materials: materialList.map((m) => ({
        name: nameById.get(m.itemTemplateId) ?? 'Unknown material',
        quantity: m.quantity,
      })),
    };
  }

  const baseStats = (primary.baseStats ?? {}) as ItemStats;
  const stats = STAT_ORDER.flatMap((key) => {
    const value = baseStats[key];
    return typeof value === 'number' && value !== 0 ? [{ key, value }] : [];
  });

  return {
    suggestions: [],
    match: {
      name: primary.name,
      itemType: primary.itemType,
      slot: primary.slot,
      tier: primary.tier,
      weightClass: primary.weightClass,
      setId: primary.setId,
      requiredSkill: primary.requiredSkill,
      requiredLevel: primary.requiredLevel,
      sellPrice: primary.sellPrice,
      flavorText: primary.flavorText,
      season,
      stats,
      sources: { drops, craft },
    },
  };
}

export async function lookupMobForDiscord(query: string): Promise<MobLookupResult> {
  const templates = await prisma.mobTemplate.findMany({
    select: {
      id: true, name: true, isBoss: true, flavorAppearance: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
      zone: { select: { name: true } },
    },
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const { scoped, season } = resolveSeasonScope(rows, await activeSeasonId());
  const ids = scoped.map((row) => row.id);
  const primary = scoped[0]!;

  const zones = Array.from(new Set(scoped.map((row) => row.zone.name)));

  const dropRows = await prisma.dropTable.findMany({
    where: { mobTemplateId: { in: ids } },
    select: {
      dropChance: true, minQuantity: true, maxQuantity: true,
      itemTemplate: { select: { name: true, itemType: true, tier: true } },
    },
  });
  const drops = dropRows
    .map((row) => ({
      itemName: row.itemTemplate.name,
      itemType: row.itemTemplate.itemType,
      tier: row.itemTemplate.tier,
      dropRatePct: dropRatePct(row.dropChance),
      minQty: row.minQuantity,
      maxQty: row.maxQuantity,
    }))
    .sort((a, b) => b.dropRatePct - a.dropRatePct);

  return {
    suggestions: [],
    match: {
      name: primary.name,
      isBoss: primary.isBoss,
      season,
      zones,
      flavorAppearance: primary.flavorAppearance,
      drops,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- discordLookupService`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/discordLookupService.ts apps/api/src/services/discordLookupService.test.ts
git commit -m "feat(api): Discord item/mob lookup service (#331)"
```

---

## Task 3: Lookup endpoints (API)

**Files:**
- Modify: `apps/api/src/routes/discord.ts`
- Test: `apps/api/src/routes/discord.test.ts`

**Interfaces:**
- Consumes: `lookupItemForDiscord`, `lookupMobForDiscord` (Task 2); `requireInternalBotAuth`; `asyncHandler`; `z`.
- Produces: `GET /api/v1/discord/items/lookup?q=` and `/mobs/lookup?q=`, returning the service result JSON verbatim.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/routes/discord.test.ts`. First add the service to the hoisted mocks block (after `ackDiscordNotificationEvents: vi.fn(),`):

```ts
  lookupItemForDiscord: vi.fn(),
  lookupMobForDiscord: vi.fn(),
```

Then add a `vi.mock` (next to the other `vi.mock('../services/...')` calls, before `import { discordRouter }`):

```ts
vi.mock('../services/discordLookupService', () => ({
  lookupItemForDiscord: mocks.lookupItemForDiscord,
  lookupMobForDiscord: mocks.lookupMobForDiscord,
}));
```

Then add tests inside `describe('discordRouter', ...)`:

```ts
it('requires bot auth and returns an item lookup card', async () => {
  await request(app()).get('/api/v1/discord/items/lookup?q=iron').expect(401);

  mocks.lookupItemForDiscord.mockResolvedValue({
    match: { name: 'Iron Ingot', sources: { drops: [], craft: null }, stats: [], season: null },
    suggestions: [],
  });

  const res = await request(app())
    .get('/api/v1/discord/items/lookup?q=iron%20ingot')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .expect(200);

  expect(res.body.match.name).toBe('Iron Ingot');
  expect(mocks.lookupItemForDiscord).toHaveBeenCalledWith('iron ingot');
});

it('returns mob suggestions when there is no exact match', async () => {
  mocks.lookupMobForDiscord.mockResolvedValue({ match: null, suggestions: ['Forest Spider'] });

  const res = await request(app())
    .get('/api/v1/discord/mobs/lookup?q=spider')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .expect(200);

  expect(res.body).toEqual({ match: null, suggestions: ['Forest Spider'] });
});

it('rejects an empty lookup query', async () => {
  await request(app())
    .get('/api/v1/discord/items/lookup?q=')
    .set('x-pocketrealm-bot-key', 'bot-key')
    .expect(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:api -- routes/discord`
Expected: FAIL — 404 (routes not registered) on the lookup requests.

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/routes/discord.ts`, add the import alongside the other service imports:

```ts
import { lookupItemForDiscord, lookupMobForDiscord } from '../services/discordLookupService';
```

Add the query schema near the other schemas (e.g. after `discordWikiSearchQuerySchema`):

```ts
const discordLookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
}).strict();
```

Add the routes (e.g. right after the `/wiki/search` route):

```ts
discordRouter.get('/items/lookup', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordLookupQuerySchema.parse(req.query);
  const result = await lookupItemForDiscord(query.q);

  res.json(result);
}));

discordRouter.get('/mobs/lookup', requireInternalBotAuth, asyncHandler(async (req, res) => {
  const query = discordLookupQuerySchema.parse(req.query);
  const result = await lookupMobForDiscord(query.q);

  res.json(result);
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:api -- routes/discord`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/discord.ts apps/api/src/routes/discord.test.ts
git commit -m "feat(api): Discord items/mobs lookup endpoints (#331)"
```

---

## Task 4: Shared markdown-escape helper (bot)

**Files:**
- Modify: `apps/discord-bot/src/utils.ts`
- Test: `apps/discord-bot/src/utils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `escapeDiscordText(value: string): string` — neutralizes `@mentions` (zero-width after `@`) and escapes Discord markdown control characters. Used by lookup cards for echoed queries and game-data text.

- [ ] **Step 1: Write the failing test**

Add to `apps/discord-bot/src/utils.test.ts`:

```ts
import { escapeDiscordText } from './utils.js';

describe('escapeDiscordText', () => {
  it('neutralizes mentions and escapes markdown control characters', () => {
    expect(escapeDiscordText('@everyone **bold** _x_')).toBe('@​everyone \\*\\*bold\\*\\* \\_x\\_');
  });

  it('leaves plain text untouched', () => {
    expect(escapeDiscordText('Spider Silk')).toBe('Spider Silk');
  });
});
```

(If `describe`/`expect`/`it` are not yet imported in that file, add `import { describe, expect, it } from 'vitest';` — match the existing import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/discord-bot && npm test -- utils`
Expected: FAIL — `escapeDiscordText` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `apps/discord-bot/src/utils.ts`:

```ts
/** Neutralize mentions and escape Discord markdown control characters for safe display. */
export function escapeDiscordText(value: string): string {
  return value
    .replace(/@/g, '@​')
    .replace(/([\\`*_{}\[\]()#+.!|><~-])/g, '\\$1');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/discord-bot && npm test -- utils`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/utils.ts apps/discord-bot/src/utils.test.ts
git commit -m "feat(bot): shared escapeDiscordText helper (#331)"
```

---

## Task 5: Add `item` and `mob` emoji keys (bot)

**Files:**
- Modify: `apps/discord-bot/src/discord/emojis.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `'item'` and `'mob'` added to `DISCORD_EMOJI_KEYS` and `DEFAULT_DISCORD_EMOJIS` (defaults `🗡️` and `👹`). The existing `emojis.test.ts` iterates keys generically, so no test change is required, but verify it still passes.

- [ ] **Step 1: Edit the catalog**

In `apps/discord-bot/src/discord/emojis.ts`, add `'item'` and `'mob'` to the `DISCORD_EMOJI_KEYS` array (after `'wiki'`):

```ts
  'wiki',
  'item',
  'mob',
  'profile',
```

And add matching defaults in `DEFAULT_DISCORD_EMOJIS` (after `wiki: '📖',`):

```ts
  wiki: '📖',
  item: '🗡️',
  mob: '👹',
  profile: '🧙',
```

- [ ] **Step 2: Run the emoji tests**

Run: `cd apps/discord-bot && npm test -- emojis`
Expected: PASS — "has a fallback for every semantic key" now also covers `item`/`mob`.

- [ ] **Step 3: Commit**

```bash
git add apps/discord-bot/src/discord/emojis.ts
git commit -m "feat(bot): add item and mob emoji keys (#331)"
```

---

## Task 6: Lookup card builders (bot)

**Files:**
- Create: `apps/discord-bot/src/discord/lookupCard.ts`
- Test: `apps/discord-bot/src/discord/lookupCard.test.ts`

**Interfaces:**
- Consumes: `textCard`, `statusCard`, `V2CardPayload`, `V2CardOptions` from `./v2Card.js`; `DiscordEmojiMap` from `./emojis.js`; `escapeDiscordText` (Task 4); the `ItemCardData`/`MobCardData` shapes (Task 2), re-declared locally.
- Produces:
  - `interface ItemCardData`, `interface MobCardData` (mirror the API shapes).
  - `buildItemCard(data: ItemCardData, emojiMap: DiscordEmojiMap): V2CardPayload`
  - `buildMobCard(data: MobCardData, emojiMap: DiscordEmojiMap): V2CardPayload`
  - `buildSuggestionCard(query: string, suggestions: string[], kind: 'item' | 'mob', emojiMap: DiscordEmojiMap): V2CardPayload`
  - `buildNotFoundCard(query: string, kind: 'item' | 'mob', emojiMap: DiscordEmojiMap): V2CardPayload`

- [ ] **Step 1: Write the failing test**

Create `apps/discord-bot/src/discord/lookupCard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import {
  buildItemCard,
  buildMobCard,
  buildNotFoundCard,
  buildSuggestionCard,
  type ItemCardData,
  type MobCardData,
} from './lookupCard.js';

const emojiMap = {};

const item: ItemCardData = {
  name: 'Iron Ingot',
  itemType: 'resource',
  slot: null,
  tier: 2,
  weightClass: null,
  setId: null,
  requiredSkill: null,
  requiredLevel: 1,
  sellPrice: 10,
  flavorText: 'A sturdy bar of iron.',
  season: null,
  stats: [{ key: 'attack', value: 12 }],
  sources: {
    drops: [{ mobName: 'Iron Golem', zoneName: 'Iron Hills', dropRatePct: 25, minQty: 1, maxQty: 2 }],
    craft: { skillType: 'refining', requiredLevel: 12, turnCost: 12, xpReward: 22, materials: [{ name: 'Iron Ore', quantity: 2 }] },
  },
};

const mob: MobCardData = {
  name: 'Warg',
  isBoss: false,
  season: null,
  zones: ['Whispering Plains', 'Frostpeak'],
  flavorAppearance: 'A grey wolf.',
  drops: [{ itemName: 'Warg Pelt', itemType: 'resource', tier: 1, dropRatePct: 50, minQty: 1, maxQty: 1 }],
};

describe('buildItemCard', () => {
  it('renders name, stats, drop and craft sources', () => {
    const payload = buildItemCard(item, emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Iron Ingot');
    expect(text).toContain('attack');
    expect(text).toContain('Iron Golem');
    expect(text).toContain('Iron Hills');
    expect(text).toContain('Iron Ore');
  });

  it('labels seasonal items and omits combat-only fields', () => {
    const payload = buildItemCard({ ...item, season: { name: 'Season of Embers' } }, emojiMap);
    expect(cardText(payload)).toContain('Season of Embers');
  });
});

describe('buildMobCard', () => {
  it('renders zones and drops without combat stats', () => {
    const payload = buildMobCard(mob, emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Warg');
    expect(text).toContain('Whispering Plains');
    expect(text).toContain('Warg Pelt');
    expect(text).not.toContain('HP');
  });
});

describe('buildSuggestionCard', () => {
  it('lists suggestions and escapes the query', () => {
    const payload = buildSuggestionCard('@spider', ['Spider Silk', 'Spider Fang'], 'item', emojiMap);
    expectV2Card(payload);
    const text = cardText(payload);
    expect(text).toContain('Spider Silk');
    expect(text).toContain('@​spider');
  });
});

describe('buildNotFoundCard', () => {
  it('reports no match for the escaped query', () => {
    const payload = buildNotFoundCard('@nothing', 'mob', emojiMap);
    expectV2Card(payload);
    expect(cardText(payload)).toContain('@​nothing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/discord-bot && npm test -- lookupCard`
Expected: FAIL — cannot find module `./lookupCard.js`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/discord-bot/src/discord/lookupCard.ts`:

```ts
import { escapeDiscordText, truncateText } from '../utils.js';
import type { DiscordEmojiMap } from './emojis.js';
import { statusCard, textCard, type V2CardPayload } from './v2Card.js';

const MAX_LIST = 15;
const MAX_FLAVOR = 300;
const PUBLIC_REPLY_OPTIONS = { allowedMentions: { parse: [] } } as const;

export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  setId: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;
  stats: Array<{ key: string; value: number }>;
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;
    } | null;
  };
}

export interface MobCardData {
  name: string;
  isBoss: boolean;
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}

function seasonLine(season: { name: string } | null): string | null {
  return season ? `🗓️ Seasonal — ${escapeDiscordText(season.name)}` : null;
}

function quantityText(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

function cappedList<T>(items: T[], render: (item: T) => string): string[] {
  const shown = items.slice(0, MAX_LIST).map(render);
  if (items.length > MAX_LIST) {
    shown.push(`…and ${items.length - MAX_LIST} more`);
  }
  return shown;
}

export function buildItemCard(data: ItemCardData, emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  const meta = [`Type: ${escapeDiscordText(data.itemType)}`, `Tier ${data.tier}`];
  if (data.slot) meta.push(`Slot: ${escapeDiscordText(data.slot)}`);
  if (data.weightClass) meta.push(`${escapeDiscordText(data.weightClass)}`);
  lines.push(meta.join(' • '));

  const season = seasonLine(data.season);
  if (season) lines.push(season);

  if (data.requiredSkill || data.requiredLevel > 1) {
    const req = data.requiredSkill
      ? `${escapeDiscordText(data.requiredSkill)} Lv. ${data.requiredLevel}`
      : `Level ${data.requiredLevel}`;
    lines.push(`**Requires:** ${req}`);
  }

  if (data.stats.length) {
    lines.push('**Stats**');
    for (const stat of data.stats) {
      lines.push(`• ${escapeDiscordText(stat.key)}: ${stat.value}`);
    }
  }

  if (data.sources.drops.length) {
    lines.push('**Dropped by**');
    for (const line of cappedList(data.sources.drops, (drop) =>
      `• ${escapeDiscordText(drop.mobName)} (${escapeDiscordText(drop.zoneName)}) — ${drop.dropRatePct}%`,
    )) {
      lines.push(line);
    }
  }

  if (data.sources.craft) {
    const craft = data.sources.craft;
    lines.push(`**Crafted** (${escapeDiscordText(craft.skillType)} Lv. ${craft.requiredLevel}, ${craft.turnCost} turns)`);
    for (const mat of craft.materials) {
      lines.push(`• ${escapeDiscordText(mat.name)} ×${mat.quantity}`);
    }
  }

  if (!data.sources.drops.length && !data.sources.craft) {
    lines.push('_No known drop or craft source._');
  }

  if (typeof data.sellPrice === 'number') {
    lines.push(`Sell: ${data.sellPrice}g`);
  }

  if (data.flavorText) {
    lines.push(`_${escapeDiscordText(truncateText(data.flavorText, MAX_FLAVOR))}_`);
  }

  return textCard({
    emojiKey: 'item',
    title: escapeDiscordText(data.name),
    emojiMap,
    lines,
    ...PUBLIC_REPLY_OPTIONS,
  });
}

export function buildMobCard(data: MobCardData, emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  if (data.isBoss) lines.push('**Boss**');

  const season = seasonLine(data.season);
  if (season) lines.push(season);

  if (data.zones.length) {
    lines.push(`**Found in:** ${data.zones.map(escapeDiscordText).join(', ')}`);
  } else {
    lines.push('**Found in:** _Unknown_');
  }

  if (data.drops.length) {
    lines.push('**Drops**');
    for (const line of cappedList(data.drops, (drop) =>
      `• ${escapeDiscordText(drop.itemName)} — ${drop.dropRatePct}% (×${quantityText(drop.minQty, drop.maxQty)})`,
    )) {
      lines.push(line);
    }
  } else {
    lines.push('_No known drops._');
  }

  if (data.flavorAppearance) {
    lines.push(`_${escapeDiscordText(truncateText(data.flavorAppearance, MAX_FLAVOR))}_`);
  }

  return textCard({
    emojiKey: 'mob',
    title: escapeDiscordText(data.name),
    emojiMap,
    lines,
    ...PUBLIC_REPLY_OPTIONS,
  });
}

export function buildSuggestionCard(
  query: string,
  suggestions: string[],
  kind: 'item' | 'mob',
  emojiMap: DiscordEmojiMap,
): V2CardPayload {
  const lines = suggestions.map((name) => `• ${escapeDiscordText(name)}`);
  return textCard({
    emojiKey: kind,
    title: `No exact ${kind} match for "${escapeDiscordText(query)}"`,
    emojiMap,
    lines: ['Did you mean:', ...lines],
    ...PUBLIC_REPLY_OPTIONS,
  });
}

export function buildNotFoundCard(
  query: string,
  kind: 'item' | 'mob',
  emojiMap: DiscordEmojiMap,
): V2CardPayload {
  return statusCard(
    'info',
    `No ${kind} found`,
    `No ${kind} found for "${escapeDiscordText(query)}".`,
    emojiMap,
    PUBLIC_REPLY_OPTIONS,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/discord-bot && npm test -- lookupCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/discord/lookupCard.ts apps/discord-bot/src/discord/lookupCard.test.ts
git commit -m "feat(bot): Components V2 item/mob lookup cards (#331)"
```

---

## Task 7: Lookup command handlers (bot)

**Files:**
- Create: `apps/discord-bot/src/interactions/lookupCommand.ts`
- Test: `apps/discord-bot/src/interactions/lookupCommand.test.ts`

**Interfaces:**
- Consumes: `PocketRealmApiClient` (`get`), `BotConfig` (`emojiMap`); the card builders (Task 6).
- Produces:
  - `handleItemCommand(interaction, api: Pick<PocketRealmApiClient,'get'>, config: Pick<BotConfig,'emojiMap'>): Promise<void>`
  - `handleMobCommand(interaction, api, config): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/discord-bot/src/interactions/lookupCommand.test.ts`:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import { cardText, expectV2Card } from '../test/v2CardAssertions.js';
import { handleItemCommand, handleMobCommand } from './lookupCommand.js';

const config = { emojiMap: {} };

function makeInteraction(query: string) {
  const deferReply = vi.fn<ChatInputCommandInteraction['deferReply']>();
  const editReply = vi.fn<ChatInputCommandInteraction['editReply']>();
  const interaction = {
    options: { getString: vi.fn(() => query) },
    deferReply,
    editReply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, deferReply, editReply };
}

describe('handleItemCommand', () => {
  it('defers publicly and renders an item card on a match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      match: {
        name: 'Iron Ingot', itemType: 'resource', slot: null, tier: 2, weightClass: null,
        setId: null, requiredSkill: null, requiredLevel: 1, sellPrice: 10, flavorText: null,
        season: null, stats: [], sources: { drops: [], craft: null },
      },
      suggestions: [],
    }) as T);
    const { interaction, deferReply, editReply } = makeInteraction('iron ingot');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/items/lookup?q=iron%20ingot');
    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('Iron Ingot');
  });

  it('renders a suggestion card when there is no match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ match: null, suggestions: ['Spider Silk'] }) as T);
    const { interaction, editReply } = makeInteraction('spider');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('Spider Silk');
  });

  it('renders a not-found card when there are no suggestions', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({ match: null, suggestions: [] }) as T);
    const { interaction, editReply } = makeInteraction('zzz');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('No item found');
  });

  it('renders an error card when the API is unavailable', async () => {
    const get = vi.fn(async (): Promise<never> => { throw new Error('down'); });
    const { interaction, editReply } = makeInteraction('iron');

    await handleItemCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    const payload = editReply.mock.calls[0]?.[0];
    expectV2Card(payload);
    expect(cardText(payload)).toContain('unavailable');
  });
});

describe('handleMobCommand', () => {
  it('renders a mob card on a match', async () => {
    const get = vi.fn(async <T>(): Promise<T> => ({
      match: { name: 'Warg', isBoss: false, season: null, zones: ['Whispering Plains'], flavorAppearance: null, drops: [] },
      suggestions: [],
    }) as T);
    const { interaction, deferReply, editReply } = makeInteraction('warg');

    await handleMobCommand(interaction, { get } as Pick<PocketRealmApiClient, 'get'>, config);

    expect(deferReply).toHaveBeenCalledWith({ ephemeral: false });
    expect(get).toHaveBeenCalledWith('/api/v1/discord/mobs/lookup?q=warg');
    expect(cardText(editReply.mock.calls[0]?.[0])).toContain('Whispering Plains');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/discord-bot && npm test -- lookupCommand`
Expected: FAIL — cannot find module `./lookupCommand.js`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/discord-bot/src/interactions/lookupCommand.ts`:

```ts
import type { ChatInputCommandInteraction } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { statusCard } from '../discord/v2Card.js';
import {
  buildItemCard,
  buildMobCard,
  buildNotFoundCard,
  buildSuggestionCard,
  type ItemCardData,
  type MobCardData,
} from '../discord/lookupCard.js';

type LookupApiClient = Pick<PocketRealmApiClient, 'get'>;
type LookupConfig = Pick<BotConfig, 'emojiMap'>;

const PUBLIC_REPLY_OPTIONS = { allowedMentions: { parse: [] } } as const;

interface ItemLookupResponse { match: ItemCardData | null; suggestions: string[]; }
interface MobLookupResponse { match: MobCardData | null; suggestions: string[]; }

export async function handleItemCommand(
  interaction: ChatInputCommandInteraction,
  api: LookupApiClient,
  config: LookupConfig,
): Promise<void> {
  const query = interaction.options.getString('query', true).trim();
  await interaction.deferReply({ ephemeral: false });

  let response: ItemLookupResponse;
  try {
    response = await api.get<ItemLookupResponse>(
      `/api/v1/discord/items/lookup?q=${encodeURIComponent(query)}`,
    );
  } catch {
    await interaction.editReply(unavailableCard('item', config));
    return;
  }

  if (response.match) {
    await interaction.editReply(buildItemCard(response.match, config.emojiMap));
    return;
  }
  if (response.suggestions.length) {
    await interaction.editReply(buildSuggestionCard(query, response.suggestions, 'item', config.emojiMap));
    return;
  }
  await interaction.editReply(buildNotFoundCard(query, 'item', config.emojiMap));
}

export async function handleMobCommand(
  interaction: ChatInputCommandInteraction,
  api: LookupApiClient,
  config: LookupConfig,
): Promise<void> {
  const query = interaction.options.getString('query', true).trim();
  await interaction.deferReply({ ephemeral: false });

  let response: MobLookupResponse;
  try {
    response = await api.get<MobLookupResponse>(
      `/api/v1/discord/mobs/lookup?q=${encodeURIComponent(query)}`,
    );
  } catch {
    await interaction.editReply(unavailableCard('mob', config));
    return;
  }

  if (response.match) {
    await interaction.editReply(buildMobCard(response.match, config.emojiMap));
    return;
  }
  if (response.suggestions.length) {
    await interaction.editReply(buildSuggestionCard(query, response.suggestions, 'mob', config.emojiMap));
    return;
  }
  await interaction.editReply(buildNotFoundCard(query, 'mob', config.emojiMap));
}

function unavailableCard(kind: 'item' | 'mob', config: LookupConfig) {
  return statusCard(
    'error',
    'Lookup unavailable',
    `Unable to look up that ${kind} right now. Please try again later.`,
    config.emojiMap,
    PUBLIC_REPLY_OPTIONS,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/discord-bot && npm test -- lookupCommand`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/discord-bot/src/interactions/lookupCommand.ts apps/discord-bot/src/interactions/lookupCommand.test.ts
git commit -m "feat(bot): /item and /mob lookup command handlers (#331)"
```

---

## Task 8: Register commands and route them (bot)

**Files:**
- Modify: `apps/discord-bot/src/commands/definitions.ts`
- Modify: `apps/discord-bot/src/commands/definitions.test.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.ts`
- Modify: `apps/discord-bot/src/interactions/interactionRouter.test.ts`

**Interfaces:**
- Consumes: `handleItemCommand`, `handleMobCommand` (Task 7).
- Produces: `/item` and `/mob` slash commands registered and routed.

- [ ] **Step 1: Update the definitions test (failing)**

In `apps/discord-bot/src/commands/definitions.test.ts`, update the command-list assertion to include `item` and `mob` (placed after `wiki`) and bump the length:

```ts
    expect(commandNames).toEqual([
      'link',
      'wiki',
      'item',
      'mob',
      'profile',
      'turns',
      'skills',
      'rank',
      'duel',
      'report',
      'notify',
      'staff',
    ]);
    expect(commands).toHaveLength(12);
```

Add an options assertion in the "builds public command options" test:

```ts
    expect(commands.find((command) => command.name === 'item')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
    expect(commands.find((command) => command.name === 'mob')?.options).toEqual([
      expect.objectContaining({
        name: 'query',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
    ]);
```

- [ ] **Step 2: Update the router test (failing)**

In `apps/discord-bot/src/interactions/interactionRouter.test.ts`, add a mock for the new handler module (next to the other `vi.mock('./...')` calls):

```ts
vi.mock('./lookupCommand.js', () => ({
  handleItemCommand: vi.fn(),
  handleMobCommand: vi.fn(),
}));
```

Add a routing test inside `describe('routeInteraction', ...)`:

```ts
it('routes item commands to the item handler', async () => {
  const { handleItemCommand } = await import('./lookupCommand.js');
  const api = createApi({ match: null, suggestions: [] });
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'item',
    options: { getString: vi.fn(() => 'iron') },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as Interaction;

  await routeInteraction(interaction, { api, config: routerConfig });

  expect(handleItemCommand).toHaveBeenCalledOnce();
});

it('routes mob commands to the mob handler', async () => {
  const { handleMobCommand } = await import('./lookupCommand.js');
  const api = createApi({ match: null, suggestions: [] });
  const interaction = {
    isChatInputCommand: () => true,
    commandName: 'mob',
    options: { getString: vi.fn(() => 'warg') },
    deferReply: vi.fn(),
    editReply: vi.fn(),
  } as unknown as Interaction;

  await routeInteraction(interaction, { api, config: routerConfig });

  expect(handleMobCommand).toHaveBeenCalledOnce();
});
```

> Note: `createApi` and `routerConfig` already exist in this test file (see the existing wiki routing test). Reuse them; if `createApi` requires a specific shape, match the existing call style used by the wiki test.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/discord-bot && npm test -- definitions interactionRouter`
Expected: FAIL — definitions list mismatch; router does not call the new handlers.

- [ ] **Step 4: Implement the definitions**

In `apps/discord-bot/src/commands/definitions.ts`, add two builders right after the `wiki` command builder:

```ts
    new SlashCommandBuilder()
      .setName('item')
      .setDescription('Look up a Pocketrealm item.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Item name to look up.')
          .setRequired(true),
      ),
    new SlashCommandBuilder()
      .setName('mob')
      .setDescription('Look up a Pocketrealm creature.')
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription('Creature name to look up.')
          .setRequired(true),
      ),
```

- [ ] **Step 5: Implement the routing**

In `apps/discord-bot/src/interactions/interactionRouter.ts`:

Add the import (next to `import { handleWikiCommand } from './wikiCommand.js';`):

```ts
import { handleItemCommand, handleMobCommand } from './lookupCommand.js';
```

Add the routing branches (right after the `wiki` branch):

```ts
  if (interaction.commandName === 'item') {
    await handleItemCommand(interaction, options.api, options.config);
    return;
  }

  if (interaction.commandName === 'mob') {
    await handleMobCommand(interaction, options.api, options.config);
    return;
  }
```

> `options.config` already carries `emojiMap` (the router config type includes it — verify `emojiMap` is present in `InteractionRouterOptions['config']`; the wiki handler already receives `options.config`, so no type change is needed).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/discord-bot && npm test -- definitions interactionRouter`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/discord-bot/src/commands/definitions.ts apps/discord-bot/src/commands/definitions.test.ts apps/discord-bot/src/interactions/interactionRouter.ts apps/discord-bot/src/interactions/interactionRouter.test.ts
git commit -m "feat(bot): register and route /item and /mob commands (#331)"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole workspace**

Run (from worktree root): `npm run build:api && cd apps/discord-bot && npm run build`
Expected: both succeed with no TypeScript errors.

> Rationale: `tsc -b` project references plus the bot's own `tsc` catch cross-package type drift (per memory: typecheck before pushing).

- [ ] **Step 2: Run the API test suite**

Run: `npm run test:api`
Expected: PASS (Redis container must be running — it is, from worktree setup).

- [ ] **Step 3: Run the bot test suite**

Run: `cd apps/discord-bot && npm test`
Expected: PASS (all suites, including the 4 new files).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 5: Confirm no stray combat stats leaked into the mob path**

Run: `cd apps/discord-bot && npm test -- lookupCard lookupCommand`
Expected: PASS, including the assertions that mob output contains no `HP`.

---

## Self-Review Notes (author)

- **Spec coverage:** `/item` card (Tasks 2,6,7) ✓; `/mob` card without combat stats (Tasks 2,6) ✓; fuzzy + did-you-mean (Tasks 1,6,7) ✓; new bot-auth endpoints (Task 3) ✓; public responses (Task 7) ✓; drop+craft only, no shop (Task 2) ✓; season label + disambiguation (Task 2 `resolveSeasonScope`) ✓; testing on both sides (all tasks + Task 9) ✓.
- **Out of scope honored:** no shop source, no mob combat stats, no discovery gating, no autocomplete, no images.
- **Type consistency:** `ItemCardData`/`MobCardData` are defined identically in the API service (Task 2) and re-declared verbatim in `lookupCard.ts` (Task 6); handler response interfaces (Task 7) reuse the card module's exported types. `buildItemCard`/`buildMobCard`/`buildSuggestionCard`/`buildNotFoundCard` signatures match between Task 6 (definition) and Task 7 (use).
- **No placeholders:** every code step is complete and copy-able.
```
