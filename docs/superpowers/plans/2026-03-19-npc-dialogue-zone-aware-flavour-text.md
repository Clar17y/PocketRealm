# NPC Dialogue, Zone-Aware Selection & Item Flavour Text Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire unwired NPCs to screens, make crafting NPCs zone-aware, create 7 new NPC characters with ~480 dialogue lines, and write ~195 missing item flavour texts.

**Architecture:** 4 independent sub-projects with a dependency chain: content work (sub-projects 3 & 4) runs first in parallel, then the shared package is rebuilt, then wiring/zone-aware code (sub-projects 1 & 2) runs in parallel.

**Tech Stack:** Next.js (React/TSX), TypeScript, Prisma seed data

**Spec:** `docs/superpowers/specs/2026-03-19-npc-dialogue-zone-aware-flavour-text-design.md`

---

## Execution Order

```
Phase 1 (parallel):  Task 1 (NPC content)  |  Task 2 (Flavour text)
                            |
Phase 2 (sequential): Task 3 (Build shared package)
                            |
Phase 3 (parallel):  Task 4 (NPC wiring)   |  Task 5 (Zone-aware selection)
                            |
Phase 4 (sequential): Task 6 (Typecheck & verify)
```

---

## Task 1: New NPC Dialogue Content

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`

This task adds 7 new NPC characters with ~15 NPC key entries to the `NPC_DIALOGUE` record. Each entry follows the existing `NpcDialogue` interface:

```typescript
interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>;
  contextLines?: Partial<Record<DialogueEvent, ContextLine[]>>;
}
```

Each NPC key needs: `greeting` (8 lines), `idle` (8 lines), `buy` (8 lines), `farewell` (8 lines).

### Style rules
- No em-dashes anywhere. Use commas, semicolons, periods, or restructure sentences.
- 1-4 sentences per line. Conversational, in-character.
- Reference other NPCs, zones, and materials naturally.
- Use `kessa-weaponsmithing` as the reference example for tone and structure.
- Thornwall NPCs: more seasoned, worldly, reference Millbrook as "that little town" or "the village." Match Lira Caravel's pragmatic voice.

### New NPCs to create

**Millbrook Artisan** (fabric/hide crafts)
- Name the character (e.g., "Nella Sable" or similar fitting name)
- Location: The Workshop, Crafting Quarter
- Personality: Practical, methodical, slightly fussy about material quality. Small-town crafter who takes pride in clean work. References Kessa as a colleague ("she handles the metal, I handle everything else"). Knows Rowan as source of raw materials.
- Create 4 NPC key entries, each with skill-specific idle lines:
  - `millbrook-artisan-leatherworking` - idle lines about hides, leather working, tanning processes
  - `millbrook-artisan-tailoring` - idle lines about stitching, fit, fabric selection
  - `millbrook-artisan-weaving` - idle lines about thread tension, loom work, cloth quality
  - `millbrook-artisan-tanning` - idle lines about the tanning process, smell, curing time
- Greeting/buy/farewell lines can be shared across all 4 keys (same person, different context)

**Millbrook Jeweller** (jewelcrafting)
- Name the character (e.g., "Orin Facet" or similar)
- Location: The Workshop, Crafting Quarter
- Personality: Precise, detail-oriented, slightly pretentious. Gentle rivalry with Kessa ("anyone can hit metal with a hammer; try setting a gem without cracking it"). Treats gems as art, not just gear stats.
- Create 1 NPC key entry:
  - `millbrook-jeweller` - idle lines about gem cutting, settings, rough vs cut stones, light refraction

**Thornwall Blacksmith** (metalwork)
- Name the character (e.g., "Dorren Ashforge" or similar)
- Location: The Forge District, Thornwall
- Personality: Veteran smith, works with every material from copper to mithril. Respects Kessa but considers Millbrook's forge limiting. Direct, confident. References tier-gating: "You will not find a forge hot enough for this back in that little town."
- Create 4 NPC key entries:
  - `thornwall-blacksmith` - general forge lines (Forge screen), not skill-specific
  - `thornwall-weaponsmithing` - weapon-focused idle lines, references dark iron and mithril blades
  - `thornwall-armorsmithing` - armor-focused idle lines, references exotic materials
  - `thornwall-refining` - refining-focused idle lines, references processing high-tier ores

**Thornwall Artisan** (fabric/hide crafts)
- Name the character
- Location: Thornwall Market District
- Personality: Works with exotic hides from Haunted Marsh (croc, cursed fabric) and Crystal Caverns (naga scale, ethereal cloth). More worldly than Millbrook counterpart.
- Create 4 NPC key entries:
  - `thornwall-artisan-leatherworking`
  - `thornwall-artisan-tailoring`
  - `thornwall-artisan-weaving`
  - `thornwall-artisan-tanning`

**Thornwall Jeweller** (jewelcrafting)
- Name the character
- Location: Thornwall Market District
- Personality: Works with rarer gems (moonstone, starcrystal) from Crystal Caverns and Sunken Ruins. More experienced than Millbrook counterpart.
- Create 1 NPC key entry:
  - `thornwall-jeweller`

**Thornwall Herbalist** (alchemy)
- Name the character (not Vesper; she is firmly Millbrook)
- Location: Thornwall Market District
- Personality: Frontier alchemist working with exotic herbs from dangerous zones. Pragmatic, references Gravemoss, Shimmer Fern, Abyssal Kelp.
- Create 1 NPC key entry:
  - `thornwall-herbalist`

### Steps

- [ ] **Step 1: Read the existing npcDialogue.ts file**

Read `packages/shared/src/constants/npcDialogue.ts` to understand the current structure and entries.

- [ ] **Step 2: Add Millbrook Artisan entries**

Add the 4 `millbrook-artisan-*` entries to `NPC_DIALOGUE` in `packages/shared/src/constants/npcDialogue.ts`. Place them after the existing Kessa/Rowan entries. Each entry needs `name`, `location`, `personality`, and `lines` with `greeting` (8), `idle` (8), `buy` (8), `farewell` (8). The idle lines should be skill-specific; greeting/buy/farewell can share themes across the 4 keys.

- [ ] **Step 3: Add Millbrook Jeweller entry**

Add `millbrook-jeweller` entry. Same structure.

- [ ] **Step 4: Add Thornwall Blacksmith entries**

Add `thornwall-blacksmith`, `thornwall-weaponsmithing`, `thornwall-armorsmithing`, `thornwall-refining` entries. Tone: seasoned, references Millbrook's limitations, tier-gating dialogue about mithril/dark iron.

- [ ] **Step 5: Add Thornwall Artisan entries**

Add the 4 `thornwall-artisan-*` entries. Tone: worldly, exotic materials, frontier town.

- [ ] **Step 6: Add Thornwall Jeweller entry**

Add `thornwall-jeweller` entry. References Crystal Caverns, rare gems.

- [ ] **Step 7: Add Thornwall Herbalist entry**

Add `thornwall-herbalist` entry. Frontier alchemist voice.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors (the new entries just add to the existing `NPC_DIALOGUE` record).

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts
git commit -m "feat(lore): add 7 new NPCs with 15 dialogue entries for Millbrook and Thornwall (#231)"
```

---

## Task 2: Item Flavour Text

**Files:**
- Modify: `packages/database/prisma/seed-data/flavorText.ts`

Add ~195 missing flavour text entries to the `ITEM_FLAVOR_TEXT` record. Keys must match item names exactly (case-sensitive) as defined in `packages/database/prisma/seed-data/items.ts`.

### Pre-work

- [ ] **Step 1: Read existing flavour text and item definitions**

Read both files to cross-reference what already exists:
- `packages/database/prisma/seed-data/flavorText.ts` - existing entries
- `packages/database/prisma/seed-data/items.ts` - all item templates

Build a list of items that are MISSING from `ITEM_FLAVOR_TEXT`. Do NOT write duplicates for items that already have text.

### Style rules
- No em-dashes. Use commas, semicolons, periods, or restructure.
- Plain text, no markdown.
- Reference NPCs (Kessa, Vesper, Rowan, Bram, Lira, and the new Thornwall NPCs) and zone names naturally.
- Higher tiers feel more impressive/serious. Lower tiers are humble/practical.

### Armor (108 items)

Per-set voice with slot variation. Each set gets a consistent theme; individual slots get 1-2 sentence variations.

**Slot focus areas:**
- Helm: visibility, protection, weight on the head
- Chest: core protection, fit, weight distribution
- Legs/Greaves: mobility, stride, knee protection
- Boots: footwork, terrain grip, comfort
- Gloves/Gauntlets: grip, dexterity, hand protection
- Belt: load bearing, posture, securing other pieces

**Tier tone progression:**
- T1 (Copper/Boar Leather/Silk): humble, practical, "good enough for the Forest Edge"
- T2 (Tin Plate/Wolf Leather/Woven): more capable, references deeper zones
- T3 (Iron/Warg Hide/Fae Silk): serious gear, references dangerous materials
- T4 (Dark Iron/Croc Scale/Cursed): advanced, exotic materials from Haunted Marsh/Crystal Caverns
- T5 (Mithril/Naga Scale/Spectral): elite, rare materials, reverent tone, references Sunken Ruins/endgame

### Resources (85 items)

Short, practical. 1-2 sentences. What it is, where it comes from, maybe an NPC quip.

**Tier-zone mapping:**
- T1 (Forest Edge): copper, oak, forest sage, rat/boar materials
- T2 (Deep Forest/Cave Entrance): tin, maple, wolf/bat materials
- T3 (Ancient Grove/Deep Mines/Whispering Plains): iron, warg/fae materials
- T4 (Haunted Marsh/Crystal Caverns): dark iron, croc/cursed materials
- T5 (Sunken Ruins): mithril, ancient ore, naga/spectral materials

### Consumables (2-5 items)

Match Vesper Tain's voice and existing potion style.

### Jewellery & Special Items (~20-30 items)

Follow existing jewellery style (see Copper Ring, Mithril Ring as examples). Achievement/soulbound items get unique per-item text referencing the achievement or boss.

### Steps

- [ ] **Step 2: Write T1 armor flavour text (Copper, Boar Leather, Silk)**

Add entries for all T1 armor pieces missing from `ITEM_FLAVOR_TEXT`. Add them under a new section comment `// -- T1 Armor --` in `flavorText.ts`.

- [ ] **Step 3: Write T2 armor flavour text (Tin Plate, Wolf Leather, Woven)**

Add under `// -- T2 Armor --`.

- [ ] **Step 4: Write T3 armor flavour text (Iron, Warg Hide, Fae Silk)**

Add under `// -- T3 Armor --`.

- [ ] **Step 5: Write T4 armor flavour text (Dark Iron, Croc Scale, Cursed)**

Add under `// -- T4 Armor --`.

- [ ] **Step 6: Write T5 armor flavour text (Mithril, Naga Scale, Spectral)**

Add under `// -- T5 Armor --`.

- [ ] **Step 7: Write jewellery flavour text**

Add entries for missing jewellery items (Copper Charm, Iron Chain, Iron Talisman, Dark Iron Amulet, Dark Iron Charm, Mithril Necklace, Mithril Talisman, and any others missing). Add under `// -- Jewellery --` (extend existing section if present).

- [ ] **Step 8: Write soulbound & achievement item flavour text**

Add entries for any missing soulbound gear and achievement items. Check existing entries carefully before writing.

- [ ] **Step 9: Write resource flavour text (raw materials)**

Add entries for missing ores, logs, herbs, raw gems, uncut gems, special gems. Add under `// -- Resources (Raw) --`.

- [ ] **Step 10: Write resource flavour text (processed materials)**

Add entries for missing ingots, planks, leather, cloth, cut gems. Add under `// -- Resources (Processed) --`.

- [ ] **Step 11: Write resource flavour text (mob drops)**

Add entries for missing mob drop materials (Bat Fang, Stolen Coin, etc.). Add under `// -- Mob Drop Materials --`.

- [ ] **Step 12: Write consumable flavour text**

Add entries for missing potions (Focused Mana Potion, Greater Mana Potion, etc.). Add near existing potion section.

- [ ] **Step 13: Verify no duplicate keys**

Search `flavorText.ts` for any duplicate keys. Each item name should appear exactly once.

- [ ] **Step 14: Commit**

```bash
git add packages/database/prisma/seed-data/flavorText.ts
git commit -m "feat(lore): add ~195 item flavour texts for armor, resources, and consumables (#231)"
```

---

## Task 3: Build Shared Package

**Depends on:** Task 1 complete

This must run after Task 1 so that the new `NpcKey` union type includes the new keys. `NpcKey` is `keyof typeof NPC_DIALOGUE`, so adding entries to `NPC_DIALOGUE` automatically extends the type after rebuild.

- [ ] **Step 1: Build shared package**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 2: Verify new NpcKeys are available**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors. The new NPC keys (e.g., `thornwall-weaponsmithing`, `millbrook-jeweller`) are now part of the `NpcKey` type.

---

## Task 4: NPC Wiring Fixes

**Depends on:** Task 3 complete (new NpcKeys must be available)

**Files:**
- Modify: `apps/web/src/components/screens/Quests.tsx:473`
- Modify: `apps/web/src/components/screens/Inventory.tsx`
- Modify: `apps/web/src/components/guild/NoGuildView.tsx`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx`
- Modify: `apps/web/src/components/screens/ZoneMap.tsx`
- Modify: `apps/web/src/app/game/page.tsx`
- Modify: `apps/web/src/components/exploration/ExplorationPlayback.tsx`
- Modify: `apps/web/src/components/playback/TurnPlayback.tsx`
- Modify: `apps/web/src/components/screens/Exploration.tsx`

### Step-by-step

- [ ] **Step 1: Quests screen - swap Bram to Aldric**

In `apps/web/src/components/screens/Quests.tsx` line 473, change:
```typescript
// Before
<NpcDialogueBanner npcKey="millbrook-general-store" event={dialogueEvent} showDialogue={showNpcDialogue} />

// After
<NpcDialogueBanner npcKey="millbrook-quest-board" event={dialogueEvent} showDialogue={showNpcDialogue} />
```

- [ ] **Step 2: Inventory screen - add Bram (town-only)**

In `apps/web/src/components/screens/Inventory.tsx`:

Add imports at the top (near other imports):
```typescript
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
```

Inside the `Inventory` component function (after the existing state declarations around line 94), add:
```typescript
const { dialogueEvent, triggerDialogueEvent } = useNpcDialogue();
```

Wire `triggerDialogueEvent('sell')` into the sell action handler. Find where sell is executed (the `runItemAction` function around line 183-188) and add:
```typescript
// Inside the sell branch of runItemAction:
else if (type === 'sell' && onSell) { triggerDialogueEvent('sell'); await onSell(itemId); }
```

Add the NPC banner in the return JSX, right after `<ScreenContainer>` and before the header div (around line 256):
```tsx
{isInTown && <NpcDialogueBanner npcKey="millbrook-general-store" event={dialogueEvent} showDialogue={true} />}
```

Note: `isInTown` is already available as a prop (line 64).

- [ ] **Step 3: Guild NoGuildView - add Gavrik banner**

In `apps/web/src/components/guild/NoGuildView.tsx`:

Add imports:
```typescript
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
```

Add `showNpcDialogue?: boolean` to `NoGuildViewProps` interface (line 17-22).

Inside the component function, add:
```typescript
const { dialogueEvent } = useNpcDialogue();
```

Add the banner at the start of the return JSX (line 68), inside the `<div className="space-y-4">`:
```tsx
<NpcDialogueBanner npcKey="millbrook-guild-recruiter" event={dialogueEvent} showDialogue={showNpcDialogue ?? true} />
```

In `apps/web/src/components/screens/GuildScreen.tsx`, pass `showNpcDialogue` to `NoGuildView` in the `!guildData` branch (around line 93-100):
```tsx
<NoGuildView
  playerId={playerId}
  characterLevel={characterLevel}
  error={guildError}
  onGuildJoined={refreshGuild}
  showNpcDialogue={showNpcDialogue}
/>
```

- [ ] **Step 4: ZoneMap - add Captain Darrow (town-only)**

In `apps/web/src/components/screens/ZoneMap.tsx`:

Add imports:
```typescript
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
```

Add `showNpcDialogue?: boolean` to `ZoneMapProps`, after the last existing prop (around line 79, after `onSetHomeTown`).

Inside the `ZoneMap` component, add:
```typescript
const { dialogueEvent } = useNpcDialogue();
const isInTown = zones.find(z => z.id === currentZoneId)?.zoneType === 'town';
```

Add the banner in the return JSX, at the top of the rendered content:
```tsx
{isInTown && <NpcDialogueBanner npcKey="town-guard" event={dialogueEvent} showDialogue={showNpcDialogue ?? true} />}
```

In `apps/web/src/app/game/page.tsx`, pass `showNpcDialogue` to the `<ZoneMap>` call (around line 720-760):
```tsx
showNpcDialogue={showNpcDialogue}
```

- [ ] **Step 5: ExplorationPlayback - add Mysterious Stranger**

The component chain is: `page.tsx` -> `Exploration.tsx` -> `TurnPlayback.tsx` -> `ExplorationPlayback.tsx`. The stranger line must be threaded through all three layers.

**5a. Add prop to `ExplorationPlaybackProps`** in `apps/web/src/components/exploration/ExplorationPlayback.tsx` (line 15-27):
```typescript
strangerLine?: string | null;
```

In the component, after all events have played back (near the completion/summary area), render the stranger line if present:
```tsx
{strangerLine && (
  <div className="flex items-start gap-2 text-sm animate-fade-in mt-2">
    <span className="text-[var(--rpg-purple)]">&#x1F441;</span>
    <span className="italic text-[var(--rpg-purple)]">{strangerLine}</span>
  </div>
)}
```

**5b. Thread through `TurnPlaybackProps`** in `apps/web/src/components/playback/TurnPlayback.tsx`:

Add `strangerLine?: string | null;` to `TurnPlaybackProps` (after `embedded?: boolean;` around line 46).

Destructure it in the component function (line 49-70).

Pass it to the `<ExplorationPlayback>` call (around line 200-212):
```tsx
<ExplorationPlayback
  // ... existing props ...
  strangerLine={strangerLine}
/>
```

**5c. Compute the stranger line** in `apps/web/src/components/screens/Exploration.tsx`:

Add import:
```typescript
import { getNpcLine } from '@pocketrealm/shared';
```

Compute the line using a ref (not useMemo, to avoid impure memo):
```typescript
const strangerLineRef = useRef<string | null>(null);

// Roll once when new playback data arrives
useEffect(() => {
  if (playbackData) {
    strangerLineRef.current = Math.random() < 0.05
      ? getNpcLine('mysterious-stranger', 'idle')
      : null;
  }
}, [playbackData]);
```

Pass to `<TurnPlayback>`:
```tsx
<TurnPlayback
  // ... existing props ...
  strangerLine={strangerLineRef.current}
/>
```

**Note:** The CRAFTING_NPC_MAP changes (adding leatherworking, tailoring, jewelcrafting, weaving, tanning) are handled entirely in Task 5 (zone-aware refactor), which replaces the flat map with a zone-keyed nested map. Do NOT modify CRAFTING_NPC_MAP in this task to avoid merge conflicts.

- [ ] **Step 6: Verify compilation**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/screens/Quests.tsx \
        apps/web/src/components/screens/Inventory.tsx \
        apps/web/src/components/guild/NoGuildView.tsx \
        apps/web/src/components/screens/GuildScreen.tsx \
        apps/web/src/components/screens/ZoneMap.tsx \
        apps/web/src/components/exploration/ExplorationPlayback.tsx \
        apps/web/src/components/playback/TurnPlayback.tsx \
        apps/web/src/components/screens/Exploration.tsx \
        apps/web/src/app/game/page.tsx
git commit -m "feat: wire NPCs to Quests, Inventory, Guild, ZoneMap, Exploration screens (#231)"
```

---

## Task 5: Zone-Aware NPC Selection

**Depends on:** Task 3 complete (new NpcKeys must be available)

**Files:**
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Forge.tsx`
- Modify: `apps/web/src/app/game/page.tsx`

### Step-by-step

- [ ] **Step 1: Refactor CRAFTING_NPC_MAP to zone-aware nested map**

In `apps/web/src/components/screens/Crafting.tsx`, replace lines 48-53:

```typescript
import type { NpcKey } from '@pocketrealm/shared';

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
    thornwall: 'thornwall-herbalist',
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

function getCraftingNpc(skillType: string, zoneName: string | null): NpcKey | undefined {
  const zoneMap = CRAFTING_NPC_MAP[skillType];
  if (!zoneMap) return undefined;
  const key = (zoneName ?? '').toLowerCase();
  return zoneMap[key] ?? zoneMap['millbrook'];
}
```

- [ ] **Step 2: Update NPC lookup in Crafting component**

In `Crafting.tsx`, update line 80 (the npcKey assignment):

```typescript
// Before
const npcKey = skillType ? CRAFTING_NPC_MAP[skillType] : undefined;

// After
const npcKey = skillType ? getCraftingNpc(skillType, zoneName) : undefined;
```

`zoneName` is already available as a prop (`CraftingProps.zoneName`, line 66).

- [ ] **Step 3: Add zoneName prop to Forge**

In `apps/web/src/components/screens/Forge.tsx`:

Add `zoneName?: string | null;` to `ForgeProps` interface, after the existing `zoneCraftingLevel: number | null;` line (around line 120):
```typescript
  zoneCraftingLevel: number | null;
  zoneName?: string | null;
  guildTaxRate?: number;
```

Add `zoneName` to the destructured params in the `Forge` function (around line 138-148). Find `zoneCraftingLevel,` and add `zoneName,` after it:
```typescript
  isRecovering = false, recoveryCost, zoneCraftingLevel, zoneName,
```

- [ ] **Step 4: Update Forge NPC banner to be zone-aware**

In `Forge.tsx`, replace line 275:

```typescript
// Before
<NpcDialogueBanner npcKey="millbrook-blacksmith" event={dialogueEvent} showDialogue={showNpcDialogue} />

// After
const forgeNpcKey: NpcKey = zoneName?.toLowerCase() === 'thornwall' ? 'thornwall-blacksmith' : 'millbrook-blacksmith';
// ... later in JSX:
<NpcDialogueBanner npcKey={forgeNpcKey} event={dialogueEvent} showDialogue={showNpcDialogue} />
```

Note: Declare `forgeNpcKey` inside the component body (e.g., after `const bonusEntries = ...` around line 270), then use it in the JSX.

- [ ] **Step 5: Pass zoneName to Forge from page.tsx**

In `apps/web/src/app/game/page.tsx`, add `zoneName` to the `<Forge>` component call (around line 872-909):

```tsx
<Forge
  items={...}
  // ... existing props ...
  zoneCraftingLevel={zoneCraftingLevel}
  zoneName={zoneCraftingName}          // <-- ADD THIS
  guildTaxRate={guildTaxRate}
  // ... rest of props ...
/>
```

`zoneCraftingName` is already available in scope (used at line 861 for Crafting).

- [ ] **Step 6: Verify compilation**

Run: `npm run typecheck`
Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/screens/Crafting.tsx \
        apps/web/src/components/screens/Forge.tsx \
        apps/web/src/app/game/page.tsx
git commit -m "feat: zone-aware NPC selection for crafting and forge screens (#231)"
```

---

## Task 6: Final Verification

**Depends on:** Tasks 4 and 5 complete

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: No errors (the pre-existing `page.tsx:333` SkillType error is acceptable).

- [ ] **Step 2: Run game engine tests**

Run: `npm run test:engine`
Expected: All pass (no game-engine changes in this PR).

- [ ] **Step 3: Run API tests**

Run: `npm run test:api`
Expected: All pass (no API changes in this PR).

- [ ] **Step 4: Build everything**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Final commit if any fixups needed**

Only if previous steps revealed issues.
