# PocketRealm

Turn-based async RPG monorepo with a Next.js web client, Express API, Prisma/PostgreSQL data layer, and shared TypeScript game logic packages.

## Current Scope

- Turn economy with real-time regen and bank cap
- Character progression with combat/gathering/crafting skills
- Attribute allocation and HP recovery systems (rest + knockout recovery)
- Zone discovery/travel graph, travel ambushes, and town vs wild zone flow
- Exploration outcomes: ambushes, encounter sites, resource node discoveries, hidden caches
- Combat logs/history, bestiary tracking, and mob prefix encounters
- Inventory and equipment management with durability + consumables
- Gathering (mining/foraging/woodcutting)
- Crafting, recipe discovery/unlocks, salvage, and forge upgrade/reroll systems

## Tech Stack

| Layer | Technology |
|---|---|
| Web | Next.js 16 + React + TypeScript |
| API | Express 4 + TypeScript |
| Data | PostgreSQL + Prisma |
| Shared Logic | Workspace packages (`@pocketrealm/shared`, `@pocketrealm/game-engine`) |
| Auth | JWT access + refresh token flow |

## Monorepo Layout

```text
PocketRealm/
|-- apps/
|   |-- api/                # Express API
|   `-- web/                # Next.js frontend
|-- packages/
|   |-- database/           # Prisma schema/client + migrations + seed
|   |-- game-engine/        # Pure gameplay calculations
|   `-- shared/             # Shared types and constants
|-- docs/                   # Design docs, plans, and test notes
|-- docker-compose.yml      # Local postgres + redis
`-- scripts/link-local.ps1  # Local symlink/junction helper
```

## Local Development

### Prerequisites

- Node.js 20+
- Docker Desktop (or equivalent) for local Postgres/Redis

### 1) Install dependencies

```bash
npm install
```

### 2) Start local infrastructure

```bash
docker-compose up -d
```

This brings up:
- PostgreSQL on `localhost:5433`
- Redis on `localhost:6379`

### 3) Configure environment

Create local env files from examples:

- `apps/api/.env` from `apps/api/.env.example`
- `apps/web/.env.local` from `apps/web/.env.example`

Minimum useful values:

```env
# apps/api/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pocketrealm
JWT_SECRET=change-this-to-a-long-random-secret
PORT=4000
CORS_ORIGINS=http://localhost:3002,http://127.0.0.1:3002
```

```env
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 4) Run migrations and seed data

```bash
npm run db:migrate
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
- API health: `http://localhost:4000/health`

## Root Scripts

```bash
npm run dev            # Build shared packages, then run API + Web in parallel
npm run dev:api        # API only
npm run dev:web        # Web only
npm run build          # Build all packages and apps
npm run build:api      # Build shared + API
npm run build:web      # Build shared + Web
npm run clean          # Remove build outputs and stray TS emits
npm run typecheck      # TS project refs (packages + api)
npm run lint           # ESLint
npm run test           # Run workspace tests
npm run test:api       # API tests
npm run test:engine    # Game-engine tests
npm run db:migrate     # Prisma migrate dev
npm run db:seed        # Seed world/template content
npm run db:studio      # Prisma Studio
```

Typechecking note: root `tsconfig.json` intentionally excludes `apps/web`; use `npm run build -w apps/web` for web type validation.

## API Surface (`/api/v1`)

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Player and Progression

- `GET /player`
- `GET /player/skills`
- `GET /player/attributes`
- `POST /player/attributes`
- `GET /player/equipment`

### Turns and HP

- `GET /turns`
- `POST /turns/spend`
- `GET /hp`
- `POST /hp/rest`
- `GET /hp/rest/estimate`
- `POST /hp/recover`

### Zones and Exploration

- `GET /zones`
- `POST /zones/travel`
- `GET /exploration/estimate`
- `POST /exploration/start`

### Combat

- `GET /combat/sites`
- `POST /combat/sites/abandon`
- `POST /combat/start`
- `GET /combat/logs`
- `GET /combat/logs/:id`

### Inventory and Equipment

- `GET /inventory`
- `DELETE /inventory/:id`
- `POST /inventory/repair`
- `POST /inventory/use`
- `POST /equipment/equip`
- `POST /equipment/unequip`
- `POST /equipment/init` (dev helper)

### Gathering and Crafting

- `GET /gathering/nodes`
- `POST /gathering/mine`
- `GET /crafting/recipes`
- `POST /crafting/craft`
- `POST /crafting/forge/upgrade`
- `POST /crafting/forge/reroll`
- `POST /crafting/salvage`

### Bestiary

- `GET /bestiary`

## Useful Docs

- UI state notes: `docs/ui/game.md`
- Manual testing notes: `docs/testing/phase-4.md`
- Manual testing notes: `docs/testing/phase-5.md`
- Manual testing notes: `docs/testing/phase-6.md`
- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`

## License

Private - All rights reserved.
