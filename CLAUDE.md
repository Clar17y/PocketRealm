# Adventure RPG - Project Instructions

## Overview

Turn-based async RPG with real-time turn regeneration. Players explore, fight mobs, craft gear, and progress skills.

**Tech Stack:**
- Frontend: Next.js 16 (TypeScript) PWA → Vercel
- Backend: Node.js Express 4 (TypeScript) → Render
- Database: PostgreSQL 16 → Neon (prod) / Docker (local)
- Cache: Redis 7 → Upstash (prod) / Docker (local)
- Auth: Custom JWT (access + refresh tokens)
- ORM: Prisma 6
- Validation: Zod
- Testing: Vitest

## Git Workflow

**All work MUST be done in git worktrees.** Do not work directly in the main clone. Use the provided scripts to create and tear down worktrees — they handle database isolation, env files, and dependencies automatically.

```bash
# Create a worktree (creates branch, DB, env files, installs deps, migrates, seeds)
./scripts/setup-worktree.sh feature-branch-name

# Create without seeding the database
./scripts/setup-worktree.sh feature-branch-name --no-seed

# List active worktrees
git worktree list

# Remove worktree, drop its database, and delete the branch
./scripts/teardown-worktree.sh feature-branch-name

# Remove worktree + DB but keep the branch
./scripts/teardown-worktree.sh feature-branch-name --keep-branch

# Non-interactive teardown (skip confirmation — use from CI/agents)
./scripts/teardown-worktree.sh feature-branch-name -y
```

Each worktree gets its own PostgreSQL database (`adventure_<branch_name>`), so multiple worktrees with different migrations can run concurrently without conflicts.

## Project Structure

```
adventure-rpg/                     # npm workspaces monorepo
├── apps/
│   ├── api/                       # Express backend (port 4000)
│   │   ├── src/
│   │   │   ├── index.ts           # App entry, middleware, route registration
│   │   │   ├── routes/            # 12 route files (39 endpoints)
│   │   │   ├── services/          # 11 service files + tests
│   │   │   ├── middleware/        # auth.ts, errorHandler.ts
│   │   │   └── __mocks__/         # Test mocks (database)
│   │   ├── .env.example
│   │   └── vitest.config.ts
│   │
│   └── web/                       # Next.js 16 frontend (port 3002)
│       ├── src/
│       │   ├── app/               # Next.js App Router
│       │   │   ├── game/          # Main game page + useGameController
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── components/
│       │   │   ├── screens/       # 10+ game screens (Dashboard, Combat, etc.)
│       │   │   ├── combat/        # Combat playback UI
│       │   │   ├── exploration/   # Exploration playback UI
│       │   │   ├── playback/      # Turn-based animation
│       │   │   ├── common/        # Shared components (Pagination, PixelCard, etc.)
│       │   │   └── ui/            # Base UI primitives
│       │   ├── hooks/             # useAuth
│       │   └── lib/               # api.ts, format.ts, assets.ts, rarity.ts
│       ├── .env.example
│       ├── tailwind.config.ts
│       └── vitest.config.ts
│
├── packages/
│   ├── shared/                    # Types, constants, utilities (no deps)
│   │   └── src/
│   │       ├── types/             # player, combat, item, skill, hp, mobPrefix
│   │       ├── constants/
│   │       │   ├── gameConstants.ts   # ALL tunable game balance values
│   │       │   └── mobPrefixes.ts     # Mob prefix definitions + stat mods
│   │       └── index.ts
│   │
│   ├── game-engine/               # Pure game logic (no I/O, no side effects)
│   │   └── src/
│   │       ├── combat/            # combatEngine, damageCalculator, mobPrefixes
│   │       ├── turns/             # turnCalculator
│   │       ├── skills/            # xpCalculator
│   │       ├── exploration/       # probabilityModel, encounterChest
│   │       ├── hp/                # hpCalculator, fleeMechanics
│   │       ├── crafting/          # craftingCrit
│   │       ├── items/             # itemRarity
│   │       └── index.ts
│   │
│   └── database/                  # Prisma schema and client
│       ├── prisma/
│       │   ├── schema.prisma      # ~470 lines, 30+ models
│       │   ├── seed.ts            # Database seeding
│       │   └── migrations/        # 23 migration files
│       └── src/
│           └── index.ts           # Prisma client singleton
│
├── docs/
│   ├── plans/                     # 28+ feature design documents
│   ├── testing/                   # Manual testing phase notes
│   ├── ui/                        # Screen state documentation
│   ├── assets/                    # Asset workflow, color palette
│   └── sql/                       # Migration helpers
│
├── docker-compose.yml             # PostgreSQL 16 + Redis 7
├── package.json                   # Workspace root
├── tsconfig.json                  # Base config with project references
└── .mcp.json                      # MCP server config
```

## Commands

```bash
# Install all dependencies
npm install

# Start local dev (all services concurrently)
npm run dev

# Start individual services
npm run dev:web        # Frontend only (port 3002)
npm run dev:api        # Backend only (port 4000)

# Build
npm run build          # Build everything (packages → apps)
npm run build:api      # Build shared + game-engine + database + api
npm run build:web      # Build shared + web
npm run build:packages # Build shared + game-engine + database only

# Database
npm run db:generate    # Generate Prisma client
npm run db:migrate     # Run migrations (dev mode)
npm run db:seed        # Seed database
npm run db:studio      # Open Prisma Studio

# Type checking
npm run typecheck      # Uses tsc -b (project references)

# Linting
npm run lint           # ESLint across all .ts/.tsx files

# Testing
npm run test           # All tests across all workspaces
npm run test:engine    # Game engine unit tests only
npm run test:api       # API tests only

# Cleanup
npm run clean          # Remove all build artifacts and emitted JS
```

## Local Development

```bash
# 1. Start Postgres + Redis containers
docker-compose up -d

# 2. Create .env in apps/api (copy from .env.example)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/adventure
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-dev-secret-min-32-chars-long
PORT=4000
CORS_ORIGIN=http://localhost:3002
NODE_ENV=development

# 3. Create .env.local in apps/web (copy from .env.example)
NEXT_PUBLIC_API_URL=http://localhost:4000

# 4. Setup
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

**Ports:** Web: 3002, API: 4000, PostgreSQL: 5433, Redis: 6379

## Key Design Decisions

### Turn Economy
- 1 turn/second regeneration
- 64,800 bank cap (18 hours)
- 86,400 starting turns for new players
- Lazy calculation: compute turns on request, not via cron
- Redis stores `last_regen_at` timestamp per player

### Combat Resolution
- Server-authoritative, instant resolution (max 100 rounds)
- D&D-style: d20 + modifiers vs defense
- Pure functions in `packages/game-engine` for testability
- Returns full combat log for client playback animation
- Mob prefix system for variant difficulty

### Exploration
- Per-turn probability model: `1 - (1 - p)^n`
- Player chooses turn investment via slider (10–10,000 turns)
- Outcomes: ambush encounters, encounter sites (small/medium/large), resource nodes, treasure chests, zone exits

### Crafting & Items
- Crit system: base chance + skill level + luck stat
- Item rarity progression: common → uncommon → rare → epic → legendary
- Forge upgrade/reroll with sacrificial items
- Salvage for partial material refund
- Equipment durability with repair costs and max durability decay

### HP System
- Base HP + vitality scaling (5 HP per vitality)
- Passive regen: 0.4 HP/second
- Rest: spend turns for HP recovery
- Knockout/recovery state with turn cost to exit

### Zone System
- Directed graph of zone connections
- Wild and town zones (crafting only in towns)
- Travel costs turns; breadcrumb free return
- Zone discovery tracking

### Auth
- Custom JWT (access + refresh tokens)
- Access token: 15 min expiry (configurable via `ACCESS_TOKEN_TTL_MINUTES`)
- Refresh token: 30 days sliding expiry (configurable via `REFRESH_TOKEN_TTL_DAYS`), rotated on refresh and stored in DB
- No external auth provider dependency

## Coding Guidelines

1. **KISS** - Implement the simplest solution that satisfies the requirement. Avoid unnecessary abstractions and over-engineering
2. **DRY** - Re-use existing utilities, hooks, and components instead of duplicating logic. Extract shared code into well-named helpers
3. **Type Safety** - Strict TypeScript, no `any`
4. **Pure Game Logic** - `game-engine` has no side effects, fully testable
5. **Service Layer** - `apps/api/src/services/` for all business logic and DB access
6. **Route Handlers** - `apps/api/src/routes/` orchestrate request/response, delegate to services
7. **Constants Central** - All tunable values in `packages/shared/src/constants/gameConstants.ts`
8. **Zod Validation** - Request validation at API boundaries
9. **Prisma Transactions** - Used for multi-step DB operations to ensure consistency
10. **Extract Shared Patterns** - When implementing UI or logic that duplicates an existing pattern across 2+ files, proactively extract it into a shared component (`components/common/`) or utility. Don't wait to be asked

## grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

### When to Use grepai (REQUIRED)

Use `grepai search` INSTEAD OF Grep/Glob/find for:
- Understanding what code does or where functionality lives
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Exploring unfamiliar parts of the codebase
- Any search where you describe WHAT the code does rather than exact text

### When to Use Standard Tools

Only use Grep/Glob when you need:
- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.ts`)

### Fallback

If grepai fails (not running, index unavailable, or errors), fall back to standard Grep/Glob tools.

### Usage

```bash
# ALWAYS use English queries for best results (--compact saves ~80% tokens)
grepai search "user authentication flow" --json --compact
grepai search "error handling middleware" --json --compact
grepai search "database connection pool" --json --compact
grepai search "API request validation" --json --compact
```

### Query Tips

- **Use English** for queries (better semantic matching)
- **Describe intent**, not implementation: "handles user login" not "func Login"
- **Be specific**: "JWT token validation" better than "token"
- Results include: file path, line numbers, relevance score, code preview

### Call Graph Tracing

Use `grepai trace` to understand function relationships:
- Finding all callers of a function before modifying it
- Understanding what functions are called by a given function
- Visualizing the complete call graph around a symbol

#### Trace Commands

**IMPORTANT: Always use `--json` flag for optimal AI agent integration.**

```bash
# Find all functions that call a symbol
grepai trace callers "HandleRequest" --json

# Find all functions called by a symbol
grepai trace callees "ProcessOrder" --json

# Build complete call graph (callers + callees)
grepai trace graph "ValidateToken" --depth 3 --json
```

### Workflow

1. Start with `grepai search` to find relevant code
2. Use `grepai trace` to understand function relationships
3. Use `Read` tool to examine files from results
4. Only use Grep for exact string searches if needed

## File Naming

- Components: `PascalCase.tsx`
- Utilities: `camelCase.ts`
- Types: `camelCase.types.ts`
- Constants: `camelCase.constants.ts`
- Tests: `*.test.ts` (colocated with source files)

## API Routes

All routes prefixed with `/api/v1/`. Health check at `GET /health`.

### Auth (`/auth`)
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
```

### Player (`/player`)
```
GET    /player
GET    /player/skills
GET    /player/attributes
POST   /player/attributes
GET    /player/equipment
```

### Turns (`/turns`)
```
GET    /turns
POST   /turns/spend
```

### HP (`/hp`)
```
GET    /hp
POST   /hp/rest
POST   /hp/recover
GET    /hp/rest/estimate
```

### Zones (`/zones`)
```
GET    /zones
POST   /zones/travel
```

### Exploration (`/exploration`)
```
POST   /exploration/start
GET    /exploration/estimate
```

### Combat (`/combat`)
```
GET    /combat/sites
POST   /combat/sites/abandon
POST   /combat/start
GET    /combat/logs
GET    /combat/logs/:id
```

### Inventory (`/inventory`)
```
GET    /inventory
DELETE /inventory/:id
POST   /inventory/repair
POST   /inventory/use
```

### Equipment (`/equipment`)
```
POST   /equipment/equip
POST   /equipment/unequip
POST   /equipment/init
```

### Gathering (`/gathering`)
```
GET    /gathering/nodes
POST   /gathering/mine
```

### Crafting (`/crafting`)
```
GET    /crafting/recipes
POST   /crafting/craft
POST   /crafting/forge/upgrade
POST   /crafting/forge/reroll
POST   /crafting/salvage
```

### Bestiary (`/bestiary`)
```
GET    /bestiary
```

## Game Constants

All balance values in `packages/shared/src/constants/gameConstants.ts`, organized into these groups:

| Group | Examples |
|---|---|
| `TURN_CONSTANTS` | Regen rate, bank cap, starting turns |
| `COMBAT_CONSTANTS` | Hit chance, crit chance/multiplier, encounter turn cost |
| `CRIT_STAT_CONSTANTS` | Crit chance/damage ranges for equipment |
| `SLOT_STAT_POOLS` | Equipment slot → stat pool mapping |
| `SKILL_CONSTANTS` | XP base/exponent, max level, daily caps, efficiency decay |
| `CHARACTER_CONSTANTS` | XP ratio, damage per stat, evasion-to-speed divisor |
| `EXPLORATION_CONSTANTS` | Ambush/encounter/resource/cache chances, turn bounds |
| `CHEST_CONSTANTS` | Recipe/material roll chances by chest size |
| `DURABILITY_CONSTANTS` | Degradation, repair costs, broken penalties |
| `GATHERING_CONSTANTS` | Turn cost, base yield, yield scaling |
| `CRAFTING_CONSTANTS` | Turn cost, crit chances, salvage rates |
| `ITEM_RARITY_CONSTANTS` | Rarity tiers, bonus slots, upgrade rates |
| `HP_CONSTANTS` | Base HP, vitality scaling, regen, rest/recovery rates |
| `FLEE_CONSTANTS` | Base flee chance, level diff scaling, min/max |
| `POTION_CONSTANTS` | Heal amounts (fixed + percent) by tier |
| `ZONE_CONSTANTS` | Travel cost, terrain multiplier |

Change here, affects entire game. Easy to tune.

## Database Schema

Prisma schema at `packages/database/prisma/schema.prisma` (~470 lines, 30+ models). Key model groups:

- **Auth:** Player, RefreshToken
- **Turns:** TurnBank (lazy regen)
- **Progression:** PlayerSkill (14 skill types), character XP/level, Attributes
- **Items:** ItemTemplate, Item (with rarity, bonus stats, durability)
- **Equipment:** PlayerEquipment (11 slots)
- **Zones:** Zone, ZoneConnection, PlayerZoneDiscovery
- **Combat:** MobTemplate, MobFamily, MobFamilyMember, ZoneMobFamily, DropTable
- **Bestiary:** PlayerBestiary, PlayerBestiaryPrefix
- **Gathering:** ResourceNode, PlayerResourceNode
- **Crafting:** CraftingRecipe, PlayerRecipe
- **Exploration:** EncounterSite, ChestDropTable, ActivityLog

**Skill Types (14):** melee, ranged, magic, mining, foraging, woodcutting, refining, tanning, weaving, weaponsmithing, armorsmithing, leatherworking, tailoring, alchemy

**Equipment Slots (11):** head, neck, chest, gloves, belt, legs, boots, main_hand, off_hand, ring, charm

## Testing

```bash
npm run test           # All tests across all workspaces
npm run test:engine    # Game engine unit tests
npm run test:api       # API integration tests
```

**Test distribution (~32 test files):**
- `packages/game-engine/` — 12 test files (combat, XP, turns, exploration, HP, crafting, items)
- `apps/api/src/services/` — 11 test files (one per service)
- `apps/api/src/middleware/` — 2 test files (auth, error handler)
- `apps/web/src/lib/` — 5 test files (rarity, assets, format, combatShare, utils)
- `packages/shared/src/constants/` — 2 test files (gameConstants, mobPrefixes)

Focus tests on:
- Combat resolution edge cases
- XP calculations and caps
- Turn economy math
- Probability model accuracy
- HP system and flee mechanics

## Deployment

### Frontend (Vercel)
- Auto-deploys from `main` branch
- Environment: `NEXT_PUBLIC_API_URL`

### Backend (Render)
- Web Service, Node environment
- Build: `npm install && npm run build:api`
- Start: `npm run start:api`
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`

### Database (Neon)
- Run migrations: `npm run db:migrate`
- Connection pooling enabled

## Reference Docs

- Game Design: `docs/plans/2026-01-31-game-design.md`
- HP System: `docs/plans/2026-02-05-hp-system-design.md`
- Implementation Plan: `docs/plans/mvp-implementation-plan.md`
- Exploration Rework: `docs/plans/2026-02-10-exploration-rework.md`
- Zone Travel: `docs/plans/2026-02-11-zone-travel-discovery.md`
- Mob Spells: `docs/plans/2026-02-12-mob-spell-system.md`
- PvP Arena: `docs/plans/2026-02-13-pvp-arena-design.md`
- Asset Workflow: `docs/assets/stable-diffusion-workflow.md`
- Color Palette: `docs/assets/color-palette.md`
