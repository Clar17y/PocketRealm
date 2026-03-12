# Pocketrealm - Project Instructions

## Overview

Turn-based async RPG with real-time turn regeneration. Players explore, fight mobs, craft gear, join guilds, compete in PvP, tackle bosses, and progress skills.

**Tech Stack:**
- Frontend: Next.js 16 (TypeScript) PWA → Vercel
- Backend: Node.js Express 4 (TypeScript) → Render
- Database: PostgreSQL 16 → Neon (prod) / Docker (local)
- Cache: Redis 7 → Upstash (prod) / Docker (local)
- Auth: Custom JWT (access + refresh tokens)
- ORM: Prisma 6
- Validation: Zod
- Testing: Vitest + Playwright (E2E)
- Real-time: Socket.IO (chat, casino)

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

Each worktree gets its own PostgreSQL database (`pocketrealm_<branch_name>`), so multiple worktrees with different migrations can run concurrently without conflicts.

## Project Structure

```
pocketrealm/                       # npm workspaces monorepo
├── apps/
│   ├── api/                       # Express backend (port 4000)
│   │   ├── src/
│   │   │   ├── index.ts           # App entry, middleware, route registration
│   │   │   ├── routes/            # 23 route modules (~145 endpoints)
│   │   │   │   ├── combat/        # Modularized: start, logs, sites, helpers
│   │   │   │   ├── crafting/      # Modularized: craft, forge, recipes, salvage
│   │   │   │   └── exploration/   # Modularized: start, estimate, helpers
│   │   │   ├── services/          # 49 service files + tests
│   │   │   ├── middleware/        # auth.ts, admin.ts, errorHandler.ts
│   │   │   ├── socket/            # Socket.IO: chat, casino, auth
│   │   │   └── __mocks__/         # Test mocks (database)
│   │   ├── .env.example
│   │   └── vitest.config.ts
│   │
│   └── web/                       # Next.js 16 frontend (port 3002)
│       ├── src/
│       │   ├── app/               # Next.js App Router
│       │   │   ├── game/          # Main game page
│       │   │   │   ├── hooks/     # Game-specific hooks (7 files)
│       │   │   │   └── screens/   # ArenaScreen, CombatScreen
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── components/        # 85+ component files
│       │   │   ├── screens/       # 25 game screens
│       │   │   ├── combat/        # Combat playback UI
│       │   │   ├── exploration/   # Exploration playback UI
│       │   │   ├── guild/         # 9 guild UI components
│       │   │   ├── leaderboard/   # Leaderboard table
│       │   │   ├── playback/      # Turn-based animation
│       │   │   ├── common/        # 29 shared components
│       │   │   └── ui/            # Base UI primitives (Slider, ToggleSwitch)
│       │   ├── hooks/             # 6 shared hooks
│       │   └── lib/               # 34 files
│       │       └── api/           # 13 modularized API client files
│       ├── .env.example
│       ├── tailwind.config.ts
│       └── vitest.config.ts
│
├── packages/
│   ├── shared/                    # Types, constants, utilities (no deps)
│   │   └── src/
│   │       ├── types/             # 14 type files
│   │       ├── constants/         # 10 constant/definition files
│   │       │   ├── gameConstants.ts   # 43 tunable constant groups (1254 lines)
│   │       │   ├── mobPrefixes.ts
│   │       │   ├── achievementDefinitions.ts
│   │       │   ├── bossTemplateDefinitions.ts
│   │       │   ├── combatActionDefinitions.ts
│   │       │   ├── combatEffectNames.ts
│   │       │   ├── talentTreeDefinitions.ts
│   │       │   └── worldEventTemplates.ts
│   │       ├── utils/             # tierUtils, achievementChains
│   │       └── index.ts
│   │
│   ├── game-engine/               # Pure game logic (no I/O, no side effects)
│   │   └── src/
│   │       ├── combat/            # Combat engine, damage calc, boss rounds, threat
│   │       ├── exploration/       # Probability model, room gen, mob tier filter
│   │       ├── skills/            # xpCalculator
│   │       ├── hp/                # hpCalculator, fleeMechanics
│   │       ├── turns/             # turnCalculator
│   │       ├── crafting/          # craftingCrit
│   │       ├── gathering/         # gatheringCrit
│   │       ├── items/             # itemRarity
│   │       ├── inventory/         # inventoryCapacity, sellPrice
│   │       ├── resources/         # staminaCalculator, manaCalculator
│   │       ├── events/            # applyEventModifiers
│   │       ├── casino/            # roulette
│   │       ├── utils/             # math utilities
│   │       └── index.ts
│   │
│   └── database/                  # Prisma schema and client
│       ├── prisma/
│       │   ├── schema.prisma      # ~1022 lines, 50 models
│       │   ├── seed.ts            # Database seeding
│       │   └── migrations/        # 61 migration files
│       └── src/
│           └── index.ts           # Prisma client singleton
│
├── docs/
│   ├── plans/                     # 118+ feature design documents
│   ├── design/                    # Design specifications
│   ├── testing/                   # Manual testing phase notes
│   ├── ui/                        # Screen state documentation
│   ├── assets/                    # Asset workflow, color palette, images
│   └── sql/                       # Migration helpers
│
├── scripts/
│   ├── setup-worktree.sh          # Create isolated worktree + DB
│   └── teardown-worktree.sh       # Remove worktree + drop DB
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
npm run test:e2e       # Playwright E2E tests
npm run test:e2e:ui    # Playwright E2E with UI

# Cleanup
npm run clean          # Remove all build artifacts and emitted JS
```

## Local Development

```bash
# 1. Start Postgres + Redis containers
docker-compose up -d

# 2. Create .env in apps/api (copy from .env.example)
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pocketrealm
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
- Combat templates for saved encounter strategies
- Boss encounters with multi-player signup and round-based resolution

### Exploration
- Per-turn probability model: `1 - (1 - p)^n`
- Player chooses turn investment via slider (10–10,000 turns)
- Room-based encounter sites with tier scaling
- Outcomes: ambush encounters, encounter sites (small/medium/large), resource nodes, treasure chests, zone exits

### Crafting & Items
- Crit system: base chance + skill level + luck stat
- Item rarity progression: common → uncommon → rare → epic → legendary
- Forge upgrade/reroll with sacrificial items
- Salvage for partial material refund (batch supported)
- Equipment durability with repair costs and max durability decay
- Inventory capacity limits with stash storage
- Item selling with bulk sell support

### HP & Resources
- Base HP + vitality scaling (5 HP per vitality)
- Passive regen: 0.4 HP/second
- Rest: spend turns for HP recovery
- Knockout/recovery state with turn cost to exit
- Stamina and mana as secondary resources

### Zone System
- Directed graph of zone connections
- Wild and town zones (crafting only in towns)
- Travel costs turns; breadcrumb free return
- Zone discovery and zone exploration progress tracking

### Auth
- Custom JWT (access + refresh tokens)
- Access token: 15 min expiry (configurable via `ACCESS_TOKEN_TTL_MINUTES`)
- Refresh token: 30 days sliding expiry (configurable via `REFRESH_TOKEN_TTL_DAYS`), rotated on refresh and stored in DB
- No external auth provider dependency

### Guild System
- Guild creation, membership, join requests
- Role hierarchy: leader, officer, member
- Guild upgrades, specializations, projects, contracts
- Tax system, activity logging

### PvP Arena
- ELO-based matchmaking and rating
- Scout opponents before challenging
- Match history and notifications

### World Events & Bosses
- Timed world events with zone modifiers
- Boss encounters with multi-player signup
- Round-based boss resolution with contribution tracking

### Casino
- Roulette with Socket.IO real-time rounds
- Token exchange system

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
11. **File Operations** - ALWAYS use the Write tool to create or overwrite files. NEVER use cat, sed, awk, echo, or shell heredocs to write file contents. ALWAYS use the Edit tool for partial file modifications.

## grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

### Worktree Limitation

grepai's index is built from the **main branch** only. It does NOT see changes made in worktrees. This means:
- grepai results reflect the main branch state, not your current worktree
- New files, renamed files, or modified code in the worktree **will not appear** in grepai results
- Use grepai for **architectural understanding** — finding where functionality lives, tracing call graphs, discovering file locations
- After finding relevant files via grepai, **always use Read/Grep/Glob to read the actual worktree files**, which may differ from what grepai indexed

### When to Use grepai

Use `grepai search` for:
- Understanding where functionality lives and how the codebase is structured
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Discovering file locations and call graphs in unfamiliar areas
- Any search where you describe WHAT the code does rather than exact text

### When to Use Standard Tools

Use Grep/Glob/Read when you need:
- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.ts`)
- Reading the **current** version of files (especially in worktrees)
- Reviewing or verifying code that may have been modified in this branch

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

1. Start with `grepai search` to find relevant files and understand architecture
2. Use `grepai trace` to understand function relationships
3. **Always use `Read` to examine the actual worktree files** — grepai results may be stale
4. Use Grep/Glob for exact searches or to find worktree-specific changes

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
PATCH  /player/settings
PATCH  /player/tutorial
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

### Resources (`/resources`)
```
GET    /resources
POST   /resources/rest
GET    /resources/estimate
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
POST   /combat/sites/:id/strategy
POST   /combat/start
GET    /combat/logs
GET    /combat/logs/:id
GET    /combat/logs/:id/fights
```

### Inventory (`/inventory`)
```
GET    /inventory
DELETE /inventory/:id
POST   /inventory/repair
POST   /inventory/repair-equipped
POST   /inventory/use
POST   /inventory/sell
POST   /inventory/sell/bulk
GET    /inventory/stash
POST   /inventory/stash/deposit
POST   /inventory/stash/deposit/batch
POST   /inventory/stash/withdraw
POST   /inventory/stash/withdraw/batch
GET    /inventory/loot/:sessionId
POST   /inventory/loot/claim
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
POST   /crafting/salvage/batch
```

### Bestiary (`/bestiary`)
```
GET    /bestiary
```

### Chat (`/chat`)
```
GET    /chat/history
```

### PvP (`/pvp`)
```
GET    /pvp/ladder
GET    /pvp/rating
POST   /pvp/scout
POST   /pvp/challenge
GET    /pvp/history
GET    /pvp/history/:matchId
GET    /pvp/notifications/count
GET    /pvp/notifications
POST   /pvp/notifications/read
GET    /pvp/notifications/scouts/count
GET    /pvp/notifications/scouts
POST   /pvp/notifications/scouts/read
```

### Boss (`/boss`)
```
GET    /boss/active
GET    /boss/history
GET    /boss/:id
POST   /boss/:id/signup
GET    /boss/:id/round/:num
```

### World Events (`/events`)
```
GET    /events
GET    /events/zone/:zoneId
GET    /events/:id
```

### Achievements (`/achievements`)
```
GET    /achievements
GET    /achievements/unclaimed-count
POST   /achievements/:id/claim
GET    /achievements/title
PUT    /achievements/title
```

### Leaderboard (`/leaderboard`)
```
GET    /leaderboard/categories
GET    /leaderboard/:category
```

### Guild (`/guild`)
```
POST   /guild
GET    /guild
GET    /guild/search
GET    /guild/:id
PATCH  /guild/:id
DELETE /guild/:id
POST   /guild/:id/join
POST   /guild/:id/leave
POST   /guild/:id/request
GET    /guild/:id/requests
POST   /guild/:id/requests/:requestId/accept
POST   /guild/:id/requests/:requestId/reject
POST   /guild/:id/kick
POST   /guild/:id/promote
POST   /guild/:id/demote
POST   /guild/:id/transfer
GET    /guild/:id/log
GET    /guild/:id/upgrades
POST   /guild/:id/upgrades/activate
GET    /guild/:id/contracts
GET    /guild/:id/projects
POST   /guild/:id/projects/start
POST   /guild/:id/projects/:projectId/contribute/turns
POST   /guild/:id/projects/:projectId/contribute/materials
GET    /guild/:id/specialization
POST   /guild/:id/specialization/select
POST   /guild/:id/specialization/respec
```

### Templates (`/templates`)
```
GET    /templates
POST   /templates
GET    /templates/active
PATCH  /templates/:id
DELETE /templates/:id
POST   /templates/:id/activate
```

### Skill Points (`/skillpoints`)
```
GET    /skillpoints
POST   /skillpoints/allocate
POST   /skillpoints/respec
```

### Casino (`/casino`)
```
POST   /casino/exchange
GET    /casino/roulette/round
POST   /casino/roulette/bet
GET    /casino/roulette/history
GET    /casino/roulette/stats
```

### Training (`/training`)
```
POST   /training/fight
GET    /training/cooldown
```

### Admin (`/admin`) — requires admin role
```
POST   /admin/turns/grant
POST   /admin/player/level
POST   /admin/player/xp
POST   /admin/player/attributes
GET    /admin/items/templates
POST   /admin/items/grant
GET    /admin/events/templates
GET    /admin/events/active
POST   /admin/events/spawn
POST   /admin/events/:id/cancel
GET    /admin/mobs
POST   /admin/boss/spawn
GET    /admin/zones
POST   /admin/zones/discover-all
POST   /admin/zones/teleport
GET    /admin/mob-families
POST   /admin/encounter/spawn
GET    /admin/resource-nodes
POST   /admin/resource-nodes/spawn
```

## Game Constants

All balance values in `packages/shared/src/constants/gameConstants.ts` (1254 lines, 43 groups):

| Group | Examples |
|---|---|
| `TURN_CONSTANTS` | Regen rate, bank cap, starting turns |
| `COMBAT_CONSTANTS` | Hit chance, crit chance/multiplier, encounter turn cost |
| `COMBAT_ACTION_CONSTANTS` | Action costs, cooldowns |
| `CRIT_STAT_CONSTANTS` | Crit chance/damage ranges for equipment |
| `SLOT_STAT_POOLS` | Equipment slot → stat pool mapping |
| `SKILL_CONSTANTS` | XP base/exponent, max level, daily caps, efficiency decay |
| `SKILL_POINT_CONSTANTS` | Talent point allocation |
| `CHARACTER_CONSTANTS` | XP ratio, damage per stat, evasion-to-speed divisor |
| `EXPLORATION_CONSTANTS` | Ambush/encounter/resource/cache chances, turn bounds |
| `CHEST_CONSTANTS` | Recipe/material roll chances by chest size |
| `DURABILITY_CONSTANTS` | Degradation, repair costs, broken penalties |
| `GATHERING_CONSTANTS` | Turn cost, base yield, yield scaling |
| `GEM_CONSTANTS` / `GEM_CRIT_CONSTANTS` | Gem drops and crit bonuses |
| `CRAFTING_CONSTANTS` | Turn cost, crit chances, salvage rates |
| `INVENTORY_CONSTANTS` | Capacity limits, stash size |
| `SELL_CONSTANTS` | Item sell pricing |
| `ITEM_RARITY_CONSTANTS` | Rarity tiers, bonus slots, upgrade rates |
| `HP_CONSTANTS` | Base HP, vitality scaling, regen, rest/recovery rates |
| `FLEE_CONSTANTS` | Base flee chance, level diff scaling, min/max |
| `STAMINA_CONSTANTS` / `MANA_CONSTANTS` | Secondary resource pools |
| `POTION_CONSTANTS` | Heal amounts (fixed + percent) by tier |
| `ZONE_CONSTANTS` | Travel cost, terrain multiplier |
| `ZONE_EXPLORATION_CONSTANTS` | Zone exploration progress |
| `HIDDEN_CACHE_CONSTANTS` | Hidden cache discovery |
| `ROOM_CONSTANTS` / `FULL_CLEAR_CONSTANTS` | Room generation, full clear bonuses |
| `TIER_NAME_CONSTANTS` / `TIER_BLEED_CONSTANTS` | Tier naming and bleed mechanics |
| `CHAT_CONSTANTS` | Chat message limits |
| `PVP_CONSTANTS` | ELO, matchmaking, cooldowns |
| `BOSS_ENCOUNTER_CONSTANTS` | Boss HP scaling, round timing |
| `WORLD_EVENT_CONSTANTS` | Event durations, modifiers |
| `LEADERBOARD_CONSTANTS` | Refresh intervals, categories |
| `GUILD_CONSTANTS` | Creation cost, member cap, tax rates |
| `GUILD_CONTRACT_CONSTANTS` / `GUILD_PROJECT_CONSTANTS` | Contract and project config |
| `CASINO_CONSTANTS` | Roulette odds, exchange rates |
| `TRAINING_CONSTANTS` | Training ground config |

## Database Schema

Prisma schema at `packages/database/prisma/schema.prisma` (~1022 lines, 50 models, 61 migrations).

**Model groups:**
- **Auth:** Player, RefreshToken
- **Turns:** TurnBank (lazy regen)
- **Progression:** PlayerSkill, SkillPointAllocation, PlayerStats
- **Items:** ItemTemplate, Item (with rarity, bonus stats, durability)
- **Equipment:** PlayerEquipment (11 slots)
- **Zones:** Zone, ZoneConnection, PlayerZoneDiscovery, PlayerZoneExploration
- **Combat:** MobTemplate, MobFamily, MobFamilyMember, ZoneMobFamily, DropTable
- **Combat Templates:** CombatTemplate, CombatTemplateSlot
- **Bestiary:** PlayerBestiary, PlayerBestiaryPrefix
- **Gathering:** ResourceNode, PlayerResourceNode
- **Crafting:** CraftingRecipe, PlayerRecipe, ChestDropTable
- **Exploration:** EncounterSite, ActivityLog
- **Chat:** ChatMessage
- **PvP:** PvpRating, PvpMatch, PvpCooldown, PvpScoutLog
- **Boss:** BossEncounter, BossParticipant, PersistedMob, PlayerBossRotation
- **World Events:** WorldEvent
- **Achievements:** PlayerAchievement
- **Guilds:** Guild, GuildMember, GuildUpgrade, GuildProject, GuildProjectContribution, GuildContract, GuildLog, GuildJoinRequest
- **Casino:** RouletteRound, RouletteBet

**Equipment Slots (11):** head, neck, chest, gloves, belt, legs, boots, main_hand, off_hand, ring, charm

## Testing

```bash
npm run test           # All tests across all workspaces
npm run test:engine    # Game engine unit tests
npm run test:api       # API integration tests
npm run test:e2e       # Playwright E2E tests
```

**Test distribution (~88 test files):**
- `packages/game-engine/` — 26 test files (combat, XP, turns, exploration, HP, crafting, items, inventory, resources, events, casino)
- `apps/api/src/services/` — 44 test files (one per service)
- `apps/api/src/middleware/` — 3 test files (auth, admin, error handler)
- `apps/api/src/routes/` — 4 test files (admin, exploration tutorial, player settings/tutorial)
- `apps/api/src/socket/` — 1 test file (socketAuth)
- `apps/web/src/lib/` — 6 test files (rarity, assets, format, combatShare, changelog, utils)
- `packages/shared/src/` — 6 test files (gameConstants, mobPrefixes, achievementDefinitions, worldEventTemplates, achievementChains, tierUtils)

## Deployment

### Frontend (Vercel)
- Auto-deploys from `main` branch
- Environment: `NEXT_PUBLIC_API_URL`

### Backend (Render)
- Web Service, Node environment
- Build: `npm install && npm run build:api`
- Start: `npm run start:api`
- Environment: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- Background timers: boss round resolution (60s), persisted mob cleanup (5min), leaderboard refresh (15min)

### Database (Neon)
- Run migrations: `npm run db:migrate`
- Connection pooling enabled

## Feature Routing Table

**Before working on a feature, read the business rules doc AND the relevant plan docs listed below.**

- **Business Rules (ALWAYS read):** `docs/business-rules.md` — state machines, cross-system constraints, cascading effects

| Feature Area | Plan Docs (design intent) | Key Source Files |
|---|---|---|
| **Combat** | `combat-rework-design`, `combat-rework-plan`, `combat-rework-frontend`, `enhanced-combat-log-design` | `routes/combat/`, `services/combatOrchestrationService.ts`, `game-engine/src/combat/` |
| **Combat Templates** | `template-combat-wiring-design`, `template-combat-wiring`, `conditional-combat-templates-design`, `conditional-combat-templates-plan`, `template-editor-ux-design` | `routes/templates.ts`, `services/combatTemplateService.ts` |
| **Exploration** | `exploration-rework-design`, `zone-exploration-progression-design`, `zone-exploration-improvements-design` | `routes/exploration/`, `services/zoneExplorationService.ts`, `game-engine/src/exploration/` |
| **Encounter Sites** | `encounter-site-ux-design`, `encounter-site-ux`, `full-clear-atomic` | `routes/combat/sites.ts`, `routes/combat/start.ts` |
| **HP & Resources** | `hp-system-design`, `hp-system-implementation`, `hp-visibility-design` | `services/hpService.ts`, `services/resourceService.ts`, `game-engine/src/hp/` |
| **Zones & Travel** | `zone-travel-discovery-design`, `zone-travel-discovery-plan`, `zone-art-backgrounds-design` | `routes/zones.ts`, `services/zoneDiscoveryService.ts` |
| **Crafting & Forge** | `crafting-crit-system`, `rare-crafting-design`, `jewellery-crafting-design`, `mass-salvage-quick-forge-design`, `forge-salvage-turn-cost-rework` | `routes/crafting/`, `game-engine/src/crafting/` |
| **Items & Inventory** | `item-rarity-system`, `crit-stats-slot-pools`, `inventory-backpack-design`, `inventory-backpack-plan` | `services/inventoryService.ts`, `services/lootService.ts`, `game-engine/src/items/` |
| **Equipment** | `attribute-armour-crafting-design`, `equipment-ux-design`, `equipment-ux-implementation` | `services/equipmentService.ts`, `services/durabilityService.ts` |
| **PvP Arena** | `pvp-arena-design`, `pvp-arena-implementation`, `pvp-rework-design`, `pvp-rework-plan`, `combat-pvp-fixes` | `routes/pvp.ts`, `services/pvpService.ts`, `services/eloService.ts` |
| **Boss Encounters** | `boss-encounters-design`, `boss-encounters-plan`, `world-boss-improvements`, `boss-rewards-system` | `routes/boss.ts`, `services/bossEncounterService.ts`, `services/bossLootService.ts` |
| **World Events** | `world-events-design`, `world-events-improvements` | `routes/worldEvents.ts`, `services/worldEventService.ts`, `services/eventSchedulerService.ts` |
| **Guilds** | `guild-system-design`, `guild-system-plan`, `guild-phase3-plan`, `guild-join-requests`, `guild-tax-transparency` | `routes/guild.ts`, `services/guild*.ts` (8 service files) |
| **Achievements** | `achievements-design`, `achievements-implementation`, `achievement-ux-design` | `routes/achievements.ts`, `services/achievementService.ts`, `shared/constants/achievementDefinitions.ts` |
| **Leaderboard** | `leaderboard-system-design`, `leaderboard-implementation-plan` | `routes/leaderboard.ts`, `services/leaderboardService.ts` |
| **Skills & XP** | `new-skills-foraging-alchemy-woodcutting`, `skills-efficiency-balance-design`, `magic-defence-design` | `services/xpService.ts`, `services/skillPointService.ts`, `game-engine/src/skills/` |
| **Mob System** | `mob-variety-prefix-system`, `mob-spell-system-design`, `bestiary-prefix-redesign` | `game-engine/src/combat/mobPrefixes.ts`, `shared/constants/mobPrefixes.ts` |
| **Casino** | `casino-atmosphere-design`, `casino-atmosphere-plan` | `routes/casino.ts`, `services/casinoService.ts`, `socket/` |
| **Training** | `town-activities-design`, `town-activities-plan` | `routes/training.ts`, `services/trainingService.ts` |
| **Tutorial** | `tutorial-and-launch-design`, `tutorial-and-launch-plan` | `components/TutorialBanner.tsx`, `components/TutorialDialog.tsx`, `lib/tutorial.ts` |
| **Admin Panel** | `admin-panel-design`, `admin-panel-plan` | `routes/admin.ts`, `middleware/admin.ts` |
| **Auth & Landing** | `auth-pages-design`, `landing-page-design`, `landing-page-plan` | `routes/auth.ts`, `app/login/`, `app/register/` |
| **UI/UX** | `screen-specific-backgrounds-design`, `hp-bar-actions-design`, `in-game-changelog`, `preferences-design` | `components/screens/`, `components/common/` |
| **E2E Testing** | `playwright-e2e-testing-design`, `playwright-e2e-implementation` | `tests/e2e/` |
| **Quests (planned)** | `quest-system-design`, `quest-system-plan` | Not yet implemented |

Design/spec docs are in `docs/superpowers/specs/` and plan/implementation docs are in `docs/superpowers/plans/`, both with `2026-MM-DD-` prefix. Design docs describe intent; implementation/plan docs describe execution steps.

**Note:** Plan docs capture design-time intent and may not reflect current implementation. Always verify against actual source code. `docs/business-rules.md` reflects current behavior.

## Reference Docs

- Game Design: `docs/superpowers/plans/2026-01-31-game-design.md`
- Business Rules: `docs/business-rules.md`
- Asset Workflow: `docs/assets/stable-diffusion-workflow.md`
- Color Palette: `docs/assets/color-palette.md`
