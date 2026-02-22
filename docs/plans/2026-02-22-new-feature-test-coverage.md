# Test Coverage for Main-Merged Features

## Scope

Cover untested features merged from main: tutorial system, admin panel, player settings, tutorial exploration path.

## Test Files

### 1. `apps/api/src/middleware/admin.test.ts` (~5 tests)
- `requireAdmin` allows admin role
- Throws 403 for non-admin roles
- Throws when `req.player` undefined or role missing

### 2. `apps/api/src/routes/admin.test.ts` (~15-20 tests)
High-value endpoints: grant turns, grant items, spawn event, cancel event, spawn boss, spawn encounter, teleport, discover all zones, spawn resource node.

### 3. `apps/api/src/routes/player.settings.test.ts` (~8-10 tests)
- Valid settings accepted (each field)
- Empty body rejected
- Validation: combatLogSpeedMs multiples of 100, explorationSpeedMs multiples of 10, quickRestHealPercent multiples of 25
- Returns only updated fields

### 4. Expand `apps/api/src/routes/player.tutorial.test.ts` (~5 additional tests)
- Route-level: successful step advance updates DB
- Step 9 triggers incrementStats + checkAchievements + emitAchievementNotifications
- Player not found returns 404
- Zod rejects non-integer step

### 5. `apps/api/src/routes/exploration/start.tutorial.test.ts` (~6-8 tests)
- tutorialStep===1 forces 100 turns
- Single ambush at turn 50
- Selects Field Mouse with no prefix
- Non-tutorial path uses simulateExploration
- Victory/defeat paths work normally

## Conventions
- Unit tests with mocked Prisma (vi.mock + __mocks__/database.ts)
- vi.mock for peer services
- Inline Express mocks for middleware/routes
- beforeEach(vi.clearAllMocks)
- No integration/HTTP tests (consistent with codebase)
