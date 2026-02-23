# Playwright E2E Testing Design

## Goal

Catch UI regressions across all critical flows with comprehensive Playwright tests hitting the real backend (API + Postgres + Redis).

## Architecture

Standalone `tests/e2e/` directory at monorepo root (not a workspace). Tests boot the full stack, create isolated test users per spec file, and run in parallel.

## Project Structure

```
tests/e2e/
├── playwright.config.ts
├── package.json              # Playwright deps (standalone)
├── tsconfig.json
├── fixtures/
│   ├── auth.fixture.ts       # Authenticated page (register + login)
│   └── game.fixture.ts       # Game-ready (auth + seeded state)
├── helpers/
│   ├── api.ts                # Direct API calls for test preconditions
│   └── selectors.ts          # Shared locators
├── auth/
│   ├── register.spec.ts
│   ├── login.spec.ts
│   └── logout.spec.ts
├── dashboard/
│   ├── dashboard.spec.ts
│   └── attributes.spec.ts
├── exploration/
│   └── exploration.spec.ts
├── combat/
│   ├── encounter-sites.spec.ts
│   └── combat-playback.spec.ts
├── inventory/
│   ├── inventory.spec.ts
│   └── equipment.spec.ts
├── crafting/
│   ├── crafting.spec.ts
│   └── forge.spec.ts
├── gathering/
│   └── gathering.spec.ts
├── zones/
│   └── zone-travel.spec.ts
├── hp/
│   ├── rest.spec.ts
│   └── knockout-recovery.spec.ts
├── skills/
│   └── skills.spec.ts
├── bestiary/
│   └── bestiary.spec.ts
├── achievements/
│   └── achievements.spec.ts
├── leaderboard/
│   └── leaderboard.spec.ts
├── world-events/
│   └── world-events.spec.ts
└── admin/
    └── admin.spec.ts
```

## Test Environment

- **Global setup**: starts Docker (Postgres + Redis), API, Next.js dev server
- **Global teardown**: stops servers
- **User isolation**: each spec file registers a fresh user (`e2e-<feature>-{timestamp}`)
- **Parallel execution**: 4 workers, no shared state between specs

## Configuration

| Setting | Value |
|---------|-------|
| Browser | Chromium only |
| Base URL | `http://localhost:3002` |
| API URL | `http://localhost:4000` |
| Retries | 0 local, 1 CI |
| Workers | 4 |
| Test timeout | 30s |
| Navigation timeout | 10s |
| Screenshots | On failure only |
| Traces | On first retry |

## Fixtures

**auth.fixture.ts** — extends base test with authenticated page. Registers unique user, logs in, provides `page` at `/game`.

**game.fixture.ts** — extends auth with seeded game state via `helpers/api.ts` (items, zones, encounters).

## ApiHelper (`helpers/api.ts`)

Direct API calls for test preconditions (no UI navigation for setup):

- `register()`, `login()` — auth
- `grantItems()`, `setPlayerHP()`, `discoverZones()` — state setup
- `spendTurns()`, `createEncounterSite()` — scenario setup
- `setPlayerLevel()`, `grantSkillXP()` — progression setup
- `setAdminRole()` — admin access

## Coverage Map (22 spec files, ~150-200 test cases)

### Auth (3 specs)
- **register** — happy path, validation errors (short username, weak password, duplicate email), redirect after success
- **login** — happy path, wrong credentials, redirect if authenticated
- **logout** — clears session, redirects to login, blocks game access

### Dashboard (2 specs)
- **dashboard** — turns/HP/level/XP display, nav to all screens, activity log, quick rest
- **attributes** — allocate points (6 stats), stat changes reflected, disabled at 0 points

### Exploration (1 spec)
- Turn slider + presets, probability preview, start + playback, skip playback, encounter/resource discovery, zone progress

### Combat (2 specs)
- **encounter-sites** — list with pagination/filter/sort, abandon, site details (mob count, rooms)
- **combat-playback** — start, round log animation, damage/crit/miss, victory rewards (XP/loot/skill XP), defeat/flee, multi-fight queue, durability loss

### Inventory (2 specs)
- **inventory** — grid with rarity borders, detail modal (stats/durability), repair/salvage/drop/use actions, empty slots
- **equipment** — 11 slots, equip/unequip from modal, stat deltas (green/red), total stats panel, durability bar, weight warnings

### Crafting (2 specs)
- **crafting** — skill tabs (8), recipe list/filter, material requirements, quantity selector, disabled states, craft success + log
- **forge** — eligible items, upgrade rarity (sacrifice, success %, cost), reroll bonus stats

### Gathering (1 spec)
- Skill tabs (3), node list + pagination/filter, node details, mine + turn slider, playback, XP gain

### Zones (1 spec)
- Zone map + connections, travel cost, travel action, breadcrumb return, discovery tracking, locked zones

### HP (2 specs)
- **rest** — turn slider, rest estimate, rest action, disabled at full HP
- **knockout-recovery** — restricted actions, recovery cost, recover action, HP restored

### Skills (1 spec)
- 14 skills with level/XP/daily cap, progress bar, cap indicator, level-up state

### Bestiary (1 spec)
- Discovered mobs, kill counts, zone distribution, prefix variants, undiscovered hidden

### Achievements (1 spec)
- Categories, unclaimed badge, claim reward, active title, progress tracking

### Leaderboard (1 spec)
- Rankings, season rankings, sort/filter

### World Events (1 spec)
- Active events, buff/debuff descriptions, effect values, empty state

### Admin (1 spec)
- Authorized vs unauthorized access, test data generation, debug utilities

## npm Scripts

```json
{
  "test:e2e": "npx playwright test --config tests/e2e/playwright.config.ts",
  "test:e2e:ui": "npx playwright test --config tests/e2e/playwright.config.ts --ui"
}
```

## Prerequisites

1. Docker running (`docker-compose up -d`)
2. Database migrated + seeded
3. API + Web servers running (or auto-started by Playwright `webServer`)

## Reporting

- Terminal: default list reporter
- HTML report on failure (`playwright-report/`)
- `.gitignore`: report dir, screenshots, traces

## Future CI

Designed to support GitHub Actions: start Docker → migrate → seed → boot servers → run tests → upload failure artifacts. Not built as part of this work.
