# Phase 4 Testing (Exploration & Combat API)

Phase 4 is backend-complete (API endpoints + DB writes). UI wiring is planned later (Phase 7–8), but you can validate the loop now via seed data + API calls.

## What’s Covered

- Turns are spent via `TurnBank` and stored lazily (`lastRegenAt`).
- Exploration:
  - `GET /api/v1/exploration/estimate`
  - `POST /api/v1/exploration/start` (writes an `activity_logs` row)
- Zones:
  - `GET /api/v1/zones` (starter zones + zones seen in activity logs are “discovered”)
- Combat:
  - `POST /api/v1/combat/start` (writes an `activity_logs` row, updates `player_skills`, grants loot into `items`, updates `player_bestiary`)
  - `GET /api/v1/combat/logs/:id`

## What’s Not Covered Yet (By Design)

- No dedicated Exploration/Combat screens in the web app yet (see Phase 7 and Phase 8 in `docs/superpowers/plans/mvp-implementation-plan.md`).
- No inventory/equipment UI or equip/unequip endpoints yet (Phase 5).
- Combat stats are still “MVP-simple”: equipment stats are summed from `item_templates.base_stats` and used by the placeholder `buildPlayerCombatStats`.
- Durability loss/repair isn’t implemented yet (Phase 5.3).

## Local Setup (One Time)

1) Start local DBs:

```bash
docker-compose up -d
```

2) Run migrations:

```bash
npm run db:migrate
```

3) Seed minimal starter content (zones/mobs/items/drop tables):

```bash
npm run db:seed
```

4) Start API:

```bash
npm run dev:api
```

API defaults:
- `http://localhost:4000`

## Manual Smoke Test (PowerShell)

1) Register + login (copy `accessToken`):

```powershell
$base = "http://localhost:4000"

# Register
Invoke-RestMethod -Method Post "$base/api/v1/auth/register" -ContentType "application/json" -Body (
  @{ username = "testuser"; email = "test@example.com"; password = "password123" } | ConvertTo-Json
)

# Login (save token)
$login = Invoke-RestMethod -Method Post "$base/api/v1/auth/login" -ContentType "application/json" -Body (
  @{ email = "test@example.com"; password = "password123" } | ConvertTo-Json
)
$token = $login.accessToken
```

2) List zones (note `id` for “Forest Edge”):

```powershell
$zones = Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } -Uri "$base/api/v1/zones"
$zones.zones | Format-Table name,id,discovered
```

3) Estimate exploration odds:

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } -Uri "$base/api/v1/exploration/estimate?turns=100"
```

4) Start exploration (replace `zoneId`):

```powershell
$zoneId = ($zones.zones | Where-Object { $_.name -eq "Forest Edge" } | Select-Object -First 1).id

$explore = Invoke-RestMethod -Method Post "$base/api/v1/exploration/start" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (
  @{ zoneId = $zoneId; turns = 100 } | ConvertTo-Json
)
$explore.mobEncounters | Format-Table turnOccurred,mobName,mobTemplateId
```

5) Start combat (optionally use a `mobTemplateId` returned from exploration):

```powershell
$combat = Invoke-RestMethod -Method Post "$base/api/v1/combat/start" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (
  @{ zoneId = $zoneId; attackSkill = "melee" } | ConvertTo-Json
)
$combat.rewards
```

6) Fetch combat log playback (replace `logId` from combat response):

```powershell
Invoke-RestMethod -Headers @{ Authorization = "Bearer $token" } -Uri "$base/api/v1/combat/logs/$($combat.logId)"
```

## UI Plan

UI integration is explicitly in the MVP plan:
- Phase 7: layout + exploration UI
- Phase 8: combat UI + inventory UI

If you want faster end-to-end validation, we can pull a minimal “dev harness” UI forward (simple zone selector, turn slider, “explore”, “fight” buttons) without waiting for the full polish passes.
