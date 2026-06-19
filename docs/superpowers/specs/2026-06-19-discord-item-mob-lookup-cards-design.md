# Discord `/item` and `/mob` Lookup Cards — Design

**Issue:** [#331](https://github.com/Clar17y/Adventure/issues/331) (part of #321)
**Date:** 2026-06-19
**Branch:** `discord-lookup-cards`

## Goal

Add two public Discord slash commands that return rich lookup cards built from
real game data, replacing the link-only experience of `/wiki`:

- `/item <name>` — stat card: slot, stats, requirements, and **source** (drop / craft).
- `/mob <name>` — "where to find / what it drops" card: zones and drops.

Both are **public (non-ephemeral)** so they're useful in conversation, and both
support **fuzzy name matching with "did you mean" suggestions**.

### Reframe from the issue text

The issue lists `/mob` as a "bestiary card: stats, drops, zones". After
discussion, the mob card intentionally **omits combat stats** (HP, damage,
accuracy, defence, attributes, action templates). The real use case is
discovery — *"Where do I find Wargs?"* → "Whispering Plains", and *"What drops
spider silk?"* → "spiders in Forest Edge". This also sidesteps the in-game
bestiary discovery mechanic (undiscovered mobs are hidden as `???`): because no
combat stats are revealed, there is no spoiler concern and **no discovery gating
is applied** — lookups always return full zone/drop data.

`/item` keeps full stats and requirements per the issue (items are not subject to
the bestiary discovery mechanic).

**Shop source is out of scope.** `ShopItem` is not linked to `ItemTemplate` (it
sells buffs keyed by name, not item templates), so only **drop** and **craft**
sources are shown.

## Architecture

```
Discord user → /item <name> | /mob <name>
  → bot handler (interactions/lookupCommand.ts)
      → GET /api/v1/discord/items/lookup?q=<name>   (requireInternalBotAuth)
      → GET /api/v1/discord/mobs/lookup?q=<name>
          → discordLookupService (name resolution + card assembly)
      ← { match: CardData | null, suggestions: string[] }
  → render Components V2 card / "did you mean" card / not-found (discord/lookupCard.ts)
```

The bot never queries the DB directly; all data and fuzzy resolution live behind
the existing internal-bot-auth API surface, consistent with every other Discord
endpoint in `discord.ts`.

## Server side (`apps/api`)

### Endpoints (in `routes/discord.ts`)

Both behind `requireInternalBotAuth`, mirroring the existing `/wiki/search` shape.

```
GET /api/v1/discord/items/lookup?q=<name>
GET /api/v1/discord/mobs/lookup?q=<name>
```

Query schema: `{ q: z.string().trim().min(1).max(64) }.strict()` (64 = item/mob
name column width).

Response: `{ match: CardData | null, suggestions: string[] }` where `CardData`
is `ItemCardData` for the items endpoint and `MobCardData` for the mobs endpoint.
- `match` set when a confident match is found; `suggestions` empty.
- `match` null + `suggestions` non-empty → "did you mean" (up to 5 names).
- `match` null + `suggestions` empty → not found.

### Service: `services/discordLookupService.ts`

Two entry points: `lookupItemForDiscord(q)` and `lookupMobForDiscord(q)`.

**Name resolution (shared helper):**
1. Normalize query: lowercase, trim, collapse internal whitespace (reuse the
   normalization approach from `wikiSearch.ts`).
2. Load candidate names from the DB (`itemTemplate` / `mobTemplate`, `select` name + id + seasonId only).
3. **Exact normalized match** → resolve to that template → return as `match`.
4. Otherwise rank candidates: `startsWith` > `contains` > short edit-distance,
   take top 5 distinct names → return as `suggestions`.
5. No candidates above threshold → empty suggestions (not found).

**Season disambiguation.** Names are not unique and may repeat across seasons.
When a resolved name maps to multiple templates, pick one by priority:
**active season → base (`seasonId = null`) → most recent season**. Drops/zones
are aggregated only within the chosen template's `seasonId` scope (same-name rows
across zones still merge), so a seasonal variant's drops never bleed into the
base card. The active season is found with the existing
`prisma.season.findFirst({ where: { status: 'active' } })` pattern.

### `ItemCardData`

```ts
interface ItemCardData {
  name: string;
  itemType: string;          // weapon | armor | resource | consumable
  slot: string | null;
  tier: number;
  weightClass: string | null;
  setId: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;   // null = base/always-available
  stats: Array<{ key: string; value: number }>;  // non-zero baseStats entries, in ItemStats order
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;  // itemTemplateId resolved to name
    } | null;
  };
}
```

- `stats` derived from `baseStats` JSON via the `ItemStats` shape
  (`packages/shared/src/types/item.types.ts`), filtered to non-zero values.
- `drops`: query `DropTable` where `itemTemplateId` = resolved item, include
  `mobTemplate` + its `zone.name`; aggregate, sort by drop rate desc.
- `craft`: `CraftingRecipe` where `resultTemplateId` = resolved item; resolve
  `materials` JSON (`{ itemTemplateId, quantity }[]`) to names via a single
  `itemTemplate.findMany({ where: { id: { in } } })`.

### `MobCardData`

```ts
interface MobCardData {
  name: string;
  isBoss: boolean;
  season: { name: string } | null;
  zones: string[];                    // all zones a same-named mob spawns in
  flavorAppearance: string | null;    // flavor only — not a combat stat
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}
```

- `zones`: all `MobTemplate` rows sharing the resolved name (within season scope)
  → distinct `zone.name`. A single mob template has one zone, but same-named
  templates can span zones.
- `drops`: `DropTable` for the resolved mob template(s), include `itemTemplate`
  (name/itemType/tier); aggregate, sort by drop rate desc.

### Limits / safety

- `dropRatePct` = `round(dropChance * 10000) / 100` (matches `bestiary.ts`).
- Cap drops/zones lists rendered on the card (e.g. top 15 drops) to stay within
  the Components V2 4000-char text budget; note truncation in the card if capped.

## Bot side (`apps/discord-bot`)

### Command definitions (`commands/definitions.ts`)

```
/item  query:string (required)  — "Look up a Pocketrealm item."
/mob   query:string (required)  — "Look up a Pocketrealm creature."
```

### Routing (`interactions/interactionRouter.ts`)

Add `item` → `handleItemCommand`, `mob` → `handleMobCommand`.

### Handlers (`interactions/lookupCommand.ts`)

`handleItemCommand` / `handleMobCommand`:
1. Read `query` option, `deferReply({ ephemeral: false })`.
2. `api.get('/api/v1/discord/items/lookup?q=...')` (URL-encoded).
3. On API error → friendly retry message (via `statusCard`/`textCard`).
4. `match` → render card; `suggestions` → "did you mean" card; else → not-found.

Typed `Pick<PocketRealmApiClient, 'get'>` + `Pick<BotConfig, ...>` like
`wikiCommand.ts`. Response interfaces declared locally in the handler module.

### Card rendering (`discord/lookupCard.ts`) — Components V2

Reuse the shared `discord/v2Card.ts` helpers (`ContainerBuilder` + `TextDisplayBuilder`,
`V2CardPayload`) and `utils.ts` formatters; follow the `duelCard.ts` pattern.

- `buildItemCard(data)` — title `name` + tier/rarity accent color; sections:
  type/slot/weight, requirements (skill + level), stats list, sources (drops
  grouped with zone, craft with materials), flavor text, season label, sell price.
- `buildMobCard(data)` — title `name` (+ boss marker); sections: zones, drops,
  flavor appearance, season label.
- `buildSuggestionCard(query, suggestions, kind)` — "No exact match for *q*. Did
  you mean: …" list.
- Not-found uses `statusCard`/`textCard`.

Season label: when `season` is set, render e.g. `🗓️ Seasonal — <Season Name>`;
omit for base content. New emoji keys (`item`, `mob`) may be added to
`discord/emojis.ts`, or reuse `wiki`.

## Error handling

| Case | Behavior |
| --- | --- |
| API unreachable / 5xx | "Unable to look up … right now. Please try again later." |
| Match found | Render full Components V2 card |
| No match, suggestions | "Did you mean" card listing up to 5 names |
| No match, none | "No item/mob found for *q*." |

## Testing

**Server (`apps/api`)**
- `discordLookupService.test.ts`: exact match, fuzzy suggestions ranking,
  not-found, drop aggregation, craft material resolution, mob multi-zone
  aggregation, season disambiguation priority.
- `routes/discord.test.ts`: both endpoints — auth required, match shape,
  suggestion shape, query validation.

**Bot (`apps/discord-bot`)**
- `interactions/lookupCommand.test.ts`: match / suggestions / not-found / api-error
  for both commands; verifies `deferReply({ ephemeral: false })`.
- `discord/lookupCard.test.ts`: item card, mob card, suggestion card content;
  season label present/absent; truncation when capped.
- `interactions/interactionRouter.test.ts`: routes `item`/`mob`.
- `commands/definitions.test.ts`: both commands registered with required option.
- `architectureBoundaries.test.ts`: update if new modules cross a boundary.

## Out of scope / non-goals

- Shop as an item source (no `ItemTemplate`↔`ShopItem` link).
- Mob combat stats / action templates / boss rotation reveal.
- Discovery gating (no combat data is exposed, so none needed).
- Autocomplete on the `query` option (fuzzy "did you mean" covers typos).
- Item images / thumbnails (asset pipeline out of scope for this issue).
```
