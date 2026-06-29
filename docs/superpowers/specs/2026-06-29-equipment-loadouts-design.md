# Equipment Loadouts (Gear Quick-Swap) — Design

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan

## Summary

Let players save named **equipment loadouts** (gear sets) and quick-swap between
them out of combat — e.g. a high-magic-defence set and a high-physical-defence
set. Modelled on the existing combat-template feature and wired into bootstrap so
loadouts load with the rest of the game state.

## Goals

- Save the current equipment as a named loadout.
- Apply a saved loadout to equip its gear in one action.
- Manage loadouts (list, rename, re-snapshot, delete).
- Mirror combat-template premium limits (free vs Champion).

## Non-Goals (YAGNI)

- Mid-combat or per-encounter loadout swapping (out-of-combat only).
- Pulling items out of the stash when applying.
- Stat previews / side-by-side comparison between loadouts.
- A persistent "active loadout" flag (the active set is just whatever is
  currently equipped; the UI highlights a match client-side).

## Key Decisions

| Decision | Choice |
|----------|--------|
| When swaps happen | Out-of-combat only, mirroring how equipping already works (blocked while recovering). |
| What a loadout stores | Full snapshot of all 12 slots, including intentionally-empty slots. |
| Apply behaviour | Best-effort: equip every available item, apply empties, skip slots whose item is missing, and report the skipped slots. |
| Limits | Mirror combat templates: 5 free / 20 Champion, via the existing premium-entitlement check. |
| Storage shape | JSON snapshot on a single table (Approach A), no FK to `Item`. |

### Why a JSON snapshot rather than a child-slot table

Equipment slots are a flat, fixed-key map (`slot → item`) with no ordering or
conditions, unlike `CombatTemplateSlot`. A real FK to `Item` would force
`onDelete: SetNull`, which would silently erase the information the best-effort
**report** depends on (it could no longer distinguish "intentionally empty" from
"item was deleted"). Keeping the raw snapshot — including a cached `itemName` —
lets us re-validate ownership at apply time and still name items that have since
been deleted. We accept the lack of DB-level referential integrity because we do
not want cascade-nulling here.

## Data Model

New Prisma model:

```prisma
model EquipmentLoadout {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  name      String   @db.VarChar(64)
  slots     Json     @default("{}")   // Record<EquipmentSlot, LoadoutSlotSnapshot | null>
  createdAt DateTime @default(now())  @map("created_at")
  updatedAt DateTime @updatedAt        @map("updated_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId])
  @@map("equipment_loadouts")
}
```

`slots` contains all 12 equipment-slot keys. Each value is either `null`
(intentionally empty) or `{ itemId, itemName }` (filled). `Player` gains the
`equipmentLoadouts EquipmentLoadout[]` back-relation. A single migration adds the
table.

## Shared Types & Constants

In `packages/shared/src/types/`:

```ts
export interface LoadoutSlotSnapshot {
  itemId: string;
  itemName: string;
}

export interface EquipmentLoadoutData {
  id: string;
  playerId: string;
  name: string;
  slots: Record<EquipmentSlot, LoadoutSlotSnapshot | null>;
  createdAt: string;
  updatedAt: string;
}
```

In `packages/shared/src/constants/gameConstants.ts`, under `PREMIUM_CONSTANTS`:

```ts
LOADOUT_LIMIT_FREE: 5,
LOADOUT_LIMIT_CHAMPION: 20,
```

## Pure Apply Logic (game-engine)

A pure, side-effect-free function keeps the apply diff testable
(per the project's "pure game logic" guideline):

```ts
interface LoadoutApplyResult {
  ops: Array<{ slot: EquipmentSlot; itemId: string | null }>; // null = unequip
  unfilled: Array<{ slot: EquipmentSlot; itemName: string }>;
}

function computeLoadoutApply(
  snapshot: Record<EquipmentSlot, LoadoutSlotSnapshot | null>,
  currentEquipment: Record<EquipmentSlot, string | null>, // slot → equipped itemId
  availableItems: Map<string, EquippableItemInfo>,         // owned, non-stashed, equippable
): LoadoutApplyResult;
```

Per slot:
- snapshot value `null` → if currently occupied, emit `unequip` op.
- filled and the item is in `availableItems` and meets requirements → emit
  `equip` op (skip if already equipped in that slot).
- filled but item unavailable (sold/destroyed/stashed/under-levelled) → skip and
  add `{ slot, itemName }` to `unfilled`.

No DB access. Unit-tested with colocated `*.test.ts`.

`EquippableItemInfo` carries the fields needed to re-validate equip rules (item
type, template slot, required level/skill) so the pure function can reuse the
same rules the service enforces.

## Service Layer — `apps/api/src/services/equipmentLoadoutService.ts`

Mirrors `combatTemplateService.ts`:

- `getLoadouts(playerId): Promise<EquipmentLoadoutData[]>`
- `saveLoadout(playerId, name)` — snapshots current `PlayerEquipment` rows (with
  item names) into `slots`; enforces the limit using
  `getHasActivePremiumEntitlement` exactly as `createTemplate` does.
- `updateLoadout(playerId, id, { name?, resnapshot? })` — rename and/or
  re-capture the current gear into the snapshot.
- `deleteLoadout(playerId, id)`
- `applyLoadout(playerId, id): Promise<{ unfilled }>` — loads the player's owned
  equippable items + current equipment, calls `computeLoadoutApply`, executes all
  equip/unequip ops inside one `prisma.$transaction`, invalidates the equipment
  stats cache once (`invalidateEquipmentCache`), and returns the `unfilled`
  report.

**Refactor (DRY):** extract the equip *validation* (item type, slot match,
required level/skill) currently inline in `equipmentService.equipItem` into a
shared helper (e.g. `assertEquippable` / `isEquippable`) reused by both
`equipItem` and the loadout apply path, so equip rules live in one place.

All loadout lookups are scoped by `playerId` (ownership enforced), matching the
combat-template service's `findFirst({ where: { id, playerId } })` pattern.

## API Routes — `apps/api/src/routes/loadouts.ts`

Mirrors `templates.ts`, mounted at `/api/v1/loadouts`, behind `authenticate`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List the player's loadouts. |
| POST | `/` | Create from current gear. Body `{ name }`. |
| PATCH | `/:id` | Rename and/or re-snapshot. Body `{ name?, resnapshot? }`. |
| DELETE | `/:id` | Delete a loadout. |
| POST | `/:id/apply` | Apply the loadout. |

`POST /:id/apply` calls `assertNotRecovering(playerId)` first (same guard as
`/equipment/equip`), then returns:

```jsonc
{
  "success": true,
  "stateUpdates": { "equipment": { /* slot → item DTO */ }, "inventoryUsedSlots": 0 },
  "unfilled": [{ "slot": "head", "itemName": "Iron Helm" }]
}
```

`stateUpdates` uses the same `equipment` map + `inventoryUsedSlots` shape the
existing equip/unequip routes return (via `fetchEquipmentMap` /
`fetchInventoryMeta`), so the client's existing state-update handling applies
unchanged. Request bodies validated with Zod.

## Frontend

- `apps/web/src/lib/api/loadouts.ts` — API client mirroring `lib/api/templates.ts`.
- `Equipment.tsx` — a **Loadouts** panel:
  - List of saved loadouts with **Apply**, rename, and delete controls, plus a
    **Save current gear** button.
  - On apply, feed the returned `stateUpdates` through the existing state-update
    handler; if `unfilled` is non-empty, show a toast listing the skipped slots
    (via the existing toast queue system).
  - Highlight a loadout row when current equipment exactly matches its snapshot
    (computed client-side; no stored flag).
- **Bootstrap wiring:** add `loadouts: { loadouts }` to `getGameBootstrap`
  (alongside `templates`), thread it through `useGameBootstrap` →
  `useGameController` state so loadouts are available on load.

## Testing

- **game-engine:** `computeLoadoutApply` unit tests — all-empty snapshot, missing
  items, partial fills, already-equipped no-op, under-levelled item skipped.
- **api:** `equipmentLoadoutService.test.ts` — save, limit enforcement (free vs
  Champion), apply best-effort, missing/stashed item reporting, recovering guard;
  plus `loadouts.ts` route tests.
- **web:** light component test for the Loadouts panel and a bootstrap-inclusion
  assertion.

## Edge Cases

- **Item only valid in one slot:** since `template.slot` fixes an item's slot,
  applying can never create a cross-slot conflict (no item can target two slots).
- **Stashed item:** treated as unavailable → reported as unfilled (no auto-pull
  from stash).
- **Broken durability:** still equippable (matches current `equipItem`
  behaviour); contributes zero stats until repaired.
- **Recovering player:** apply is rejected up-front by `assertNotRecovering`,
  consistent with manual equip.
- **Deleted item:** cached `itemName` lets the report still name it.
