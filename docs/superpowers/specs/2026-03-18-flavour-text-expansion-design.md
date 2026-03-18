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
  condition: 'topZoneToday';
  zoneKeyword: string; // zone ID substring match, e.g. 'deep-forest'
  lines: string[];
}
```

**Activity tracker:** `apps/web/src/lib/activityTracker.ts`

```ts
function recordTurnsSpent(zoneId: string, count: number): void
// Increments sessionStorage key `turns-spent:{zoneId}` by count

function getTopZoneToday(): string | null
// Scans all `turns-spent:*` sessionStorage keys, returns zoneId with highest count
```

**Where to record:** `useGameController` — after processing exploration/combat/gathering results that include turn costs, call `recordTurnsSpent(currentZoneId, turnsUsed)`.

**Line selection priority:**
1. If `getTopZoneToday()` returns a zone, check `contextLines[event]` for a matching `zoneKeyword`
2. If match found, pick from context lines (with same no-repeat rotation)
3. If no match or no context lines defined, fall back to generic `lines[event]` pool

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

Add the 3 fields to the existing PATCH `/players/me/preferences` endpoint's Zod schema. They already come down with the player data fetch — no new endpoints needed.

**File:** `apps/api/src/routes/players.ts`

### 2c. Frontend Consumption

The player object is available via the game controller. Components check the relevant flag:

- **`NpcDialogueBanner`** — early return `null` if `!player.showNpcDialogue`
- **Inventory item tooltips** — skip rendering `flavorText` if `!player.showItemFlavourText`
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
| `apps/api/src/routes/players.ts` | Add 3 fields to preferences Zod schema |
| `apps/web/src/lib/npcLineRotation.ts` | **New** — no-repeat line selection with sessionStorage |
| `apps/web/src/lib/activityTracker.ts` | **New** — turns-per-zone tracking in sessionStorage |
| `apps/web/src/components/common/CollapsibleLoreSection.tsx` | **New** — reusable collapsible wrapper |
| `apps/web/src/components/common/NpcDialogueBanner.tsx` | Use rotation, respect preference, add collapsible |
| `apps/web/src/hooks/useNpcDialogue.ts` | Pass context to line selection |
| `apps/web/src/components/screens/ZoneMap.tsx` | Wrap zone text in collapsible |
| `apps/web/src/components/screens/Inventory.tsx` | Respect `showItemFlavourText` preference |
| `apps/web/src/components/screens/Bestiary.tsx` | Respect `showBestiaryLore` preference, add collapsible sections |
| `apps/web/src/components/screens/Settings.tsx` | Add "Lore & Flavour" toggle section |
| `apps/web/src/app/game/useGameController.ts` | Call `recordTurnsSpent()` after turn-consuming actions |
