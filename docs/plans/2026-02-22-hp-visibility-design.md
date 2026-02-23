# HP Visibility & Low-HP Warnings

## Problem

Exploration and Combat screens don't show current HP. Players can unknowingly start dangerous actions while at low health.

## Solution

1. **Inline HP bar** on Exploration and Combat screens
2. **Confirmation dialog** when starting actions below 25% HP
3. **Settings toggle** to disable the warning

## Inline HP Bar

Compact `StatBar` placed at the top of both screens (below knockout banner if present, above main content).

Shows: current/max HP numbers, health bar (`color="health"`, `size="sm"`), regen rate (+X/s). HP number color: green (>50%), yellow (25–50%), red (<25%). When recovering: shows "Knocked Out" with recovery cost.

**Exploration** — between knockout banner and zone header card.
**Combat** — between knockout banner and encounter list.

Data source: `hpState` from `useGameController` (already polled every 10s).

## Low-HP Confirmation Dialog

Triggered when clicking "Start Exploration" or "Fight" with `currentHp / maxHp < 0.25`.

- Title: "Low HP Warning"
- Message: "Your health is low (X / Y HP). Exploring or fighting in this state is risky."
- Buttons: "Proceed Anyway" (continues action) / "Cancel" (dismisses)
- Same dialog for both exploration and combat
- Skipped entirely when `lowHpWarning` preference is `false`

Threshold constant: `LOW_HP_WARNING_THRESHOLD: 0.25` in `gameConstants.ts`.

## Settings Toggle

Added to existing **Combat** section in Settings screen, after auto-potion threshold.

- Label: "Low HP Warning"
- Description: "Show confirmation when starting actions below 25% HP"
- Default: `true` (enabled)

## Backend Changes

- **Prisma:** Add `lowHpWarning Boolean @default(true) @map("low_hp_warning")` to Player model
- **Migration:** Single column addition
- **Settings route:** Extend `PATCH /api/v1/player/settings` Zod schema with `lowHpWarning: z.boolean().optional()`
- **GET /player** automatically includes the new column

## Frontend Changes

- **Exploration.tsx:** Add `currentHp`, `maxHp`, `regenPerSecond` props. Render `StatBar` at top. Add confirmation check to start handler.
- **CombatScreen.tsx:** Already receives `hpState`. Render `StatBar` at top. Add confirmation check to fight handler.
- **page.tsx (Settings):** Add `ToggleSwitch` for `lowHpWarning` in Combat section.
- **page.tsx (wiring):** Pass HP props to Exploration. Pass `lowHpWarning` to both screens.
- **useGameController or page.tsx:** Add `lowHpWarning` state + handler following existing preference pattern.

## No New Components

Reuses: `StatBar`, `ToggleSwitch`, existing modal/dialog patterns. No new API endpoints — extends existing settings PATCH.
