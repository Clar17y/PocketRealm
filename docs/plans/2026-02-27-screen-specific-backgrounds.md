# Screen-Specific Backgrounds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand zone art backgrounds so every gameplay screen gets a thematic background — screen-specific art for Arena/Forge/Guild/Inventory/Crafting, zone art for explore/combat/gathering/rest/home.

**Architecture:** Simplify AppShell to receive a single `backgroundSrc` prop instead of separate zone/screen props. Add a `screenBackgroundSrc()` helper to `assets.ts` that maps screens (and crafting skills) to image paths. Compute the final background in `page.tsx` with priority: screen-specific > zone art > none. Remove the hardcoded `CONTEXT_SCREENS` set from `ZoneBackground` — it shows a background whenever `imageSrc` is provided.

**Tech Stack:** React, TypeScript, CSS transitions (no new dependencies)

---

### Task 1: Add screenBackgroundSrc helper to assets.ts

**Files:**
- Modify: `apps/web/src/lib/assets.ts`
- Modify: `apps/web/src/lib/assets.test.ts`

**Step 1: Write the failing tests**

Add to `apps/web/src/lib/assets.test.ts`:

```typescript
import {
  uiIconSrc,
  skillIconSrc,
  zoneImageSrc,
  resourceImageSrc,
  itemImageSrc,
  monsterImageSrc,
  screenBackgroundSrc,
} from './assets';

// ... existing tests ...

describe('screenBackgroundSrc', () => {
  it('returns arena background', () => {
    expect(screenBackgroundSrc('arena')).toBe('/assets/screens/screen_arena.png');
  });

  it('returns forge background', () => {
    expect(screenBackgroundSrc('forge')).toBe('/assets/screens/screen_forge.png');
  });

  it('returns guild background', () => {
    expect(screenBackgroundSrc('guild')).toBe('/assets/screens/screen_guild.png');
  });

  it('returns inventory background', () => {
    expect(screenBackgroundSrc('inventory')).toBe('/assets/screens/screen_inventory.png');
  });

  it('returns crafting background for active skill', () => {
    expect(screenBackgroundSrc('crafting', 'weaponsmithing')).toBe('/assets/screens/screen_weaponsmithing.png');
    expect(screenBackgroundSrc('crafting', 'alchemy')).toBe('/assets/screens/screen_alchemy.png');
    expect(screenBackgroundSrc('crafting', 'jewelcrafting')).toBe('/assets/screens/screen_jewelcrafting.png');
  });

  it('returns undefined for screens without specific backgrounds', () => {
    expect(screenBackgroundSrc('skills')).toBeUndefined();
    expect(screenBackgroundSrc('bestiary')).toBeUndefined();
    expect(screenBackgroundSrc('zones')).toBeUndefined();
    expect(screenBackgroundSrc('equipment')).toBeUndefined();
    expect(screenBackgroundSrc('settings')).toBeUndefined();
  });

  it('returns undefined for zone-art screens (handled separately)', () => {
    expect(screenBackgroundSrc('explore')).toBeUndefined();
    expect(screenBackgroundSrc('combat')).toBeUndefined();
    expect(screenBackgroundSrc('home')).toBeUndefined();
    expect(screenBackgroundSrc('gathering')).toBeUndefined();
    expect(screenBackgroundSrc('rest')).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/lib/assets.test.ts`
Expected: FAIL — `screenBackgroundSrc` is not exported

**Step 3: Implement screenBackgroundSrc**

Add to the end of `apps/web/src/lib/assets.ts` (before closing):

```typescript
const SCREEN_BACKGROUNDS = new Set([
  'arena', 'forge', 'guild', 'inventory',
]);

const CRAFTING_SKILLS = new Set([
  'weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring',
  'alchemy', 'refining', 'tanning', 'weaving', 'jewelcrafting',
]);

export function screenBackgroundSrc(screen: string, activeCraftingSkill?: string): string | undefined {
  if (screen === 'crafting' && activeCraftingSkill && CRAFTING_SKILLS.has(activeCraftingSkill)) {
    return `/assets/screens/screen_${activeCraftingSkill}.png`;
  }
  if (SCREEN_BACKGROUNDS.has(screen)) {
    return `/assets/screens/screen_${screen}.png`;
  }
  return undefined;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/lib/assets.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/web/src/lib/assets.ts apps/web/src/lib/assets.test.ts
git commit -m "feat: add screenBackgroundSrc helper for screen-specific art"
```

---

### Task 2: Simplify ZoneBackground to accept any image

**Files:**
- Modify: `apps/web/src/components/ZoneBackground.tsx`

**Step 1: Remove CONTEXT_SCREENS gating and activeScreen prop**

Replace the entire file with:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface ZoneBackgroundProps {
  imageSrc?: string;
}

export function ZoneBackground({ imageSrc }: ZoneBackgroundProps) {
  const visible = Boolean(imageSrc);

  // Track two layers for crossfade
  const [layers, setLayers] = useState<[string | null, string | null]>([null, null]);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const prevSrc = useRef<string | null>(null);

  useEffect(() => {
    if (!imageSrc || imageSrc === prevSrc.current) return;
    prevSrc.current = imageSrc;

    // Load new image into inactive layer, then swap
    const inactiveLayer = activeLayer === 0 ? 1 : 0;
    setLayers((prev) => {
      const next: [string | null, string | null] = [...prev];
      next[inactiveLayer] = imageSrc;
      return next;
    });

    // Small delay to let the browser paint the new image at opacity 0 before transitioning
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setActiveLayer(inactiveLayer as 0 | 1);
      });
    });
  }, [imageSrc, activeLayer]);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      {/* Layer 0 */}
      {layers[0] && (
        <img
          src={layers[0]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover image-rendering-pixelated"
          style={{
            opacity: visible && activeLayer === 0 ? 0.15 : 0,
            transition: 'opacity 500ms ease',
          }}
        />
      )}
      {/* Layer 1 */}
      {layers[1] && (
        <img
          src={layers[1]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover image-rendering-pixelated"
          style={{
            opacity: visible && activeLayer === 1 ? 0.15 : 0,
            transition: 'opacity 500ms ease',
          }}
        />
      )}
    </div>
  );
}
```

Changes from previous version:
- Removed `CONTEXT_SCREENS` set
- Removed `activeScreen` from props and interface
- `visible` now just checks `Boolean(imageSrc)` — the caller decides what to show

**Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: No errors (AppShell still passes `activeScreen` but we'll fix that in Task 3)

Note: This will cause a TS error because AppShell still passes `activeScreen` to ZoneBackground. That's OK — Task 3 fixes it immediately after.

**Step 3: Commit**

```bash
git add apps/web/src/components/ZoneBackground.tsx
git commit -m "refactor: simplify ZoneBackground to show background when imageSrc provided"
```

---

### Task 3: Update AppShell to use single backgroundSrc prop

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`

**Step 1: Replace zoneImageSrc + activeScreen with backgroundSrc**

In the `AppShellProps` interface, replace:
```typescript
  zoneImageSrc?: string;
  activeScreen?: string;
```
with:
```typescript
  backgroundSrc?: string;
```

In the function signature, replace `zoneImageSrc, activeScreen` with `backgroundSrc`.

In the JSX, change:
```tsx
<ZoneBackground imageSrc={zoneImageSrc} activeScreen={activeScreen} />
```
to:
```tsx
<ZoneBackground imageSrc={backgroundSrc} />
```

**Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: Error in `page.tsx` because it still passes old props. That's expected — Task 4 fixes it.

**Step 3: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "refactor: simplify AppShell to single backgroundSrc prop"
```

---

### Task 4: Compute background in page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add import for screenBackgroundSrc**

At line 6, the existing import is:
```typescript
import { itemImageSrc, monsterImageSrc, resourceImageSrc, skillIconSrc, zoneImageSrc } from '@/lib/assets';
```

Add `screenBackgroundSrc` to this import:
```typescript
import { itemImageSrc, monsterImageSrc, resourceImageSrc, screenBackgroundSrc, skillIconSrc, zoneImageSrc } from '@/lib/assets';
```

**Step 2: Replace AppShell props**

Find the `<AppShell` JSX (around line 1125). Replace the two old props:
```tsx
  zoneImageSrc={currentZone?.name && currentZone.name !== '???' ? zoneImageSrc(currentZone.name) : undefined}
  activeScreen={activeScreen}
```

With:
```tsx
  backgroundSrc={
    screenBackgroundSrc(activeScreen, activeCraftingSkill)
    ?? (['home', 'explore', 'combat', 'gathering', 'rest'].includes(activeScreen) && currentZone?.name && currentZone.name !== '???'
      ? zoneImageSrc(currentZone.name)
      : undefined)
  }
```

This implements the priority: screen-specific art > zone art > no background.

Variables already in scope: `activeScreen` (line 186), `activeCraftingSkill` (line 213), `currentZone` (line 243).

**Step 3: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: All clean — no errors.

**Step 4: Run all tests**

Run: `npx vitest run apps/web/src/lib/assets.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: compute screen-specific or zone background per active screen"
```
