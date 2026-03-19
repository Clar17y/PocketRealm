# NPC Dialogue: Zone-Aware NPCs, Missing Skills, Unwired Characters, and Item Flavour Text

Follow-up from #225 (flavour text expansion). Tracked in #231.

## Sub-projects

This design covers 4 independent sub-projects that can be implemented in parallel:

1. **NPC Wiring Fixes** - swap/add NPC banners to existing screens
2. **Zone-Aware NPC Selection** - crafting screens select NPCs based on player's current zone
3. **New NPC Dialogue Content** - 5 new NPCs (2 Millbrook, 3 Thornwall)
4. **Item Flavour Text** - ~244 missing items (armor, resources, consumables)

---

## Sub-project 1: NPC Wiring Fixes

### Changes

| Screen | Current | Change |
|--------|---------|--------|
| Quests (`Quests.tsx:473`) | `millbrook-general-store` (Bram) | Swap to `millbrook-quest-board` (Aldric) |
| Inventory (`Inventory.tsx`) | No NPC | Add Bram (`millbrook-general-store`), town-only, triggers on sell events |
| Guild create/join (`GuildScreen.tsx`) | Gavrik only on in-guild view | Add Gavrik banner to create/join flow too |
| Zone Map (`ZoneMap.tsx`) | No NPC | Add Captain Darrow (`town-guard`), town-only |
| Exploration flow | No NPC | Add Mysterious Stranger, low-chance random popup in wild zones only |
| CRAFTING_NPC_MAP (`Crafting.tsx:48`) | 4 entries | Add `leatherworking`, `tailoring`, `jewelcrafting`, `weaving`, `tanning` pointing to new NPCs |

### Town-only gating

Bram and Darrow banners should only render when `currentZoneId` resolves to a town zone (`zoneType === 'town'`). The Inventory and ZoneMap screens will need access to zone type info. The simplest approach is a prop like `isInTown: boolean` passed from `page.tsx`, which already knows `activeZoneId` and the zone list.

### Mysterious Stranger in exploration

The Stranger appears as a one-off dialogue line during exploration results, not as a persistent banner. Low probability (e.g., 5-10% per exploration batch). The frontend picks a random line from `mysterious-stranger.idle` and displays it inline in the exploration log. No new API work needed; this is a frontend-only presentation choice.

---

## Sub-project 2: Zone-Aware NPC Selection

### Problem

`CRAFTING_NPC_MAP` and the Forge screen hardcode Millbrook NPCs. A player crafting in Thornwall still sees Kessa.

### Scope

Only **crafting** screens are zone-aware (physically located workbenches). Gathering, casino, guild, quests, and inventory NPCs stay universal.

### Affected screens

- `Crafting.tsx` (uses `CRAFTING_NPC_MAP`)
- `Forge.tsx` (hardcoded `millbrook-blacksmith`)

### Data structure change

Replace the flat map with a zone-keyed lookup:

```typescript
// Before
const CRAFTING_NPC_MAP: Record<string, NpcKey> = {
  weaponsmithing: 'kessa-weaponsmithing',
  // ...
};

// After
const CRAFTING_NPC_MAP: Record<string, Record<string, NpcKey>> = {
  weaponsmithing: {
    millbrook: 'kessa-weaponsmithing',
    thornwall: 'thornwall-weaponsmithing',
  },
  armorsmithing: {
    millbrook: 'kessa-armorsmithing',
    thornwall: 'thornwall-armorsmithing',
  },
  refining: {
    millbrook: 'kessa-refining',
    thornwall: 'thornwall-refining',
  },
  alchemy: {
    millbrook: 'millbrook-herbalist',
    thornwall: 'thornwall-herbalist',   // or Thornwall artisan
  },
  leatherworking: {
    millbrook: 'millbrook-artisan-leatherworking',
    thornwall: 'thornwall-artisan-leatherworking',
  },
  tailoring: {
    millbrook: 'millbrook-artisan-tailoring',
    thornwall: 'thornwall-artisan-tailoring',
  },
  jewelcrafting: {
    millbrook: 'millbrook-jeweller',
    thornwall: 'thornwall-jeweller',
  },
  weaving: {
    millbrook: 'millbrook-artisan-weaving',
    thornwall: 'thornwall-artisan-weaving',
  },
  tanning: {
    millbrook: 'millbrook-artisan-tanning',
    thornwall: 'thornwall-artisan-tanning',
  },
};
```

### Lookup helper

```typescript
function getCraftingNpc(skillType: string, zoneId: string | null): NpcKey | undefined {
  const zoneMap = CRAFTING_NPC_MAP[skillType];
  if (!zoneMap) return undefined;
  // Try exact zone match, fall back to millbrook
  return zoneMap[zoneId ?? ''] ?? zoneMap['millbrook'];
}
```

### Props changes

- **Crafting.tsx**: Add `currentZoneId?: string | null` to `CraftingProps`. Already available in `page.tsx` as `activeZoneId`.
- **Forge.tsx**: Add `currentZoneId?: string | null` to `ForgeProps`. Use it to select between `millbrook-blacksmith` and `thornwall-blacksmith`.
- **page.tsx**: Pass `currentZoneId={activeZoneId}` to both Crafting and Forge (already passed to Gathering).

### Forge zone-aware logic

```typescript
// Before
<NpcDialogueBanner npcKey="millbrook-blacksmith" ... />

// After
const forgeNpcKey = currentZoneId === 'thornwall' ? 'thornwall-blacksmith' : 'millbrook-blacksmith';
<NpcDialogueBanner npcKey={forgeNpcKey} ... />
```

---

## Sub-project 3: New NPC Dialogue Content

### New Millbrook NPCs

**1. Millbrook Artisan** (leatherworking, tailoring, weaving, tanning)

- **Name**: TBD by content writer (e.g., "Nella Sable" or similar)
- **Location**: The Workshop, Crafting Quarter
- **Personality**: Practical, methodical, slightly fussy about material quality. Small-town crafter who knows her limits but takes pride in clean work.
- **NPC keys**: `millbrook-artisan-leatherworking`, `millbrook-artisan-tailoring`, `millbrook-artisan-weaving`, `millbrook-artisan-tanning`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8) per skill variant
- **Idle lines**: skill-specific. Leatherworking lines about hides and tanning. Tailoring about stitching and fit. Weaving about thread tension. Tanning about the process and smell.
- **Tone**: References Kessa as a colleague ("she handles the metal, I handle everything else"). Knows Rowan as the source of raw materials. Practical and warm.

**2. Millbrook Jeweller** (jewelcrafting)

- **Name**: TBD (e.g., "Orin Facet" or similar)
- **Location**: The Workshop, Crafting Quarter
- **Personality**: Precise, detail-oriented, slightly pretentious about the craft. Gentle rivalry with Kessa ("anyone can hit metal with a hammer; try setting a gem without cracking it").
- **NPC key**: `millbrook-jeweller`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8)
- **Idle lines**: gem cutting, settings, the difference between rough and cut stones, light refraction.
- **Tone**: Treats gems as art, not just gear stats. References mine locations and gem quality by zone.

### New Thornwall NPCs

All Thornwall NPCs share a tone: more seasoned, worldly, reference Millbrook as "that little town" or "the village." Match Lira Caravel's pragmatic voice.

**3. Thornwall Blacksmith** (weaponsmithing, armorsmithing, refining)

- **Name**: TBD (e.g., "Dorren Ashforge" or similar)
- **Location**: The Forge District, Thornwall
- **Personality**: Veteran smith who has worked with every material from copper to mithril. Respects Kessa's talent but considers Millbrook's forge limiting. Direct, confident, no-nonsense.
- **NPC keys**: `thornwall-weaponsmithing`, `thornwall-armorsmithing`, `thornwall-refining`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8) per skill variant
- **Tier-gating references**: Lines about working with dark iron, mithril, and ancient ore. "You will not find a forge hot enough for this back in that little town." References the Forge District's superior equipment.
- **Tone**: Mentions Kessa by name occasionally, respects her work but knows he handles the harder materials.

**4. Thornwall Artisan** (leatherworking, tailoring, weaving, tanning)

- **Name**: TBD
- **Location**: Thornwall Market District
- **Personality**: Works with exotic hides from Haunted Marsh (croc, cursed fabric) and Crystal Caverns (naga scale, ethereal cloth). More worldly than Millbrook counterpart.
- **NPC keys**: `thornwall-artisan-leatherworking`, `thornwall-artisan-tailoring`, `thornwall-artisan-weaving`, `thornwall-artisan-tanning`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8) per skill variant
- **Tone**: References dangerous sourcing, exotic materials, Thornwall as a frontier town.

**5. Thornwall Jeweller** (jewelcrafting)

- **Name**: TBD
- **Location**: Thornwall Market District
- **Personality**: Works with rarer gems (moonstone, starcrystal) sourced from Crystal Caverns and Sunken Ruins. More experienced than Millbrook counterpart.
- **NPC key**: `thornwall-jeweller`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8)
- **Tone**: References Crystal Caverns as primary source. Treats rare gems with appropriate reverence.

### Thornwall Forge NPC

**6. Thornwall Blacksmith (Forge screen)**

- Uses same NPC as Thornwall weaponsmithing blacksmith above
- **NPC key**: `thornwall-blacksmith`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8)
- **Content**: General forging lines, not skill-specific. References the Forge District, high-tier gear, mithril work.

### Thornwall Alchemy

- Thornwall needs an alchemy NPC for the crafting map
- Could be a new character or Vesper Tain could have a Thornwall outpost
- **Recommendation**: New NPC. Vesper is firmly a Millbrook character. Thornwall's alchemist should feel frontier-appropriate.
- **NPC key**: `thornwall-herbalist`
- **Dialogue events**: greeting (8), idle (8), buy (8), farewell (8)

### Total new dialogue content

- 5 new characters (2 Millbrook, 3 Thornwall) + 1 Thornwall Forge variant + 1 Thornwall Herbalist
- ~14 NPC key entries (skill variants)
- ~8 lines x 4 events x 14 entries = ~448 lines of dialogue

### Style rules

- No em-dashes. Use commas, semicolons, periods, or rewrite the sentence.
- Match existing tone and prose style (see `kessa-weaponsmithing` as reference).
- 1-4 sentences per line. Conversational, in-character.
- Reference other NPCs, zones, and materials naturally.
- Thornwall NPCs reference Millbrook dismissively but not cruelly.

---

## Sub-project 4: Item Flavour Text

### Scope

~244 items missing flavour text across armor, resources, and consumables.

### Armor (155 items)

**Structure: 5 tiers x 3 weight classes x 6 slots (helm, chest, legs, boots, gloves, belt)**

Note: Some chest pieces may already have text. The subagent should cross-reference `ITEM_FLAVOR_TEXT` before writing.

| Tier | Heavy | Medium | Light |
|------|-------|--------|-------|
| T1 | Copper | Boar Leather | Silk |
| T2 | Tin Plate | Wolf Leather | Woven |
| T3 | Iron | Warg Hide | Fae Silk |
| T4 | Dark Iron | Croc Scale | Cursed |
| T5 | Mithril | Naga Scale | Spectral |

**Approach: Per-set voice with slot variation.**

Each set (e.g., "Copper" heavy armor) gets a consistent theme. Individual slots get 1-2 sentence variations:
- **Helm**: visibility, protection, weight on the head
- **Chest**: core protection, fit, weight distribution
- **Legs/Greaves**: mobility, stride, knee protection
- **Boots**: footwork, terrain grip, comfort
- **Gloves/Gauntlets**: grip, dexterity, hand protection
- **Belt**: load bearing, posture, securing other pieces

**Tier tone progression:**
- T1 (Millbrook): humble, practical, "good enough for the Forest Edge"
- T2: more capable, references deeper zones
- T3: serious gear, Thornwall-tier, references dangerous materials
- T4: advanced, exotic materials from Haunted Marsh/Crystal Caverns
- T5: elite, rare materials, reverent tone, references Sunken Ruins/endgame

**Jewellery (9 items):** Copper Charm, Iron Chain, Iron Talisman, Dark Iron Amulet, Dark Iron Charm, Mithril Necklace, Mithril Talisman, Ancient Amulet, Ancient Charm. Follow existing jewellery style (see Copper Ring, Mithril Ring examples).

**Soulbound & Achievement items (~20 items):** Unique per-item text referencing the achievement or boss that drops them. Match existing soulbound/achievement style.

### Resources (85 items)

**Categories:**
- Raw ores (6): Tin Ore, Iron Ore, Sandstone, Dark Iron Ore, Mithril Ore, Ancient Ore
- Logs (7): Maple Log, Fungal Wood, Elderwood Log, Willow Log, Bogwood Log, Crystal Wood, Petrified Wood
- Herbs (8): Moonpetal, Cave Moss, Starbloom, Glowcap Mushroom, Windbloom, Gravemoss, Shimmer Fern, Abyssal Kelp
- Raw gems (3): Rough Emerald, Rough Diamond, Rough Opal
- Uncut gems (3): Raw Jade, Raw Moonstone, Raw Starcrystal
- Special gems (3): Crystal Bark, Heartwood Gem, Ancient Amber
- Cut gems (15): Cut Ruby through Cut Ancient Amber
- Ingots (7): Copper Ingot through Ancient Ingot
- Planks (8): Oak Plank through Petrified Plank
- Leather/cloth (15): Rat Leather through Spectral Fabric
- Mob drops (10): Bat Fang, Stolen Coin, Crude Gemstone, Rough Gem, etc.

**Approach:** Short, practical. 1-2 sentences. What it is, where it comes from, maybe an NPC reference. Resources are functional items; flavour text should be informative with personality, not elaborate.

**Tier-zone mapping for tone:**
- T1 (Forest Edge): copper, oak, forest sage, rat/boar materials
- T2 (Deep Forest/Cave Entrance): tin, maple, wolf/bat materials
- T3 (Ancient Grove/Deep Mines/Whispering Plains): iron, warg/fae materials
- T4 (Haunted Marsh/Crystal Caverns): dark iron, croc/cursed materials
- T5 (Sunken Ruins): mithril, ancient ore, naga/spectral materials

### Consumables (2-5 items)

- Focused Mana Potion, Greater Mana Potion, and any others missing
- Match Vesper Tain's voice and existing potion style

### Style rules

- No em-dashes. Use commas, semicolons, periods, or restructure.
- 1-4 sentences per item. Resources trend shorter (1-2), armor and special items trend longer (2-4).
- Reference NPCs (Kessa, Vesper, Rowan, Bram, Lira, new Thornwall NPCs) and zone names naturally.
- Plain text, no markdown.
- Higher tiers feel more impressive/serious. Lower tiers are humble/practical.

### File changes

All new entries added to `packages/database/prisma/seed-data/flavorText.ts` in the `ITEM_FLAVOR_TEXT` record, organized by section comments matching the existing pattern.

After adding, run `npm run db:seed` to populate the database.

---

## Implementation Notes

### Files touched per sub-project

**Sub-project 1 (Wiring):**
- `apps/web/src/components/screens/Quests.tsx` (swap NPC key)
- `apps/web/src/components/screens/Inventory.tsx` (add NPC banner, town-only)
- `apps/web/src/components/screens/GuildScreen.tsx` (add Gavrik to create/join)
- `apps/web/src/components/screens/ZoneMap.tsx` (add Darrow banner, town-only)
- `apps/web/src/app/game/page.tsx` (pass isInTown/currentZoneId props as needed)
- Exploration rendering component (add Stranger random line)

**Sub-project 2 (Zone-aware):**
- `apps/web/src/components/screens/Crafting.tsx` (refactor NPC map, add zone prop)
- `apps/web/src/components/screens/Forge.tsx` (add zone-aware NPC selection)
- `apps/web/src/app/game/page.tsx` (pass currentZoneId to Crafting and Forge)

**Sub-project 3 (NPC content):**
- `packages/shared/src/constants/npcDialogue.ts` (add ~14 new NPC entries)

**Sub-project 4 (Flavour text):**
- `packages/database/prisma/seed-data/flavorText.ts` (add ~244 entries)

### Dependencies between sub-projects

- Sub-project 1 depends on sub-project 3 for the new CRAFTING_NPC_MAP entries (leatherworking etc. need NPC keys to exist)
- Sub-project 2 depends on sub-project 3 for Thornwall NPC keys
- Sub-project 4 is fully independent

**Recommended execution:** Run sub-project 3 first (or in parallel with 4), then 1 and 2 after NPC keys exist.

### Testing

- Typecheck (`npm run typecheck`) after sub-projects 1 and 2
- Build shared package (`npm run build`) after sub-project 3 (npcDialogue.ts is in shared)
- Seed database (`npm run db:seed`) after sub-project 4
- Manual verification: visit each screen in both Millbrook and Thornwall
