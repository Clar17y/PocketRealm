# Flavour Text Expansion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand NPC dialogue to 8-12 lines with no-repeat rotation and context-aware lines, add settings toggles to disable flavour text, and make lore sections collapsible.

**Architecture:** All-client-side approach. Rotation state, context tracking, and collapsible state persist in sessionStorage. Only the three settings toggles touch the server (3 new Player boolean fields). New frontend utilities handle line selection and activity tracking. A reusable `CollapsibleLoreSection` component wraps all lore text.

**Tech Stack:** TypeScript, React, Prisma, Zod, sessionStorage, Vitest

**Spec:** `docs/superpowers/specs/2026-03-18-flavour-text-expansion-design.md`

---

## Chunk 1: Backend — Settings Toggles

### Task 1: Database Schema + Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:56` (after `forgeConfirmRarity`)
- Create: `packages/database/prisma/migrations/<timestamp>_add_flavour_text_preferences/migration.sql` (generated)

- [ ] **Step 1: Add 3 boolean fields to Player model**

In `packages/database/prisma/schema.prisma`, after `forgeConfirmRarity` (line 56), add:

```prisma
  // Flavour text preferences
  showNpcDialogue      Boolean @default(true) @map("show_npc_dialogue")
  showItemFlavourText  Boolean @default(true) @map("show_item_flavour_text")
  showBestiaryLore     Boolean @default(true) @map("show_bestiary_lore")
```

- [ ] **Step 2: Generate Prisma client + migration**

Run from worktree root:
```bash
npm run db:generate
npm run db:migrate -- --name add_flavour_text_preferences
```
Expected: Migration created, Prisma client regenerated with new fields.

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add flavour text preference fields to Player model"
```

---

### Task 2: API — Settings Endpoint Updates

**Files:**
- Modify: `apps/api/src/routes/player.ts:31-63` (GET select clause), `:144-151` (SETTINGS_FIELDS), `:155-174` (settingsSchema)
- Modify: `apps/api/src/routes/player.settings.test.ts:7-19` (duplicate schema)

**Important:** The test file `player.settings.test.ts` has its own **duplicate copy** of the settingsSchema (lines 7-19) — it does NOT import from `player.ts`. Both the real schema and the test's copy must be updated.

- [ ] **Step 1: Update the test file's duplicate schema + add new test**

In `apps/api/src/routes/player.settings.test.ts`, add the 3 new fields to the local `settingsSchema` (lines 7-19):

```typescript
const settingsSchema = z.object({
  combatLogSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  explorationSpeedMs: z.number().int().min(100).max(1000).refine(v => v % 100 === 0, { message: 'Must be a multiple of 100' }).optional(),
  autoSkipKnownCombat: z.boolean().optional(),
  defaultExploreTurns: z.number().int().min(100).max(2500).refine(v => v % 10 === 0, { message: 'Must be a multiple of 10' }).optional(),
  quickRestHealPercent: z.number().int().min(25).max(100).refine(v => v % 25 === 0, { message: 'Must be a multiple of 25' }).optional(),
  defaultRefiningMax: z.boolean().optional(),
  lowHpWarning: z.boolean().optional(),
  confirmRarity: z.enum(RARITY_ENUM).optional(),
  lootRevealRarity: z.enum(RARITY_ENUM).optional(),
  forgeConfirmRarity: z.enum(RARITY_ENUM).optional(),
  homeTownId: z.string().uuid().optional(),
  showNpcDialogue: z.boolean().optional(),
  showItemFlavourText: z.boolean().optional(),
  showBestiaryLore: z.boolean().optional(),
}).refine(data => Object.values(data).some(v => v !== undefined), { message: 'At least one setting required' });
```

Then add after the existing boolean settings test (around line 62):

```typescript
    it('accepts flavour text toggle settings', () => {
      expect(() => settingsSchema.parse({ showNpcDialogue: false })).not.toThrow();
      expect(() => settingsSchema.parse({ showItemFlavourText: true })).not.toThrow();
      expect(() => settingsSchema.parse({ showBestiaryLore: false })).not.toThrow();
    });
```

- [ ] **Step 2: Run test to verify it passes (schema already updated)**

```bash
npm run test:api -- --run player.settings
```
Expected: PASS — the local schema now includes the new fields.

- [ ] **Step 3: Update SETTINGS_FIELDS array in player.ts**

In `apps/api/src/routes/player.ts`, add to `SETTINGS_FIELDS` (line 144-151):

```typescript
const SETTINGS_FIELDS = [
  'combatLogSpeedMs', 'explorationSpeedMs',
  'autoSkipKnownCombat', 'defaultExploreTurns', 'quickRestHealPercent', 'defaultRefiningMax',
  'lowHpWarning', 'confirmRarity', 'lootRevealRarity', 'forgeConfirmRarity',
  'homeTownId',
  'showNpcDialogue', 'showItemFlavourText', 'showBestiaryLore',
  'notifyPvpAttack', 'notifyPvpScout', 'notifyBossAppeared', 'notifyBossKilled',
  'notifyTurnBankFull', 'notifyExpeditionStarted', 'notifyExpeditionFinished',
] as const;
```

- [ ] **Step 4: Update settingsSchema Zod object in player.ts**

In `apps/api/src/routes/player.ts`, add to `settingsSchema` (before the `.refine` at line 174):

```typescript
  showNpcDialogue: z.boolean().optional(),
  showItemFlavourText: z.boolean().optional(),
  showBestiaryLore: z.boolean().optional(),
```

- [ ] **Step 5: Update GET select clause in player.ts**

In `apps/api/src/routes/player.ts`, add to the GET `/` select clause (after `forgeConfirmRarity: true` at line 52):

```typescript
      showNpcDialogue: true,
      showItemFlavourText: true,
      showBestiaryLore: true,
```

- [ ] **Step 6: Build API to verify types**

```bash
npm run build:api
```
Expected: Clean build, no type errors.

- [ ] **Step 7: Run tests**

```bash
npm run test:api -- --run player.settings
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/player.ts apps/api/src/routes/player.settings.test.ts
git commit -m "feat(api): add flavour text preference toggles to player settings"
```

---

## Chunk 2: Shared Types + Frontend Utilities

### Task 3: Add contextLines to NPC Dialogue Types

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts:8-13` (NpcDialogue interface)
- Modify: `packages/shared/src/constants/__tests__/npcDialogue.test.ts`

**Must come before Task 4** — the rotation utility references `npc.contextLines` which requires the type to exist.

- [ ] **Step 1: Write failing test for contextLines type**

In `packages/shared/src/constants/__tests__/npcDialogue.test.ts`, add:

```typescript
describe('contextLines', () => {
  it('NPCs with contextLines have valid structure', () => {
    for (const [key, npc] of Object.entries(NPC_DIALOGUE)) {
      if (!npc.contextLines) continue;
      for (const [event, contextEntries] of Object.entries(npc.contextLines)) {
        for (const entry of contextEntries) {
          expect(entry.zoneKeyword).toBeTruthy();
          expect(entry.lines.length).toBeGreaterThan(0);
          entry.lines.forEach(line => expect(typeof line).toBe('string'));
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: FAIL — `contextLines` not on type.

- [ ] **Step 3: Add ContextLine interface and contextLines to NpcDialogue**

In `packages/shared/src/constants/npcDialogue.ts`, update the interface (lines 8-13):

```typescript
export interface ContextLine {
  zoneKeyword: string;
  lines: string[];
}

export interface NpcDialogue {
  name: string;
  location: string;
  personality: string;
  lines: Partial<Record<DialogueEvent, string[]>>;
  contextLines?: Partial<Record<DialogueEvent, ContextLine[]>>;
}
```

The `ContextLine` type is auto-exported via `packages/shared/src/index.ts` line 32: `export * from './constants/npcDialogue'`.

- [ ] **Step 4: Build shared package**

```bash
npm run build
```
Expected: Clean build. The shared package must be built so downstream packages can see the new type.

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS (no NPCs have contextLines yet, but the type check works).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts packages/shared/src/constants/__tests__/npcDialogue.test.ts
git commit -m "feat(shared): add ContextLine interface for context-aware NPC dialogue"
```

---

### Task 4: Activity Tracker Utility

**Files:**
- Create: `apps/web/src/lib/activityTracker.ts`
- Create: `apps/web/src/lib/__tests__/activityTracker.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/activityTracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTurnsSpent, getTopZone } from '../activityTracker';

describe('activityTracker', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('recordTurnsSpent', () => {
    it('stores turn count for a zone', () => {
      recordTurnsSpent('deep-forest', 10);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('10');
    });

    it('accumulates turns across multiple calls', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('deep-forest', 5);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('15');
    });

    it('tracks multiple zones independently', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 20);
      expect(sessionStorage.getItem('turns-spent:deep-forest')).toBe('10');
      expect(sessionStorage.getItem('turns-spent:crystal-caves')).toBe('20');
    });
  });

  describe('getTopZone', () => {
    it('returns null when no turns recorded', () => {
      expect(getTopZone()).toBeNull();
    });

    it('returns the zone with the most turns', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 20);
      recordTurnsSpent('forest-edge', 5);
      expect(getTopZone()).toBe('crystal-caves');
    });

    it('returns one zone when tied (deterministic)', () => {
      recordTurnsSpent('deep-forest', 10);
      recordTurnsSpent('crystal-caves', 10);
      const result = getTopZone();
      expect(['deep-forest', 'crystal-caves']).toContain(result);
    });

    it('ignores non-turns-spent sessionStorage keys', () => {
      sessionStorage.setItem('unrelated-key', '999');
      recordTurnsSpent('deep-forest', 5);
      expect(getTopZone()).toBe('deep-forest');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/lib/__tests__/activityTracker.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement activityTracker**

Create `apps/web/src/lib/activityTracker.ts`:

```typescript
const TURNS_SPENT_PREFIX = 'turns-spent:';

export function recordTurnsSpent(zoneId: string, count: number): void {
  const key = `${TURNS_SPENT_PREFIX}${zoneId}`;
  const current = parseInt(sessionStorage.getItem(key) ?? '0', 10);
  sessionStorage.setItem(key, String(current + count));
}

export function getTopZone(): string | null {
  let topZone: string | null = null;
  let topCount = 0;

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key?.startsWith(TURNS_SPENT_PREFIX)) continue;

    const count = parseInt(sessionStorage.getItem(key) ?? '0', 10);
    if (count > topCount) {
      topCount = count;
      topZone = key.slice(TURNS_SPENT_PREFIX.length);
    }
  }

  return topZone;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run src/lib/__tests__/activityTracker.test.ts
```
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/activityTracker.ts apps/web/src/lib/__tests__/activityTracker.test.ts
git commit -m "feat(web): add sessionStorage-based activity tracker for turn spending"
```

---

### Task 5: NPC Line Rotation Utility

**Files:**
- Create: `apps/web/src/lib/npcLineRotation.ts`
- Create: `apps/web/src/lib/__tests__/npcLineRotation.test.ts`

**Depends on:** Task 3 (contextLines type) and Task 4 (activityTracker).

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/lib/__tests__/npcLineRotation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNextNpcLine } from '../npcLineRotation';

// Mock the shared module
vi.mock('@pocketrealm/shared', () => ({
  NPC_DIALOGUE: {
    'test-npc': {
      name: 'Test NPC',
      location: 'Test',
      personality: 'Testy',
      lines: {
        greeting: ['Hello', 'Hi', 'Hey'],
        idle: ['Waiting...'],
      },
      contextLines: {
        greeting: [
          { zoneKeyword: 'deep-forest', lines: ['Back from the forest?', 'Smells like pine.'] },
        ],
      },
    },
    'no-context-npc': {
      name: 'Plain NPC',
      location: 'Test',
      personality: 'Plain',
      lines: {
        greeting: ['Hello', 'Hi'],
      },
    },
  },
}));

describe('getNextNpcLine', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns a line from the NPC pool', () => {
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('returns null for unknown NPC', () => {
    expect(getNextNpcLine('nonexistent' as any, 'greeting')).toBeNull();
  });

  it('returns null for event with no lines', () => {
    expect(getNextNpcLine('test-npc', 'sell')).toBeNull();
  });

  it('does not repeat until all lines shown', () => {
    const seen = new Set<string | null>();
    // 3 greeting lines — should see all 3 before any repeat
    for (let i = 0; i < 3; i++) {
      seen.add(getNextNpcLine('test-npc', 'greeting'));
    }
    expect(seen.size).toBe(3);
    expect(seen).toContain('Hello');
    expect(seen).toContain('Hi');
    expect(seen).toContain('Hey');
  });

  it('resets after all lines exhausted', () => {
    // Exhaust all 3 lines
    for (let i = 0; i < 3; i++) {
      getNextNpcLine('test-npc', 'greeting');
    }
    // 4th call should still return a valid line (from reset pool)
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('returns context-aware line when context matches', () => {
    // Set up context: deep-forest is top zone
    sessionStorage.setItem('turns-spent:deep-forest', '50');
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Back from the forest?', 'Smells like pine.']).toContain(line);
  });

  it('falls back to generic lines when no context match', () => {
    // Set up context: crystal-caves is top zone (no matching contextLines)
    sessionStorage.setItem('turns-spent:crystal-caves', '50');
    const line = getNextNpcLine('test-npc', 'greeting');
    expect(['Hello', 'Hi', 'Hey']).toContain(line);
  });

  it('falls back to generic when NPC has no contextLines', () => {
    sessionStorage.setItem('turns-spent:deep-forest', '50');
    const line = getNextNpcLine('no-context-npc', 'greeting');
    expect(['Hello', 'Hi']).toContain(line);
  });

  it('handles single-line pools without error', () => {
    const line = getNextNpcLine('test-npc', 'idle');
    expect(line).toBe('Waiting...');
    // Second call resets and returns same line
    const line2 = getNextNpcLine('test-npc', 'idle');
    expect(line2).toBe('Waiting...');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/web && npx vitest run src/lib/__tests__/npcLineRotation.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement npcLineRotation**

Create `apps/web/src/lib/npcLineRotation.ts`:

```typescript
import { NPC_DIALOGUE, type NpcKey, type DialogueEvent } from '@pocketrealm/shared';
import { getTopZone } from './activityTracker';

const SHOWN_KEY_PREFIX = 'npc-lines-shown:';

interface LinePool {
  lines: string[];
  storageKeySuffix: string;
}

function getLinePool(npcKey: NpcKey, event: DialogueEvent): LinePool | null {
  const npc = NPC_DIALOGUE[npcKey];
  if (!npc) return null;

  // Check for context-aware lines first
  const topZone = getTopZone();
  if (topZone && npc.contextLines?.[event]) {
    const contextMatch = npc.contextLines[event]!.find(
      (cl) => topZone.includes(cl.zoneKeyword)
    );
    if (contextMatch && contextMatch.lines.length > 0) {
      return {
        lines: contextMatch.lines,
        storageKeySuffix: `${npcKey}:${event}:ctx:${contextMatch.zoneKeyword}`,
      };
    }
  }

  // Fall back to generic lines
  const lines = npc.lines[event];
  if (!lines || lines.length === 0) return null;

  return { lines, storageKeySuffix: `${npcKey}:${event}` };
}

function pickWithoutRepeat(pool: LinePool): string {
  const storageKey = `${SHOWN_KEY_PREFIX}${pool.storageKeySuffix}`;
  const shownJson = sessionStorage.getItem(storageKey);
  let shown: number[] = shownJson ? JSON.parse(shownJson) : [];

  // Get indices not yet shown
  const available = pool.lines
    .map((_, i) => i)
    .filter((i) => !shown.includes(i));

  // Reset if all shown
  if (available.length === 0) {
    shown = [];
    const allIndices = pool.lines.map((_, i) => i);
    const idx = allIndices[Math.floor(Math.random() * allIndices.length)];
    sessionStorage.setItem(storageKey, JSON.stringify([idx]));
    return pool.lines[idx];
  }

  const idx = available[Math.floor(Math.random() * available.length)];
  shown.push(idx);
  sessionStorage.setItem(storageKey, JSON.stringify(shown));
  return pool.lines[idx];
}

export function getNextNpcLine(npcKey: NpcKey, event: DialogueEvent): string | null {
  const pool = getLinePool(npcKey, event);
  if (!pool) return null;
  return pickWithoutRepeat(pool);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web && npx vitest run src/lib/__tests__/npcLineRotation.test.ts
```
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/npcLineRotation.ts apps/web/src/lib/__tests__/npcLineRotation.test.ts
git commit -m "feat(web): add no-repeat NPC line rotation with context-aware selection"
```

---

## Chunk 3: Frontend Components — Collapsible + Banner Updates

### Task 6: CollapsibleLoreSection Component

**Files:**
- Create: `apps/web/src/components/common/CollapsibleLoreSection.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/common/CollapsibleLoreSection.tsx`:

```tsx
'use client';

import { useState, useEffect, useId } from 'react';
import { ChevronRight } from 'lucide-react';

interface CollapsibleLoreSectionProps {
  title: string;
  storageKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsibleLoreSection({
  title,
  storageKey,
  children,
  defaultExpanded = false,
}: CollapsibleLoreSectionProps) {
  const contentId = useId();
  const fullKey = `lore-collapsed:${storageKey}`;

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return defaultExpanded;
    const stored = sessionStorage.getItem(fullKey);
    if (stored !== null) return stored === 'true';
    return defaultExpanded;
  });

  useEffect(() => {
    sessionStorage.setItem(fullKey, String(expanded));
  }, [expanded, fullKey]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full text-left group"
      >
        <ChevronRight
          size={14}
          className={`text-[var(--rpg-text-secondary)] transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide">
          {title}
        </span>
      </button>
      <div
        id={contentId}
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/CollapsibleLoreSection.tsx
git commit -m "feat(ui): add CollapsibleLoreSection component with session persistence"
```

---

### Task 7: Update NpcDialogueBanner — Rotation, Preference Prop, Collapsible

**Files:**
- Modify: `apps/web/src/components/common/NpcDialogueBanner.tsx`

**Note:** The NPC banner has its own inline collapsible logic rather than composing with `CollapsibleLoreSection`. This is deliberate — the banner's collapsed state shows "NPC name + ..." which is a different UI pattern than the generic collapsible section header. Reusing `CollapsibleLoreSection` would require adding a custom render prop for the collapsed indicator, which adds complexity without benefit for this single use case.

- [ ] **Step 1: Update NpcDialogueBanner**

Rewrite `apps/web/src/components/common/NpcDialogueBanner.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getNpcName, NPC_DIALOGUE_CONSTANTS, type DialogueEvent, type NpcKey } from '@pocketrealm/shared';
import { getNextNpcLine } from '../../lib/npcLineRotation';
import { ChevronRight } from 'lucide-react';

interface NpcDialogueBannerProps {
  npcKey: NpcKey;
  event: DialogueEvent;
  showDialogue?: boolean;
}

export function NpcDialogueBanner({ npcKey, event, showDialogue = true }: NpcDialogueBannerProps) {
  const name = getNpcName(npcKey);
  const [line, setLine] = useState<string | null>(() => getNextNpcLine(npcKey, event));
  const storageKey = `lore-collapsed:npc-banner:${npcKey}`;

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = sessionStorage.getItem(storageKey);
    if (stored !== null) return stored === 'true';
    return false;
  });

  // Update line when event or npcKey changes
  useEffect(() => {
    setLine(getNextNpcLine(npcKey, event));
  }, [event, npcKey]);

  // Rotate idle lines on timer
  useEffect(() => {
    if (event !== 'idle') return;
    const interval = setInterval(() => {
      setLine(getNextNpcLine(npcKey, 'idle'));
    }, NPC_DIALOGUE_CONSTANTS.IDLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [event, npcKey]);

  // Persist collapsed state
  useEffect(() => {
    sessionStorage.setItem(storageKey, String(expanded));
  }, [expanded, storageKey]);

  if (!showDialogue || !name || !line) return null;

  return (
    <div className="mb-3 p-3 rounded-lg bg-[var(--rpg-surface)] border border-[var(--rpg-border)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full text-left"
        aria-expanded={expanded}
      >
        <ChevronRight
          size={12}
          className={`text-[var(--rpg-gold)] transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide">
          {name}
        </span>
        {!expanded && (
          <span className="text-xs text-[var(--rpg-text-secondary)] opacity-50 ml-1">&hellip;</span>
        )}
      </button>
      {expanded && (
        <p className="text-sm italic text-[var(--rpg-text-secondary)] leading-snug mt-1">
          &ldquo;{line}&rdquo;
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build. The existing call sites don't pass `showDialogue` so it defaults to `true` — no breakage.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/common/NpcDialogueBanner.tsx
git commit -m "feat(ui): update NpcDialogueBanner with rotation, preference prop, collapsible"
```

---

## Chunk 4: Frontend Integration — Prop Threading + Settings UI

### Task 8: Thread Flavour Text Preferences Through Frontend

**Files:**
- Modify: `apps/web/src/lib/api/player.ts:4-44` (getPlayer response type), `:46-65` (PlayerSettings interface)
- Modify: `apps/web/src/app/game/hooks/usePlayerSettings.ts:6-25` (ServerSettingsPayload), `:52-56` (handleSetSetting), `:92-113` (initSettingsFromServer)
- Modify: `apps/web/src/components/screens/Settings.tsx:31-75` (SettingsProps interface)
- Modify: `apps/web/src/app/game/page.tsx` (prop threading to screens)

This task threads the 3 new preference fields from API response → settings hook → Settings component → screen components.

- [ ] **Step 1: Add fields to frontend API types**

In `apps/web/src/lib/api/player.ts`:

1. Add to `getPlayer()` response type (inside the `player` object, after `notifyExpeditionFinished`):
```typescript
      showNpcDialogue: boolean;
      showItemFlavourText: boolean;
      showBestiaryLore: boolean;
```

2. Add to `PlayerSettings` interface (after `notifyExpeditionFinished`):
```typescript
  showNpcDialogue?: boolean;
  showItemFlavourText?: boolean;
  showBestiaryLore?: boolean;
```

- [ ] **Step 2: Add state + handlers to usePlayerSettings**

In `apps/web/src/app/game/hooks/usePlayerSettings.ts`:

1. Add to `ServerSettingsPayload` interface:
```typescript
  showNpcDialogue?: boolean | null;
  showItemFlavourText?: boolean | null;
  showBestiaryLore?: boolean | null;
```

2. Add state variables (alongside existing ones like `autoSkipKnownCombat`):
```typescript
const [showNpcDialogue, setShowNpcDialogue] = useState(true);
const [showItemFlavourText, setShowItemFlavourText] = useState(true);
const [showBestiaryLore, setShowBestiaryLore] = useState(true);
```

3. Add to `initSettingsFromServer` (alongside existing setters):
```typescript
setShowNpcDialogue(s.showNpcDialogue ?? true);
setShowItemFlavourText(s.showItemFlavourText ?? true);
setShowBestiaryLore(s.showBestiaryLore ?? true);
```

4. Add change handlers (follow existing `handleSetSetting` pattern):
```typescript
const handleShowNpcDialogueChange = (v: boolean) =>
  handleSetSetting('showNpcDialogue', v, setShowNpcDialogue, showNpcDialogue);
const handleShowItemFlavourTextChange = (v: boolean) =>
  handleSetSetting('showItemFlavourText', v, setShowItemFlavourText, showItemFlavourText);
const handleShowBestiaryLoreChange = (v: boolean) =>
  handleSetSetting('showBestiaryLore', v, setShowBestiaryLore, showBestiaryLore);
```

5. Add to the hook's return object:
```typescript
showNpcDialogue,
onShowNpcDialogueChange: handleShowNpcDialogueChange,
showItemFlavourText,
onShowItemFlavourTextChange: handleShowItemFlavourTextChange,
showBestiaryLore,
onShowBestiaryLoreChange: handleShowBestiaryLoreChange,
```

- [ ] **Step 3: Add props to SettingsProps interface**

In `apps/web/src/components/screens/Settings.tsx`, add to `SettingsProps` (after notification props):

```typescript
  // Lore & Flavour
  showNpcDialogue: boolean;
  onShowNpcDialogueChange: (value: boolean) => void;
  showItemFlavourText: boolean;
  onShowItemFlavourTextChange: (value: boolean) => void;
  showBestiaryLore: boolean;
  onShowBestiaryLoreChange: (value: boolean) => void;
```

- [ ] **Step 4: Thread props from page.tsx**

In `apps/web/src/app/game/page.tsx`, find where `<Settings>` is rendered and pass the 6 new props through from the usePlayerSettings hook return value. Also find where screen components that use `NpcDialogueBanner` are rendered and pass `showNpcDialogue` to them (or directly to `NpcDialogueBanner` via the screen's props).

Similarly, pass `showBestiaryLore` to the `<Bestiary>` component and `showItemFlavourText` to the inventory item mapping.

**Note:** Read `page.tsx` to trace how settings flow from the hook to each screen. The exact prop names may need adapting to match each screen's props interface.

- [ ] **Step 5: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/player.ts apps/web/src/app/game/hooks/usePlayerSettings.ts apps/web/src/components/screens/Settings.tsx apps/web/src/app/game/page.tsx
git commit -m "feat(ui): thread flavour text preferences through frontend settings pipeline"
```

---

### Task 9: Settings UI — Lore & Flavour Section

**Files:**
- Modify: `apps/web/src/components/screens/Settings.tsx`

**Depends on:** Task 8 (props must be in SettingsProps first).

The existing Settings component uses individual props per setting with `<ToggleSwitch>` components. Follow this exact pattern.

- [ ] **Step 1: Add Lore & Flavour toggle section**

In `apps/web/src/components/screens/Settings.tsx`, after the Notifications `<PixelCard>` section (around line 289), add:

```tsx
<PixelCard>
  <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-3">Lore & Flavour</h3>
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--rpg-text-secondary)]">NPC Dialogue</span>
      <ToggleSwitch checked={showNpcDialogue} onChange={onShowNpcDialogueChange} />
    </div>
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--rpg-text-secondary)]">Item Flavour Text</span>
      <ToggleSwitch checked={showItemFlavourText} onChange={onShowItemFlavourTextChange} />
    </div>
    <div className="flex items-center justify-between">
      <span className="text-xs text-[var(--rpg-text-secondary)]">Bestiary Lore</span>
      <ToggleSwitch checked={showBestiaryLore} onChange={onShowBestiaryLoreChange} />
    </div>
  </div>
</PixelCard>
```

**Note:** Destructure the 6 new props from the Settings component's props at the top of the function. The `ToggleSwitch` component is already imported (line 5).

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/screens/Settings.tsx
git commit -m "feat(ui): add Lore & Flavour section to settings panel"
```

---

### Task 10: Wire showDialogue Prop to All NPC Banner Call Sites

**Files:**
- Modify: `apps/web/src/components/screens/Casino.tsx:383`
- Modify: `apps/web/src/components/screens/Crafting.tsx:133`
- Modify: `apps/web/src/components/screens/Forge.tsx:273`
- Modify: `apps/web/src/components/screens/Gathering.tsx:227`
- Modify: `apps/web/src/components/screens/GuildScreen.tsx:107`
- Modify: `apps/web/src/components/screens/Quests.tsx:470`
- Modify: `apps/web/src/app/game/page.tsx` (pass showNpcDialogue to each screen)

- [ ] **Step 1: Add showNpcDialogue to each screen's props interface**

For each screen that renders `<NpcDialogueBanner>`, add `showNpcDialogue: boolean` to its props interface. Read each file to confirm the exact interface name.

- [ ] **Step 2: Pass showNpcDialogue from page.tsx to each screen**

In `apps/web/src/app/game/page.tsx`, at each `<Casino>`, `<Crafting>`, `<Forge>`, `<Gathering>`, `<GuildScreen>`, `<Quests>` render site, add `showNpcDialogue={showNpcDialogue}`.

- [ ] **Step 3: Wire showDialogue prop to banner in each screen**

In each screen, find the `<NpcDialogueBanner` line and add `showDialogue={showNpcDialogue}`:

```tsx
<NpcDialogueBanner
  npcKey="millbrook-casino"
  event={dialogueEvent}
  showDialogue={showNpcDialogue}
/>
```

- [ ] **Step 4: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/screens/ apps/web/src/app/game/page.tsx
git commit -m "feat(ui): wire showDialogue preference to all NPC banner call sites"
```

---

### Task 11: Item Flavour Text Toggle

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:587`

- [ ] **Step 1: Conditionally skip flavorText**

In `apps/web/src/app/game/page.tsx`, find the item mapping at line 587. The `showItemFlavourText` value is available from `usePlayerSettings` (wired in Task 8).

```typescript
// Before:
description: item.template.flavorText || item.template.itemType,

// After:
description: (showItemFlavourText && item.template.flavorText) || item.template.itemType,
```

Read the file to confirm the exact variable name — it comes from the usePlayerSettings hook destructured at the top of the component.

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat(ui): respect showItemFlavourText preference in inventory"
```

---

### Task 12: Bestiary Lore Toggle + Collapsible

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx:62-67` (BestiaryProps), `:605-640` (flavour text block)
- Modify: `apps/web/src/app/game/page.tsx` (pass showBestiaryLore to Bestiary)

- [ ] **Step 1: Add showBestiaryLore to BestiaryProps**

In `apps/web/src/components/screens/Bestiary.tsx`, add to `BestiaryProps` interface (line 62-67):

```typescript
interface BestiaryProps {
  monsters: Monster[];
  prefixSummary: PrefixSummaryEntry[];
  expeditionThemes: ExpeditionBestiaryTheme[];
  worldBosses: WorldBossEntry[];
  showBestiaryLore: boolean;
}
```

- [ ] **Step 2: Pass showBestiaryLore from page.tsx**

In `apps/web/src/app/game/page.tsx`, find where `<Bestiary>` is rendered and add `showBestiaryLore={showBestiaryLore}`.

- [ ] **Step 3: Wrap bestiary flavour sections with toggle + collapsible**

In `Bestiary.tsx`, import at top:
```typescript
import { CollapsibleLoreSection } from '../common/CollapsibleLoreSection';
```

Destructure `showBestiaryLore` from props. Replace the progressive flavour text block (lines 605-640):

```tsx
{showBestiaryLore ? (
  <div className="space-y-3 mb-4">
    <CollapsibleLoreSection
      title="Appearance"
      storageKey={`bestiary-lore:${selectedMonster.id}:appearance`}
    >
      <p className="text-sm text-[var(--rpg-text-secondary)]">
        {selectedMonster.flavorAppearance ?? (
          <span className="opacity-50 flex items-center gap-1">
            <Lock size={12} />
            ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_APPEARANCE_THRESHOLD}+)
          </span>
        )}
      </p>
    </CollapsibleLoreSection>
    <CollapsibleLoreSection
      title="Behaviour"
      storageKey={`bestiary-lore:${selectedMonster.id}:behaviour`}
    >
      <p className="text-sm text-[var(--rpg-text-secondary)]">
        {selectedMonster.flavorBehavior ?? (
          <span className="opacity-50 flex items-center gap-1">
            <Lock size={12} />
            ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_BEHAVIOR_THRESHOLD}+)
          </span>
        )}
      </p>
    </CollapsibleLoreSection>
    <CollapsibleLoreSection
      title="Lore"
      storageKey={`bestiary-lore:${selectedMonster.id}:lore`}
    >
      <p className="text-sm text-[var(--rpg-text-secondary)]">
        {selectedMonster.flavorLore ?? (
          <span className="opacity-50 flex items-center gap-1">
            <Lock size={12} />
            ??? (Defeat {BESTIARY_UNLOCK_CONSTANTS.FLAVOR_LORE_THRESHOLD}+)
          </span>
        )}
      </p>
    </CollapsibleLoreSection>
  </div>
) : selectedMonster.description && (
  <p className="text-sm text-[var(--rpg-text-secondary)] mb-4">
    {selectedMonster.description}
  </p>
)}
```

- [ ] **Step 4: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/screens/Bestiary.tsx apps/web/src/app/game/page.tsx
git commit -m "feat(ui): add toggle and collapsible sections for bestiary lore"
```

---

### Task 13: Zone Text Collapsible

**Files:**
- Modify: `apps/web/src/components/screens/ZoneMap.tsx:339-355`

- [ ] **Step 1: Wrap zone text in collapsible sections**

In `apps/web/src/components/screens/ZoneMap.tsx`, find the zone description/arrival/ambient text rendering (lines 339-355).

Import at top:
```typescript
import { CollapsibleLoreSection } from '../common/CollapsibleLoreSection';
```

Wrap the zone lore text block:

```tsx
{(selectedZone.description || selectedZone.arrivalText || ambientText) && (
  <CollapsibleLoreSection title="Zone Lore" storageKey="zone-description">
    {selectedZone.description && (
      <p className="text-sm leading-snug text-[var(--rpg-text-secondary)] mb-2">
        {selectedZone.description}
      </p>
    )}
    {selectedZone.arrivalText && (
      <p className="text-sm italic leading-snug text-[var(--rpg-text-secondary)] mb-2 border-l-2 border-[var(--rpg-gold)] pl-3">
        {selectedZone.arrivalText}
      </p>
    )}
    {ambientText && (
      <p className="text-xs italic leading-snug text-[var(--rpg-text-secondary)] opacity-70 mb-2">
        {ambientText}
      </p>
    )}
  </CollapsibleLoreSection>
)}
```

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/screens/ZoneMap.tsx
git commit -m "feat(ui): wrap zone lore text in collapsible section"
```

---

## Chunk 5: Activity Tracking Integration + NPC Line Expansion

### Task 14: Hook recordTurnsSpent into useGameController

**Files:**
- Modify: `apps/web/src/app/game/useGameController.ts`

- [ ] **Step 1: Import and call recordTurnsSpent**

At the top of `useGameController.ts`, add:

```typescript
import { recordTurnsSpent } from '../../lib/activityTracker';
```

Then find the three turn-spending functions and add tracking calls. **Key variable names:**
- `currentZone` (memoized, line 740): use `currentZone.id` for the zone ID
- `activeZoneId` (state, line 204): use for combat/gathering where `currentZone` may not be in scope

**handleStartExploration** (line 784): After the API call succeeds (after `stateUpdates` processing), add:

```typescript
recordTurnsSpent(currentZone.id, turnSpend);
```

Note: `currentZone` is already verified non-null by the guard on line 785 (`if (!currentZone) return`).

**handleStartCombat** (line 883): After successful combat processing, add:

```typescript
if (activeZoneId) recordTurnsSpent(activeZoneId, 1);
```

**handleMine** (line 1076): After the gathering API call returns successfully, add:

```typescript
if (activeZoneId) recordTurnsSpent(activeZoneId, turnSpend);
```

Note: `activeZoneId` is already checked at line 1077 (`if (!activeZoneId) return`), so the guard is redundant but harmless for clarity.

- [ ] **Step 2: Verify build**

```bash
npm run build:web
```
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/useGameController.ts
git commit -m "feat(web): track turns spent per zone for context-aware NPC dialogue"
```

---

### Task 15: Expand NPC Dialogue Lines (Base NPCs — Batch 1)

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`

- [ ] **Step 1: Expand Bram Holloway (millbrook-general-store) to 10 lines per event**

Add 7 new greeting lines, 7 new idle lines, 7 new buy lines, 7 new sell lines, 8 new farewell lines. Maintain personality: dry humour, practical, unhurried, faintly amused.

- [ ] **Step 2: Expand Kessa Ironweld (millbrook-blacksmith) to 10 lines per event**

Add lines matching personality: direct, proud, perpetually overheated.

- [ ] **Step 3: Expand Maren Ashwick (millbrook-tavern) to 10 lines per event**

Warm, gossipy, knows everyone's business.

- [ ] **Step 4: Expand Vesper Tain (millbrook-herbalist) to 10 lines per event**

Mystical, slightly unsettling, poetic.

- [ ] **Step 5: Run existing NPC dialogue tests**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS — all existing tests still pass with more lines.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts
git commit -m "feat(lore): expand dialogue to 10 lines per event for Bram, Kessa, Maren, Vesper"
```

---

### Task 16: Expand NPC Dialogue Lines (Base NPCs — Batch 2)

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`

- [ ] **Step 1: Expand Aldric Voss (millbrook-quest-board) to 10 lines per event**

Bureaucratic, long-suffering, dry.

- [ ] **Step 2: Expand Rowan Delk (millbrook-gathering-guide) to 10 lines per event**

Outdoorsy, patient, earnest.

- [ ] **Step 3: Expand Silas Vane (millbrook-casino) to 10 lines per event**

Smooth, charismatic, always calculating odds.

- [ ] **Step 4: Expand Gavrik Stoneshoulder (millbrook-guild-recruiter) to 10 lines per event**

Gruff, loyal, military bearing.

- [ ] **Step 5: Run NPC dialogue tests**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts
git commit -m "feat(lore): expand dialogue to 10 lines per event for Aldric, Rowan, Silas, Gavrik"
```

---

### Task 17: Expand NPC Dialogue Lines (Remaining NPCs + Variants)

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`

- [ ] **Step 1: Expand Lira Caravel (thornwall-merchant) to 10 lines per event**

Worldly, sharp, slightly haughty.

- [ ] **Step 2: Expand Vex (wandering-merchant) to 10 lines per event**

Enigmatic, playful, unreliable.

- [ ] **Step 3: Expand Mysterious Stranger to 10 idle/farewell lines**

Cryptic, ominous, sparse. (This NPC only has idle and farewell events.)

- [ ] **Step 4: Expand Captain Fen Darrow (town-guard) to 10 lines per event**

Authoritative, protective, weary.

- [ ] **Step 5: Expand skill variants (kessa-weaponsmithing, kessa-armorsmithing, kessa-refining, rowan-mining, rowan-woodcutting, rowan-foraging) to 8 lines per event**

Same base personality, skill-specific subject matter.

- [ ] **Step 6: Run NPC dialogue tests**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS

- [ ] **Step 7: Update completeness test**

In `packages/shared/src/constants/__tests__/npcDialogue.test.ts`, update the minimum line count assertion to verify each NPC has at least 8 lines per event type:

```typescript
it('each NPC has at least 8 lines per populated event', () => {
  for (const [key, npc] of Object.entries(NPC_DIALOGUE)) {
    for (const [event, lines] of Object.entries(npc.lines)) {
      expect(lines.length, `${key}.${event} has ${lines.length} lines, expected >= 8`).toBeGreaterThanOrEqual(8);
    }
  }
});
```

- [ ] **Step 8: Run updated tests**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts packages/shared/src/constants/__tests__/npcDialogue.test.ts
git commit -m "feat(lore): expand remaining NPCs + variants to 8-10 lines, add completeness test"
```

---

### Task 18: Add Context-Aware Lines to Key NPCs

**Files:**
- Modify: `packages/shared/src/constants/npcDialogue.ts`

- [ ] **Step 1: Add contextLines to Bram Holloway**

Add `contextLines` property with greeting lines referencing top zones:

```typescript
contextLines: {
  greeting: [
    { zoneKeyword: 'deep-forest', lines: [
      'Back from the Deep Forest? You smell like mushrooms and regret.',
      'Deep Forest again? You adventurers are either brave or terrible at finding other hobbies.',
    ]},
    { zoneKeyword: 'crystal-caves', lines: [
      'Crystal Caves, eh? Let me guess — your pack\'s full of shiny rocks and your coin purse is light.',
      'Careful with those cave crystals. Last adventurer who brought one in set off every ward in the shop.',
    ]},
    { zoneKeyword: 'forest-edge', lines: [
      'Forest Edge run? I hope you brought me something better than rat pelts this time.',
    ]},
  ],
},
```

- [ ] **Step 2: Add contextLines to 3-4 other key NPCs**

Add context-aware lines to Kessa, Vesper, and Maren — the NPCs players interact with most. Each gets 2-3 zone-specific greeting entries with 1-2 lines each.

- [ ] **Step 3: Run tests**

```bash
npm run test:engine -- --run npcDialogue
```
Expected: PASS — the contextLines completeness test from Task 3 validates the structure.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants/npcDialogue.ts
git commit -m "feat(lore): add context-aware dialogue lines for key NPCs"
```

---

## Chunk 6: Final Verification

### Task 19: Full Build + Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Build everything**

```bash
npm run build
```
Expected: Clean build (builds packages → apps in correct order).

- [ ] **Step 2: Run all tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```
Expected: Clean typecheck (ignore pre-existing `page.tsx:333` SkillType error if present).

- [ ] **Step 4: Commit any remaining fixes**

If any tests or type errors surfaced, fix them and commit:
```bash
git commit -m "fix: address build/test issues from flavour text expansion"
```
