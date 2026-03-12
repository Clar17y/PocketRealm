# Bestiary Prefix Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split the Bestiary into a Monsters view (with compact prefix pip rows) and a Prefix Encyclopedia view, removing the cluttered per-monster variant listings.

**Architecture:** Read-side-only refactor. API response shape changes (no new DB tables). Frontend gets a view toggle, pip row component, and prefix encyclopedia. No changes to combat, exploration, or kill recording.

**Tech Stack:** Express API (TypeScript), Next.js React frontend (TypeScript), Prisma ORM, `@adventure/shared` constants.

**Design doc:** `docs/superpowers/plans/2026-02-12-bestiary-prefix-redesign.md`

---

### Task 1: Update Bestiary API Response

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts`

**Step 1: Add prefix summary aggregation**

After the existing `prefixesByMobId` map construction (line ~61), add a second aggregation that groups by prefix key and sums kills:

```typescript
const prefixTotals = new Map<string, number>();
for (const prefixEntry of prefixProgress as Array<{ mobTemplateId: string; prefix: string; kills: number }>) {
  prefixTotals.set(prefixEntry.prefix, (prefixTotals.get(prefixEntry.prefix) ?? 0) + prefixEntry.kills);
}
```

**Step 2: Change per-mob `prefixEncounters` to `prefixesEncountered`**

In the `res.json` map callback, replace:
```typescript
prefixEncounters,
```
with:
```typescript
prefixesEncountered: (prefixesByMobId.get(mob.id) ?? []).map(pe => pe.prefix),
```

**Step 3: Add top-level `prefixSummary` to response**

Change the `res.json` call to return both `mobs` and `prefixSummary`:

```typescript
import { getAllMobPrefixes } from '@adventure/shared';
```

```typescript
const allPrefixes = getAllMobPrefixes();
res.json({
  mobs: mobTemplates.map(/* ...existing map, with prefixesEncountered change... */),
  prefixSummary: allPrefixes.map(p => ({
    prefix: p.key,
    displayName: p.displayName,
    totalKills: prefixTotals.get(p.key) ?? 0,
    discovered: (prefixTotals.get(p.key) ?? 0) > 0,
  })),
});
```

**Step 4: Clean up unused code**

Remove the `prefixesByMobId` map entries that stored `displayName` and `kills` per-mob — we only need the prefix keys now. The map can store `Set<string>` instead of the full objects:

```typescript
const prefixKeysByMobId = new Map<string, string[]>();
for (const prefixEntry of prefixProgress as Array<{ mobTemplateId: string; prefix: string; kills: number }>) {
  const keys = prefixKeysByMobId.get(prefixEntry.mobTemplateId) ?? [];
  if (!keys.includes(prefixEntry.prefix)) keys.push(prefixEntry.prefix);
  prefixKeysByMobId.set(prefixEntry.mobTemplateId, keys);
}
```

And in the mob map: `prefixesEncountered: prefixKeysByMobId.get(mob.id) ?? []`

**Step 5: Verify API compiles**

Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Step 6: Commit**

```
feat(api): return prefixSummary and per-mob prefixesEncountered from bestiary
```

---

### Task 2: Update Frontend API Types & Game Controller

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/game/useGameController.ts`

**Step 1: Update `getBestiary` return type in `api.ts`**

Replace the `prefixEncounters` field in the `getBestiary` response type (lines 321-325) with:

```typescript
prefixesEncountered: string[];
```

Add `prefixSummary` to the top-level response type (sibling of `mobs`):

```typescript
export async function getBestiary() {
  return fetchApi<{
    mobs: Array<{
      // ...existing fields...
      prefixesEncountered: string[];
    }>;
    prefixSummary: Array<{
      prefix: string;
      displayName: string;
      totalKills: number;
      discovered: boolean;
    }>;
  }>('/api/v1/bestiary');
}
```

**Step 2: Update `useGameController.ts` state types**

Replace `bestiaryMobs` state type — change `prefixEncounters` to `prefixesEncountered: string[]`:

```typescript
const [bestiaryMobs, setBestiaryMobs] = useState<Array<{
  id: string;
  name: string;
  level: number;
  isDiscovered: boolean;
  killCount: number;
  stats: { hp: number; accuracy: number; defence: number };
  zones: string[];
  description: string;
  drops: Array<{
    item: { id: string; name: string; itemType: string; tier: number };
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    dropRate: number;
    minQuantity: number;
    maxQuantity: number;
  }>;
  prefixesEncountered: string[];
}>>([]);
```

Add new state for prefix summary:

```typescript
const [bestiaryPrefixSummary, setBestiaryPrefixSummary] = useState<Array<{
  prefix: string;
  displayName: string;
  totalKills: number;
  discovered: boolean;
}>>([]);
```

**Step 3: Update `loadBestiary` callback**

Change:
```typescript
if (data) setBestiaryMobs(data.mobs);
```
to:
```typescript
if (data) {
  setBestiaryMobs(data.mobs);
  setBestiaryPrefixSummary(data.prefixSummary);
}
```

**Step 4: Export new state in the return object**

Add `bestiaryPrefixSummary` to the return object (near line ~1322 alongside `bestiaryMobs`).

**Step 5: Verify compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expect errors in `page.tsx` and `Bestiary.tsx` from the old `prefixEncounters` prop — that's expected, we fix those in the next tasks.

**Step 6: Commit**

```
feat(web): update bestiary API types and controller for prefix redesign
```

---

### Task 3: Update Bestiary Component — Props, Pip Row, Remove Variants

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx`

**Step 1: Update interfaces**

Replace the `Monster` interface's `prefixEncounters` field with:
```typescript
prefixesEncountered: string[];
```

Add a new `PrefixSummaryEntry` interface and update `BestiaryProps`:
```typescript
interface PrefixSummaryEntry {
  prefix: string;
  displayName: string;
  totalKills: number;
  discovered: boolean;
}

interface BestiaryProps {
  monsters: Monster[];
  prefixSummary: PrefixSummaryEntry[];
}
```

**Step 2: Add view toggle state**

Inside the `Bestiary` component, add:
```typescript
const [activeView, setActiveView] = useState<'monsters' | 'prefixes'>('monsters');
```

**Step 3: Add the PrefixPipRow component**

Define inside the file (above the `Bestiary` export):

```typescript
const PREFIX_ORDER = ['weak', 'frail', 'tough', 'gigantic', 'swift', 'ferocious', 'shaman', 'venomous', 'ancient', 'spectral'];
const TOTAL_PREFIXES = PREFIX_ORDER.length;

function PrefixPipRow({ encountered }: { encountered: string[] }) {
  const encounteredSet = new Set(encountered);
  const count = encounteredSet.size;
  const mastered = count === TOTAL_PREFIXES;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {PREFIX_ORDER.map((prefix) => {
          const found = encounteredSet.has(prefix);
          return (
            <div
              key={prefix}
              title={found ? prefix.charAt(0).toUpperCase() + prefix.slice(1) : '???'}
              className={`w-2 h-2 rounded-full ${
                mastered
                  ? 'bg-[var(--rpg-gold)]'
                  : found
                    ? 'bg-[var(--rpg-blue-light)]'
                    : 'bg-[var(--rpg-border)]'
              }`}
            />
          );
        })}
      </div>
      <span className={`text-[10px] font-mono ${mastered ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'}`}>
        {count}/{TOTAL_PREFIXES}
      </span>
      {mastered && <span className="text-[10px] text-[var(--rpg-gold)] font-bold">Mastered</span>}
    </div>
  );
}
```

**Step 4: Replace the Variants section in the monster detail modal**

Remove the entire "Variants" block (lines 303-331) and replace with the pip row:

```tsx
{/* Prefix Completion */}
{selectedMonster.killCount > 0 && (
  <div className="mb-4">
    <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm mb-2">Prefix Variants</h4>
    <PrefixPipRow encountered={selectedMonster.prefixesEncountered} />
  </div>
)}
```

**Step 5: Remove the `getPrefixEffectsText` helper and the `getMobPrefixDefinition` import**

These are no longer used in this component. Remove lines 10, 59-77.

**Step 6: Verify compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expect errors in `page.tsx` — the `Bestiary` component now requires `prefixSummary` prop. Fixed in Task 4.

**Step 7: Commit**

```
feat(web): replace bestiary variants section with prefix pip row
```

---

### Task 4: Add Prefix Encyclopedia View to Bestiary

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx`

**Step 1: Add view toggle buttons to the header**

After the `{discoveredCount}/{totalCount} discovered` div, replace the header section with:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Bestiary</h2>
    <BookOpen size={20} color="var(--rpg-gold)" />
  </div>
  <div className="flex gap-1">
    {(['monsters', 'prefixes'] as const).map((view) => (
      <button
        key={view}
        onClick={() => setActiveView(view)}
        className={`px-3 py-1 text-xs rounded-md transition-colors ${
          activeView === view
            ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-bold'
            : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
        }`}
      >
        {view === 'monsters' ? `Monsters ${discoveredCount}/${totalCount}` : 'Prefixes'}
      </button>
    ))}
  </div>
</div>
```

**Step 2: Add the Prefix Encyclopedia view**

Add `getMobPrefixDefinition` back as an import (we need it here for the encyclopedia, not for the old variants section):

```typescript
import { getMobPrefixDefinition } from '@adventure/shared';
```

Create a `PrefixEncyclopedia` component inside the file:

```tsx
function PrefixEncyclopedia({ prefixSummary }: { prefixSummary: PrefixSummaryEntry[] }) {
  const formatMultiplier = (value: number) => `${Number(value.toFixed(2))}x`;

  return (
    <div className="space-y-3">
      {prefixSummary.map((entry) => {
        const definition = getMobPrefixDefinition(entry.prefix);
        const showName = entry.totalKills >= 1;
        const showMultipliers = entry.totalKills >= 3;
        const showSpell = entry.totalKills >= 10;

        return (
          <div
            key={entry.prefix}
            className="rounded-lg border-2 bg-[var(--rpg-surface)] border-[var(--rpg-border)] p-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-[var(--rpg-text-primary)]">
                {showName ? entry.displayName : '???'}
              </span>
              {showName && (
                <span className="text-xs text-[var(--rpg-gold)] font-mono">
                  {entry.totalKills} defeated
                </span>
              )}
            </div>

            {showName && definition && (
              <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">{definition.description}</p>
            )}

            {showMultipliers && definition ? (
              <div className="space-y-1">
                <div className="flex flex-wrap gap-2 text-xs">
                  {definition.statMultipliers.hp !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-green-light)]">HP {formatMultiplier(definition.statMultipliers.hp)}</span>
                  )}
                  {definition.statMultipliers.accuracy !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-red)]">ACC {formatMultiplier(definition.statMultipliers.accuracy)}</span>
                  )}
                  {definition.statMultipliers.defence !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-blue-light)]">DEF {formatMultiplier(definition.statMultipliers.defence)}</span>
                  )}
                  {definition.statMultipliers.evasion !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)]">EVA {formatMultiplier(definition.statMultipliers.evasion)}</span>
                  )}
                  {(definition.statMultipliers.damageMin !== undefined || definition.statMultipliers.damageMax !== undefined) && (
                    <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-red)]">DMG {formatMultiplier(definition.statMultipliers.damageMin ?? 1)}</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-gold)]">XP {formatMultiplier(definition.xpMultiplier)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--rpg-background)] text-[var(--rpg-gold)]">LOOT {formatMultiplier(definition.dropChanceMultiplier)}</span>
                </div>

                {showSpell && definition.spellTemplate && (
                  <div className="mt-2 text-xs text-[var(--rpg-text-secondary)] border-t border-[var(--rpg-border)] pt-2">
                    Casts <span className="text-[var(--rpg-text-primary)] font-semibold">{definition.spellTemplate.actionName}</span> starting round {definition.spellTemplate.startRound}, every {definition.spellTemplate.interval} rounds ({formatMultiplier(definition.spellTemplate.damageMultiplier)} damage)
                  </div>
                )}
              </div>
            ) : showName ? (
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Defeat {3 - entry.totalKills} more to reveal effects.
              </div>
            ) : (
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                Encounter this prefix to learn about it.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 3: Conditionally render Monsters or Prefixes view**

Wrap the existing Monster Grid and Modal in a conditional:

```tsx
{activeView === 'monsters' ? (
  <>
    {/* Monster Grid — existing code */}
    {/* Monster Detail Modal — existing code */}
  </>
) : (
  <PrefixEncyclopedia prefixSummary={prefixSummary} />
)}
```

**Step 4: Verify compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 5: Commit**

```
feat(web): add prefix encyclopedia view to bestiary
```

---

### Task 5: Wire Everything Together in page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Update the Bestiary render case**

In the `case 'bestiary':` block (line ~515), update the `<Bestiary>` props:

Replace `prefixEncounters: m.prefixEncounters` with `prefixesEncountered: m.prefixesEncountered` in the monsters map.

Add the `prefixSummary` prop:

```tsx
<Bestiary
  monsters={bestiaryMobs.map((m) => ({
    id: m.id,
    name: m.name,
    imageSrc: m.isDiscovered ? monsterImageSrc(m.name) : undefined,
    level: m.level,
    isDiscovered: m.isDiscovered,
    killCount: m.killCount,
    stats: m.stats,
    zones: m.zones,
    description: m.description,
    prefixesEncountered: m.prefixesEncountered,
    drops: m.drops.map((d) => ({
      name: d.item.name,
      imageSrc: itemImageSrc(d.item.name, d.item.itemType),
      dropRate: d.dropRate,
      rarity: d.rarity,
    })),
  }))}
  prefixSummary={bestiaryPrefixSummary}
/>
```

**Step 2: Destructure `bestiaryPrefixSummary` from useGameController**

At line ~204 area where other bestiary vars are destructured, add `bestiaryPrefixSummary`.

**Step 3: Verify everything compiles**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Run: `npx tsc --noEmit -p apps/api/tsconfig.json`

**Step 4: Commit**

```
feat(web): wire bestiary prefix redesign through page.tsx
```

---

### Task 6: Manual Testing & Cleanup

**Step 1: Start the dev servers**

Run: `npm run dev`

**Step 2: Verify the Bestiary screen**

- Monsters view loads with the grid as before
- Each monster detail modal shows pip row instead of variants section
- Pips reflect the player's actual prefix kills
- Mastered badge appears if all 10 are filled

**Step 3: Verify the Prefixes view**

- Toggle to "Prefixes" view
- All 10 prefix cards appear
- Undiscovered prefixes show `???`
- Progressive reveal works (name at 1+, multipliers at 3+, spells at 10+)
- Kill counters are correct

**Step 4: Verify CombatScreen still works**

- CombatScreen only uses `bestiaryMobs` for `{ id, isDiscovered }` — no prefix data needed
- Start a combat and verify it still works

**Step 5: Final commit if any cleanup needed**

```
chore: bestiary prefix redesign cleanup
```
