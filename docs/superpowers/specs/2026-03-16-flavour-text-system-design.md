# Flavour Text System — Design Spec

## Overview

Integrate 77 overnight-generated lore files into the game, adding flavour text across items, mobs, zones, NPCs, and achievements. All lore content surfaces through existing UI panels and API responses — no new endpoints, no extra clicks.

## Decisions

- **All categories at once**, phased into 5 independent PRs
- **DB fields for items, mobs, zones** — embedded in existing API responses (no new endpoints)
- **TS constants for NPC dialogue and achievement flavour** — shipped with the client bundle
- **Bestiary progressive reveal** — appearance → behavior → lore, gated by kill count
- **NPC dialogue as inline speech bubbles** in existing shop/craft panels
- **Achievement descriptions replaced** with lore unlock text + expandable longer passage

## Data Model Changes

### ItemTemplate (Prisma migration)

Add one nullable field:

```prisma
flavorText String? @map("flavor_text") @db.Text
```

Seeded from ~15 item lore files (T1-T5 weapons, potions, gems, drops, trophies, backpacks, jewellery, soulbound gear, quest scrolls).

### MobTemplate (Prisma migration)

Add three nullable fields for progressive reveal:

```prisma
flavorAppearance String? @map("flavor_appearance") @db.Text
flavorBehavior   String? @map("flavor_behavior") @db.Text
flavorLore       String? @map("flavor_lore") @db.Text
```

Seeded from ~16 bestiary lore files.

### MobFamily (Prisma migration)

`MobFamily` already exists in the DB. Add one nullable field for the family overview text:

```prisma
flavorOverview String? @map("flavor_overview") @db.Text
```

Seeded from the "Family Overview" sections of bestiary lore files.

### Zone (Prisma migration)

`description` already exists. Add:

```prisma
arrivalText        String? @map("arrival_text") @db.Text
ambientTexts       Json?   @map("ambient_texts")    // { morning, afternoon, evening, night }
environmentalTexts Json?   @map("environmental_texts") // { "The Gate": "...", "The Tavern": "..." }
```

Seeded from ~11 zone lore files.

### Achievement (TS constants update)

Update `AchievementDef` in `achievementDefinitions.ts`:

- Replace `description` with the lore unlock text (short, 1-2 sentences)
- Add `flavorText?: string` for the longer italic passage (optional — not all achievements have lore files yet, so this avoids updating all ~80+ definitions at once)

### NPC Dialogue (new TS constants file)

New file: `packages/shared/src/constants/npcDialogue.ts`

```typescript
type DialogueEvent = 'greeting' | 'idle' | 'buy' | 'sell' | 'farewell';

interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Record<DialogueEvent, string[]>;
}

// Keyed by panel identifier matching existing UI panel names:
// 'millbrook-general-store', 'millbrook-blacksmith', 'millbrook-tavern',
// 'millbrook-herbalist', 'millbrook-quest-board', 'millbrook-gathering-guide',
// 'millbrook-casino', 'millbrook-guild-recruiter', 'thornwall-merchant',
// 'wandering-merchant', 'mysterious-stranger', 'town-guard'
const NPC_DIALOGUE: Record<string, NpcDialogue> = { ... };
```

Populated from ~10 NPC lore files.

## API Response Changes

No new endpoints. Lore fields are embedded in existing responses.

### Inventory / Shop endpoints

`ItemTemplate` fields are already included via Prisma `include: { template: true }`. The new `flavorText` column is returned automatically. No route changes.

### Bestiary endpoint

Replace hardcoded `"A creature found in ${zone}"` with progressive reveal logic:

Uses new constants in `BESTIARY_UNLOCK_CONSTANTS` (alongside existing `DISCOVERED_THRESHOLD`, `STATS_THRESHOLD`, `ROTATION_THRESHOLD`):

```typescript
FLAVOR_APPEARANCE_THRESHOLD: 1,   // kills to unlock appearance text
FLAVOR_BEHAVIOR_THRESHOLD: 10,    // kills to unlock behavior text
FLAVOR_LORE_THRESHOLD: 25,        // kills to unlock full lore text
```

- **≥ FLAVOR_APPEARANCE_THRESHOLD kills** → return `flavorAppearance`
- **≥ FLAVOR_BEHAVIOR_THRESHOLD kills** → return `flavorAppearance` + `flavorBehavior`
- **≥ FLAVOR_LORE_THRESHOLD kills** → return all three fields

Logic lives in a new `bestiaryService.ts` (extracted from the current inline route handler, following the project's service-layer convention). This also makes the progressive reveal logic unit-testable.

### Zone endpoints

Expand existing response to include `arrivalText`, `ambientTexts`, `environmentalTexts`. Note: the zone route at `apps/api/src/routes/zones.ts` maps Prisma results into an explicit response shape (not pass-through). The mapping code must be updated to include the three new fields.

### Achievements

No API change — TS constants shipped with client bundle.

## Frontend Changes

### Inventory tooltip / detail modal

Map `template.flavorText` to the existing description display area. Show as italic text below item stats. Already wired in `Inventory.tsx`.

### Bestiary monster detail

Replace hardcoded description with progressive fields:
- Each unlocked section labeled (Appearance / Behavior / Lore)
- Locked sections show greyed-out "???" to hint at undiscovered content
- Mob family overview text at the top of each family group

### Zone display

- **Arrival text**: brief overlay/toast on first zone discovery. On subsequent visits, show with a cooldown (e.g. once per session or once per hour) to avoid repetition
- **Ambient descriptions**: rotate in idle text area, random selection from the pool (no time-of-day system exists yet — defer time-based selection to a future feature; for now just pick randomly from all four entries)
- **Environmental flavour**: tooltips or detail text for sub-locations if UI supports it, otherwise deferred

### NPC speech bubble — `NpcDialogueBanner` component

New reusable component placed at top of existing shop/craft/sell panels:
- Shows NPC name + randomly selected line for current event
- **Greeting** on panel open
- **Idle** lines on ~15s timer
- **Buy/sell** on transaction confirmation
- **Farewell** on panel close
- Styled as speech bubble with NPC name label above

### Achievement panel

- Current `description` replaced with lore unlock text
- Expand/collapse toggle reveals the longer italic `flavorText` passage

## Seed Strategy

### DB-backed content

- Parse each lore markdown file's `## Content` section
- Match item/mob/zone names to existing DB records
- Idempotent upsert — safe to re-run
- Runs as part of `npm run db:seed`
- **Unmatched names log warnings** rather than failing (some lore may reference future content)

### TS constants

- Achievement flavour → update `achievementDefinitions.ts` directly
- NPC dialogue → new `npcDialogue.ts`
- Mob family overviews → seeded into `MobFamily.flavorOverview` DB field

## Phasing

Five independent phases, each a separate PR. No ordering dependencies — can be parallelized.

| Phase | Scope | DB Migration | Key Files |
|-------|-------|:---:|---|
| 1 | Items + Drops | Yes | Prisma schema, seed script, Inventory UI |
| 2 | Mobs + Bestiary | Yes | Prisma schema, seed script, bestiary route/service, Bestiary UI |
| 3 | Zones | Yes | Prisma schema, seed script, zone route, zone UI |
| 4 | NPC Dialogue | No | `npcDialogue.ts`, `NpcDialogueBanner` component, shop/craft panels |
| 5 | Achievements | No | `achievementDefinitions.ts`, Achievement UI panel |

## Testing

- **Phase 1**: Seed script maps all item lore to existing templates (log unmatched)
- **Phase 2**: Unit tests for progressive reveal logic (kill count thresholds); seed script coverage
- **Phase 3**: Seed script coverage; verify zone responses include new fields
- **Phase 4**: Unit tests for dialogue event selection and line rotation
- **Phase 5**: Verify achievement descriptions updated; expand/collapse UI works
- **All phases**: Visual review of UI components

## Lore Source Files

77 lore content files + 1 tracker in `docs/loop-v2/lore/` covering:
- Items (~15): T1-T5 weapons, potions, gems, drops, trophies, backpacks, jewellery, soulbound, quest scrolls
- Bestiary (~16): vermin, spiders, boars, wolves, bats, goblins, treants, spirits, fae, bandits, undead, etc.
- Zones (~11): Millbrook, Forest Edge, Deep Forest, Cave Entrance, Ancient Grove, Deep Mines, Whispering Plains, Thornwall, Haunted Marsh, Crystal Caverns, Sunken Ruins
- NPCs (~10): shopkeeper, blacksmith, tavern keeper, herbalist, guild recruiter, merchants, etc.
- Achievements (~13): combat, boss, PvP, exploration, crafting, gathering, bestiary, skills, general, secret, guild, casino
- Mob drops (~5): T1-T5 drop descriptions
