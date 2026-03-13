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
