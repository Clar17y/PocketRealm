# Flavour Text Expansion — Design Spec

**Issue:** #225
**Date:** 2026-03-18
**Branch:** `flavour-text-expansion`
**Base:** `flavour-text-system` (merged) → `main`

## Overview

Three areas of improvement to the existing flavour text system:

1. **Volume** — Expand NPC dialogue from 2-4 lines per event to 8-12, with no-repeat rotation and context-aware lines
2. **Player control** — Three independent settings toggles to disable NPC dialogue, item flavour text, and bestiary lore
3. **Mobile UX** — Collapsible lore sections that default to collapsed on all viewports, with per-session persistence

## 1. NPC Dialogue Expansion

### 1a. More Lines

Scale every NPC from 2-4 lines per event type to 8-12 lines. Maintain each NPC's established personality:

- **Bram Holloway** (general store): dry humour, practical, unhurried
- **Kessa Ironweld** (blacksmith): direct, proud, perpetually overheated
- **Maren Ashwick** (tavern): warm, gossipy, knows everyone's business
- **Vesper Tain** (herbalist): mystical, slightly unsettling, poetic
- **Aldric Voss** (quest board): bureaucratic, long-suffering, dry
- **Rowan Delk** (gathering guide): outdoorsy, patient, earnest
- **Silas Vane** (casino): smooth, charismatic, always calculating odds
- **Gavrik Stoneshoulder** (guild): gruff, loyal, military bearing
- **Lira Caravel** (Thornwall merchant): worldly, sharp, slightly haughty
- **Vex** (wandering merchant): enigmatic, playful, unreliable
- **Mysterious Stranger**: cryptic, ominous, sparse
- **Captain Fen Darrow** (town guard): authoritative, protective, weary
- **Skill variants** (kessa-weaponsmithing, kessa-armorsmithing, kessa-refining, rowan-mining, rowan-woodcutting, rowan-foraging): same personality, skill-specific subject matter

No structural changes to `NPC_DIALOGUE` type — just more strings in each array.

**File:** `packages/shared/src/constants/npcDialogue.ts`

### 1b. No-Repeat Rotation

Current `getNpcLine()` uses pure `Math.random()`, causing frequent repeats with small pools. Replace with session-scoped rotation.

**New utility:** `apps/web/src/lib/npcLineRotation.ts`

```ts
function getNextNpcLine(npcKey: NpcKey, event: DialogueEvent): string | null
```

Algorithm:
1. Read shown indices from `sessionStorage` key `npc-lines-shown:{npcKey}:{event}` (JSON array of integers)
2. Get full line array from `NPC_DIALOGUE[npcKey].lines[event]`
3. Filter out already-shown indices
4. If all shown, reset tracker (clear the key) and pick from full pool
5. Pick random index from remaining, append to shown list, save back to `sessionStorage`
6. Return the line

The shared `getNpcLine()` function stays unchanged for backward compatibility and tests. The rotation wrapper is frontend-only.

**Integration:** `NpcDialogueBanner.tsx` switches from calling `getNpcLine` to `getNextNpcLine`.

### 1c. Context-Aware Lines

NPC lines that reference the player's recent activity. Heuristic: **zone where the player spent the most turns this session** (not last-visited zone, which is always Forest Edge when returning to Millbrook).

**Data structure addition to `NpcDialogue` interface:**

```ts
export interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>;
  contextLines?: Partial<Record<DialogueEvent, ContextLine[]>>;
}

export interface ContextLine {
  zoneKeyword: string; // zone ID substring match, e.g. 'deep-forest'
  lines: string[];
}
```

**Activity tracker:** `apps/web/src/lib/activityTracker.ts`

```ts
function recordTurnsSpent(zoneId: string, count: number): void
// Increments sessionStorage key `turns-spent:{zoneId}` by count

function getTopZoneToday(): string | null
// Iterates sessionStorage.key(i) for all keys, filters by `turns-spent:` prefix,
// returns the zoneId with the highest count. Lightweight — bounded by zone count (~15-20).
```

**Alternative considered:** storing all zone counts in a single JSON object key (`activity-turns-by-zone`) to avoid iteration. Rejected — the iteration is cheap and separate keys are simpler to update atomically.

**Where to record:** `useGameController` — after processing exploration/combat/gathering results that include turn costs, call `recordTurnsSpent(currentZoneId, turnsUsed)`.

**Line selection priority:**
1. If `getTopZoneToday()` returns a zone, check `contextLines[event]` for entries whose `zoneKeyword` is a substring of the zone ID
2. If match found, pick from that entry's lines (with same no-repeat rotation)
3. If no match or no context lines defined, fall back to generic `lines[event]` pool

**Idle rotation:** The idle interval timer in `NpcDialogueBanner` also uses `getNextNpcLine` (which calls `getTopZoneToday()` on each rotation). This is fine — `getTopZoneToday()` scans ~15-20 sessionStorage keys synchronously, negligible cost.

**Session boundary:** Counters live in `sessionStorage` — reset on tab close. No date checking needed.

## 2. Settings Toggles

### 2a. Database Schema

Three new boolean fields on the `Player` model:

```prisma
showNpcDialogue      Boolean @default(true) @map("show_npc_dialogue")
showItemFlavourText  Boolean @default(true) @map("show_item_flavour_text")
showBestiaryLore     Boolean @default(true) @map("show_bestiary_lore")
```

**File:** `packages/database/prisma/schema.prisma` — add to the Preferences section (after `forgeConfirmRarity`, before notification preferences)

### 2b. API Changes

**File:** `apps/api/src/routes/player.ts`

The GET `/api/v1/player` route uses an explicit `select` clause (lines 31-63) that enumerates every field. New columns do NOT appear automatically. Three places to update:

1. **`SETTINGS_FIELDS` array** (line 144) — add the 3 new field names
2. **`settingsSchema` Zod object** (line 155) — add `showNpcDialogue: z.boolean().optional()`, etc.
3. **GET `/api/v1/player` select clause** (line 31) — add the 3 fields so they're returned on login

**Migration:** A Prisma migration will be generated via `npm run db:migrate` — `packages/database/prisma/migrations/<timestamp>_add_flavour_text_preferences/migration.sql`

### 2c. Frontend Consumption

The player object is available via the game controller. Components check the relevant flag:

- **`NpcDialogueBanner`** — add a `showDialogue?: boolean` prop (defaults to `true`). Early return `null` if `false`. Each call site passes `player.showNpcDialogue` from the game controller. The banner is used in 6+ panels so a prop is cleaner than importing player state into the banner itself.
- **Item flavour text** — in `apps/web/src/app/game/page.tsx` (line 587), the data mapping sets `description: item.template.flavorText || item.template.itemType`. When `showItemFlavourText` is false, always use `item.template.itemType` instead.
- **Bestiary detail** — hide progressive appearance/behaviour/lore sections if `!player.showBestiaryLore`, show original one-line description instead

### 2d. Settings UI

Add a **"Lore & Flavour"** section in the existing settings panel with three toggle switches. Same visual pattern as the existing notification toggle section.

**Toggles:**
- "NPC Dialogue" — show/hide NPC speech bubbles on panels
- "Item Flavour Text" — show/hide italic lore in inventory tooltips
- "Bestiary Lore" — show/hide progressive flavour sections in bestiary detail

**Behaviour when off:**
- NPC banner doesn't render (no empty space)
- Item tooltip shows stats only
- Bestiary shows original one-line description

## 3. Collapsible Lore Sections

### 3a. Reusable Component

**New component:** `apps/web/src/components/common/CollapsibleLoreSection.tsx`

Props:
- `title: string` — header text
- `storageKey: string` — unique key for `sessionStorage` persistence
- `children: ReactNode` — collapsible content
- `defaultExpanded?: boolean` — defaults to `false` (collapsed)

Behaviour:
- Clickable header row: title + chevron icon (rotates on toggle)
- Reads `sessionStorage` key `lore-collapsed:{storageKey}` on mount
- If no stored value, uses `defaultExpanded` (false = collapsed)
- Smooth CSS transition on max-height for expand/collapse animation
- Writes toggle state back to `sessionStorage` on every toggle
- ARIA attributes: `aria-expanded` on header, `aria-controls` pointing to content ID, `role="button"` on clickable header

### 3b. Where Applied

1. **Zone description** in `ZoneMap.tsx` — wraps zone arrival/ambient text. `storageKey: "zone-description"`
2. **NPC dialogue banner** — tap NPC name row to toggle speech body. Collapsed shows NPC name + "..." indicator. `storageKey: "npc-banner:{npcKey}"`
3. **Bestiary lore sections** — each progressive section (appearance/behaviour/lore) individually collapsible. `storageKey: "bestiary-lore:{mobId}:{section}"`

### 3c. Default State

**All sections default to collapsed on all viewports.** Even large phones have limited screen real estate and the flavour text can push actionable content below the fold. Users tap to expand if they want to read.

### 3d. Interaction With Settings Toggles

- If a settings toggle is OFF, the component doesn't render at all (no collapsible shell, just absent)
- Collapsible behaviour only applies when the toggle is ON — it controls visibility within the enabled state

## 4. Testing Strategy

### Unit Tests
- `npcLineRotation.ts` — verify no-repeat-until-exhausted cycle, verify reset after all shown
- `activityTracker.ts` — verify turn accumulation, verify `getTopZoneToday()` returns correct zone
- Context-aware line selection — verify fallback to generic when no context match

### Component Tests
- `CollapsibleLoreSection` — verify expand/collapse toggle, verify `sessionStorage` persistence
- `NpcDialogueBanner` — verify it respects `showNpcDialogue` preference, verify collapsed state

### Integration
- Settings toggles — verify PATCH endpoint accepts new fields, verify UI reflects saved state
- Bestiary/Inventory — verify flavour text hidden when toggle off

## 5. Files Changed Summary

| File | Change |
|------|--------|
| `packages/shared/src/constants/npcDialogue.ts` | Expand to 8-12 lines per event, add `contextLines` interface + data |
| `packages/database/prisma/schema.prisma` | Add 3 boolean preference fields |
| `packages/database/prisma/migrations/...` | **Generated** — migration for 3 new columns |
| `apps/api/src/routes/player.ts` | Add 3 fields to `SETTINGS_FIELDS`, `settingsSchema`, and GET select clause |
| `apps/web/src/lib/npcLineRotation.ts` | **New** — no-repeat line selection with sessionStorage |
| `apps/web/src/lib/activityTracker.ts` | **New** — turns-per-zone tracking in sessionStorage |
| `apps/web/src/components/common/CollapsibleLoreSection.tsx` | **New** — reusable collapsible wrapper with ARIA attributes (`aria-expanded`, `aria-controls`) |
| `apps/web/src/components/common/NpcDialogueBanner.tsx` | Use rotation, add `showDialogue` prop, add collapsible |
| `apps/web/src/components/screens/ZoneMap.tsx` | Wrap zone text in collapsible |
| `apps/web/src/app/game/page.tsx` | Respect `showItemFlavourText` in item description mapping |
| `apps/web/src/components/screens/Bestiary.tsx` | Respect `showBestiaryLore` preference, add collapsible sections |
| `apps/web/src/components/screens/Settings.tsx` | Add "Lore & Flavour" toggle section |
| `apps/web/src/app/game/useGameController.ts` | Call `recordTurnsSpent()` after turn-consuming actions |
