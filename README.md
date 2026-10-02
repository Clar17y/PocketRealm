# PocketRealm

PocketRealm is a turn-based browser RPG with asynchronous progression, multiplayer combat, crafting, guilds, and seasonal worlds. It combines a Next.js web client, an Express API, PostgreSQL, Redis, and shared TypeScript game logic.

Originally created by [Scott Dyer (Clar17y)](https://github.com/Clar17y).

**Project status:** The original hosted game has been retired. Development has ended, and this repository preserves the project for learning and people who want to build their own version. There is no maintained public game server or support commitment.

## Gameplay

- Turn economy with real-time regen and bank cap
- Character progression with combat/gathering/crafting skills
- Attribute allocation and HP recovery systems (rest + knockout recovery)
- Zone discovery/travel graph, travel ambushes, and town vs wild zone flow
- Exploration outcomes: ambushes, encounter sites, resource node discoveries, hidden caches
- Combat logs/history, bestiary tracking, and mob prefix encounters
- Inventory and equipment management with durability + consumables
- Gathering (mining/foraging/woodcutting)
- Crafting, recipe discovery/unlocks, salvage, and forge upgrade/reroll systems
- PvP arena, shared boss encounters, guilds, and cooperative expeditions
- Quests, achievements, seasonal progression, and leaderboards
- In-game chat, friends, and a Discord bot for account linking and game interactions

## Engineering Highlights

- Pure gameplay calculations live in [game-engine](packages/game-engine/src), separate from API orchestration and database access.
- Shared types and tunable constants connect the web app, API, and Discord bot.
- Prisma migrations capture the evolving data model; PostgreSQL transactions coordinate multi-step game actions.
- Socket.IO and Redis support real-time updates alongside asynchronous turn regeneration.
- Colocated Vitest tests cover gameplay rules, API services, client behavior, and Discord interactions. The [CI workflow](.github/workflows/ci.yml) validates migrations, builds, and workspace tests.

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Next.js 16 + React + TypeScript |
| API | Express 4 + TypeScript |
| Data | PostgreSQL 16 + Prisma 6 |
| Cache and real-time updates | Redis 7 + Socket.IO |
| Discord | Dedicated bot worker |
| Shared Logic | Workspace packages (`@pocketrealm/shared`, `@pocketrealm/game-engine`) |
| Auth | JWT access + refresh token flow |

## Monorepo Layout

```text
PocketRealm/
|-- apps/
|   |-- api/                # Express API
|   |-- web/                # Next.js frontend
|   `-- discord-bot/        # Discord worker
|-- packages/
|   |-- database/           # Prisma schema/client + migrations + seed
|   |-- game-engine/        # Pure gameplay calculations
|   `-- shared/             # Shared types and constants
|-- docs/                   # Design docs, plans, and test notes
|-- docker-compose.yml      # Local postgres + redis
`-- scripts/                # Development and worktree helpers
```

## Local Development

### Prerequisites

- Node.js 22+
- Docker Desktop (or equivalent) for local Postgres/Redis

### 1) Install dependencies

```powershell
npm ci
```

### 2) Start local infrastructure

The checked-in [Compose file](docker-compose.yml) uses a Windows `D:/postgres_data/pocketrealm` bind mount for PostgreSQL. Before starting it on another machine, replace that mount with `postgres_data:/var/lib/postgresql/data` or your own local directory.

```powershell
docker compose up -d
```

This brings up:
- PostgreSQL on `localhost:5433`
- Redis on `localhost:6379`

### 3) Configure environment

Create local env files from examples:

- `apps/api/.env` from `apps/api/.env.example`
- `apps/web/.env.local` from `apps/web/.env.example`
- `packages/database/.env` from `packages/database/.env.example`

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item packages/database/.env.example packages/database/.env
```

Use the same local database URLs in the API and database env files. Prisma requires both `DATABASE_URL` and `DIRECT_DATABASE_URL`.

Minimum useful values:

```env
# apps/api/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pocketrealm
DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pocketrealm
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-long-random-secret
PORT=4000
CORS_ORIGINS=http://localhost:3002,http://127.0.0.1:3002
```

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 4) Run migrations and seed data

```powershell
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

Note: `db:seed` reseeds world/template data (zones, mobs, recipes, etc).

### 5) Start the app

```bash
npm run dev
```

### Local URLs

- Web: `http://localhost:3002`
- API: `http://localhost:4000`
- API liveness: `http://localhost:4000/health/live`
- API readiness: `http://localhost:4000/health/ready`

### Optional Integrations and Hosting

The Discord worker has its own [env example](apps/discord-bot/.env.example) and runs separately with `npm run dev -w apps/discord-bot`. If you enable it, the API and worker must share a `DISCORD_INTERNAL_API_KEY`.

Email, payments, push notifications, error tracking, and production hosting need your own service configuration. See the [deployment reference](docs/reference/deployment.md) for the historical topology and environment variables. Its descriptions of the original hosted services are historical; provision your own services for a new deployment.

Automatic Vercel Git deployments are disabled in [vercel.json](apps/web/vercel.json). If you host your own version, configure your Vercel project and enable Git deployments explicitly.

## Root Scripts

```bash
npm run dev            # Build shared packages, then run API + Web in parallel
npm run dev:api        # API only
npm run dev:web        # Web only
npm run build          # Build all packages and apps
npm run build:api      # Build shared + API
npm run build:web      # Build shared + Web
npm run clean          # Remove build outputs and stray TS emits
npm run typecheck      # TS project refs (packages + API + Discord bot)
npm run lint           # ESLint
npm run test           # Run workspace tests
npm run test:api       # API tests
npm run test:engine    # Game-engine tests
npm run verify:ci      # Build and test all workspaces
npm run db:migrate     # Prisma migrate dev
npm run db:seed        # Seed world/template content
npm run db:studio      # Prisma Studio
```

Typechecking note: root `tsconfig.json` includes packages, the API, and the Discord bot. Use `npm run build:web` for web type validation.

## API Surface (`/api/v1`)

The API covers authentication, player progression, exploration, combat, inventory, crafting, guilds, seasons, and social features. See the [API route reference](docs/reference/api-routes.md) for the full route map.

## Useful Docs

- [Project structure](docs/reference/project-structure.md)
- [API routes](docs/reference/api-routes.md)
- [Database schema](docs/reference/database-schema.md)
- [Testing](docs/reference/testing.md)
- [Business rules](docs/business-rules.md)
- UI state notes: `docs/ui/game.md`
- Manual testing notes: `docs/testing/phase-4.md`
- Manual testing notes: `docs/testing/phase-5.md`
- Manual testing notes: `docs/testing/phase-6.md`
- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`

## Credits

PocketRealm was originally created by [Scott Dyer (Clar17y)](https://github.com/Clar17y). The bundled game images are AI-generated.

## License

The project code, documentation, and bundled game artwork are available under the [MIT License](LICENSE).

You may use, modify, redistribute, and sell your own version. Keep the original copyright and license notices in copies or substantial portions of the project. No on-screen attribution is required.

Third-party dependencies retain their own licenses.
