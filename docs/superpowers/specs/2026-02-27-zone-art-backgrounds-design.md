# Zone Art Backgrounds Design

## Goal

Use zone art as a subtle atmospheric background on context-aware screens (Exploration, Combat, Gathering, Rest). Crossfade between zones.

## Decisions

- **Scope:** Context-aware screens only (`explore`, `combat`, `gathering`, `rest`)
- **Opacity:** 10-20% (target 15%) — subtle mood tint, not dominant
- **Transition:** 500ms crossfade when zone changes
- **Cards:** PixelCards stay fully opaque — no transparency changes

## Architecture

Single `<ZoneBackground>` component rendered in AppShell, behind all content.

### ZoneBackground component

- Two stacked `<img>` elements for crossfade (active/inactive swap)
- `position: fixed; inset: 0; object-fit: cover; z-index: 0`
- `image-rendering: pixelated` for pixel art consistency
- `opacity` toggles between 0 and 0.15 with `transition: opacity 500ms ease`
- Dark overlay div (`bg-black/85`) on top for readability
- Only visible when `activeScreen` is in the context-aware set
- Hidden (opacity 0) on all other screens

### Prop flow

```
page.tsx → AppShell (zoneImageSrc, activeScreen) → ZoneBackground
```

`page.tsx` computes: `zoneImageSrc(currentZone.name)` and passes `activeScreen`.

## Files

| File | Change |
|------|--------|
| `components/ZoneBackground.tsx` | New — crossfade background component |
| `components/AppShell.tsx` | Add props, render ZoneBackground |
| `app/game/page.tsx` | Pass zone image + active screen to AppShell |
