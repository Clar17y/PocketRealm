# Admin Panel Design

## Overview

In-game admin panel for developer/admin use. Self-targeting only (admins modify their own account). No audit logging. Accessed via `/admin` route in the existing Next.js app, gated by `Player.role === 'admin'`.

## Architecture

- **Backend**: Single route file `apps/api/src/routes/admin.ts`, guarded by `authenticate` + `requireAdmin` middleware
- **Frontend**: `/admin` page with 4 tabbed sections (Player, Items, World, Zones)
- **Auth**: Existing `Player.role` field (varchar, default `"player"`) + JWT `role` claim. Admin role assigned via direct DB update only

## Middleware

New `requireAdmin` middleware in `apps/api/src/middleware/admin.ts`:
- Runs after `authenticate`
- Checks `req.player.role === 'admin'` → 403 Forbidden if not
- Applied to all admin routes

## API Endpoints

All prefixed with `/api/v1/admin/`. All POST endpoints target `req.player.playerId` (self only).

### Player Tab

| Method | Path | Params | Implementation |
|--------|------|--------|----------------|
| POST | `/admin/turns/grant` | `{ amount: number }` | `refundPlayerTurns()` from turnBankService |
| POST | `/admin/player/level` | `{ level: number }` | Direct Prisma update on `characterLevel`, `characterXp`, `attributePoints` |
| POST | `/admin/player/xp` | `{ amount: number }` | Direct Prisma increment on `characterXp`, recalculate level |
| POST | `/admin/player/attributes` | `{ attributePoints?, attributes?: Partial<PlayerAttributes> }` | Direct Prisma update |

### Items Tab

| Method | Path | Params | Implementation |
|--------|------|--------|----------------|
| GET | `/admin/items/templates` | `?search&type` | Prisma query on ItemTemplate |
| POST | `/admin/items/grant` | `{ templateId, rarity?, quantity? }` | `addStackableItem()` for stackables; `prisma.item.create()` with `rollBonusStatsForRarity()` for equipment |

### World Tab

| Method | Path | Params | Implementation |
|--------|------|--------|----------------|
| GET | `/admin/events/templates` | (none) | Return worldEventTemplates constant |
| POST | `/admin/events/spawn` | `{ templateId, zoneId }` | `spawnWorldEvent()` from worldEventService |
| POST | `/admin/events/:id/cancel` | (none) | Update event status to `'expired'` |
| GET | `/admin/mobs` | (none) | Prisma query on MobTemplate |
| POST | `/admin/boss/spawn` | `{ mobTemplateId, zoneId }` | `createBossEncounter()` from bossEncounterService |

### Zones Tab

| Method | Path | Params | Implementation |
|--------|------|--------|----------------|
| GET | `/admin/zones` | (none) | All zones with connections |
| POST | `/admin/zones/discover-all` | (none) | Upsert PlayerZoneDiscovery for all zones |
| POST | `/admin/zones/teleport` | `{ zoneId }` | Direct update `Player.currentZoneId` |
| POST | `/admin/encounter/spawn` | `{ mobFamilyId, zoneId, size }` | Build encounter site using `buildEncounterSiteMobs()` + `prisma.encounterSite.create()` |

## Behavioral Changes (Outside Admin Routes)

### PvP ELO Protection

In `pvpService.challenge()`: when either combatant has `role === 'admin'`, set both `attackerRatingChange` and `defenderRatingChange` to 0. Match still runs and records normally, just no ELO movement.

### Admin Tag on Leaderboards

- Add `isAdmin: boolean` to `LeaderboardEntry` interface
- Include role in Redis metadata during `refreshAllLeaderboards()`
- `LeaderboardTable` component renders "ADMIN" badge next to admin usernames (same pattern as existing bot indicator)
- Same badge on ArenaScreen ladder view

## Frontend

### Navigation

Admin link (small icon/button) appears in game navigation only when `player.role === 'admin'`. Links to `/admin`.

### Page Structure

Single `/admin` page with 4 tabs:

**Player tab**: Form fields for turns (number input + "Grant" button), level (number input + "Set" button), XP (number input + "Grant" button), attributes (number inputs for points and each attribute + "Set" button).

**Items tab**: Searchable item template list with type filter. Select a template, choose rarity from dropdown, set quantity, click "Grant".

**World tab**: Event template picker with zone selector + "Spawn Event" button. Active events list with "Cancel" button per event. Mob template picker with zone selector + "Spawn Boss" button.

**Zones tab**: Zone list with "Teleport" button per zone. "Discover All Zones" button. Mob family picker with zone + size selector + "Spawn Encounter" button.

### UI Approach

- Reuse existing RPG theme variables and component patterns
- Simple forms, not a complex dashboard
- Confirmation step + success/error toast per action

## Not In Scope

- Audit logging
- Targeting other players
- Self-service admin role assignment
- Custom event creation (templates only)
- Admin user management UI
