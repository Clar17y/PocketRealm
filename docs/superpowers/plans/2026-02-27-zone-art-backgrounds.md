# Zone Art Backgrounds Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the current zone's pixel art as a subtle atmospheric background (15% opacity, crossfade) on context-aware screens (explore, combat, gathering, rest).

**Architecture:** A single `<ZoneBackground>` component lives in AppShell. It uses two stacked `<img>` elements to crossfade between zone images. AppShell receives `zoneImageSrc` and `activeScreen` as props from `page.tsx`.

**Tech Stack:** React, Next.js Image (or native `<img>`), CSS transitions, TypeScript

---

### Task 1: Create ZoneBackground component

**Files:**
- Create: `apps/web/src/components/ZoneBackground.tsx`

**Step 1: Create the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

const CONTEXT_SCREENS = new Set(['explore', 'combat', 'gathering', 'rest']);

interface ZoneBackgroundProps {
  imageSrc?: string;
  activeScreen?: string;
}

export function ZoneBackground({ imageSrc, activeScreen }: ZoneBackgroundProps) {
  const visible = Boolean(imageSrc && activeScreen && CONTEXT_SCREENS.has(activeScreen));

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

**Step 2: Verify no TypeScript errors**

Run: `npx tsc apps/web/src/components/ZoneBackground.tsx --noEmit --esModuleInterop --jsx react-jsx --moduleResolution bundler --strict`

If tsc path-based check doesn't work in this monorepo, use: `npm run typecheck`

Expected: No errors related to ZoneBackground.

**Step 3: Commit**

```bash
git add apps/web/src/components/ZoneBackground.tsx
git commit -m "feat: add ZoneBackground crossfade component"
```

---

### Task 2: Wire ZoneBackground into AppShell

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`

**Step 1: Add props and render ZoneBackground**

Add import at top:
```tsx
import { ZoneBackground } from '@/components/ZoneBackground';
```

Extend `AppShellProps` interface — add two optional props:
```tsx
zoneImageSrc?: string;
activeScreen?: string;
```

Destructure them in the function signature.

Render `<ZoneBackground>` immediately after the opening `<div>`, before the header:
```tsx
<ZoneBackground imageSrc={zoneImageSrc} activeScreen={activeScreen} />
```

The main content `<div>` already has the dark background color which sits on top, and the header has `z-40`. ZoneBackground uses `z-index: 1`, so stacking is correct.

**Step 2: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: No errors related to AppShell.

**Step 3: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "feat: render ZoneBackground in AppShell"
```

---

### Task 3: Pass zone image and active screen from page.tsx

**Files:**
- Modify: `apps/web/src/app/game/page.tsx`

**Step 1: Add props to AppShell invocation**

Find the `<AppShell` JSX (~line 1125). Add two props:

```tsx
zoneImageSrc={currentZone?.name && currentZone.name !== '???' ? zoneImageSrc(currentZone.name) : undefined}
activeScreen={activeScreen}
```

`zoneImageSrc` (the function) is already imported at line 6. `activeScreen` is already destructured from `useGameController` at line 186. `currentZone` is at line 243. No new imports needed.

**Step 2: Make AppShell's main container transparent**

The AppShell root `<div>` has `bg-[var(--rpg-background)]` which paints a solid dark color over the fixed background. Change this so the zone art can show through:

In `AppShell.tsx`, on the root div, change:
```
bg-[var(--rpg-background)]
```
to:
```
bg-[var(--rpg-background)]/95
```

This lets 5% of the zone art bleed through the main area. Combined with the image's own 15% opacity, the effective visibility is very subtle but present.

**Step 3: Verify no TypeScript errors**

Run: `npm run typecheck`
Expected: No errors.

**Step 4: Manual test**

Run: `npm run dev:web`

1. Log in, navigate to a zone with art (e.g., Forest Edge)
2. Go to Exploration screen — should see faint zone art behind the dark UI
3. Switch to Inventory — zone art should fade out
4. Travel to a different zone — art should crossfade over 500ms
5. Check Combat and Gathering screens — art should be visible
6. Check Skills, Equipment, Crafting — art should NOT be visible

**Step 5: Commit**

```bash
git add apps/web/src/app/game/page.tsx apps/web/src/components/AppShell.tsx
git commit -m "feat: wire zone art backgrounds to context-aware screens"
```
