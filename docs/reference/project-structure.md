```
pocketrealm/                       # npm workspaces monorepo
├── apps/
│   ├── api/                       # Express backend (port 4000)
│   │   ├── src/
│   │   │   ├── index.ts           # Process startup, HTTP server, timers, shutdown
│   │   │   ├── app.ts             # Express app construction, middleware, route registration
│   │   │   ├── routes/            # Thin HTTP boundary modules mounted in app.ts
│   │   │   │   ├── combat/        # Modularized: start, logs, sites, helpers
│   │   │   │   ├── crafting/      # Modularized: craft, forge, recipes, salvage
│   │   │   │   └── exploration/   # Modularized: start, estimate, helpers
│   │   │   ├── services/          # Business workflows, DB access, socket side effects
│   │   │   ├── middleware/        # auth.ts, admin.ts, errorHandler.ts
│   │   │   ├── socket/            # Socket.IO: chat, casino, auth, Redis adapter
│   │   │   └── __mocks__/         # Test mocks (database)
│   │   ├── .env.example
│   │   └── vitest.config.ts
│   │
│   └── web/                       # Next.js 16 frontend (port 3002)
│       ├── src/
│       │   ├── app/               # Next.js App Router
│       │   │   ├── game/          # Main game page
│       │   │   │   ├── hooks/     # Game-specific controller/action hooks
│       │   │   │   └── screens/   # ArenaScreen, CombatScreen
│       │   │   ├── login/
│       │   │   └── register/
│       │   ├── components/        # 210 component files
│       │   │   ├── screens/       # 67 game screens/modules
│       │   │   ├── combat/        # Combat playback UI
│       │   │   ├── exploration/   # Exploration playback UI
│       │   │   ├── guild/         # 15 guild UI components
│       │   │   ├── leaderboard/   # Leaderboard table
│       │   │   ├── playback/      # Turn-based animation
│       │   │   ├── common/        # 74 shared components
│       │   │   └── ui/            # Base UI primitives (Slider, ToggleSwitch)
│       │   ├── hooks/             # 24 shared hooks
│       │   └── lib/               # 58 client utilities/modules
│       │       └── api/           # 23 modularized API client files
│       ├── .env.example
│       ├── tailwind.config.ts
│       └── vitest.config.ts
│
├── packages/
│   ├── shared/                    # Types, constants, utilities; top-level and explicit subpath exports
│   │   └── src/
│   │       ├── types/             # 14 type files
│   │       ├── constants/         # Constant/definition files
│   │       │   ├── gameConstants.ts   # Tunable gameplay constant groups
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
│       │   ├── schema.prisma      # 1358 lines, 75 models
│       │   ├── seed.ts            # Database seeding
│       │   └── migrations/        # 97 migration directories
│       └── src/
│           └── index.ts           # Prisma client singleton
│
├── docs/
│   ├── plans/                     # Historical feature design documents
│   ├── design/                    # Design specifications
│   ├── testing/                   # Manual testing phase notes
│   ├── ui/                        # Screen state documentation
│   ├── assets/                    # Asset workflow, color palette, images
│   └── sql/                       # Migration helpers
│
├── scripts/
│   ├── setup-worktree.ps1         # Create isolated Windows worktree + DB
│   ├── teardown-worktree.ps1      # Remove Windows worktree + drop DB
│   ├── setup-worktree.sh          # Git Bash/Unix worktree lifecycle
│   └── teardown-worktree.sh       # Git Bash/Unix worktree lifecycle
│
├── docker-compose.yml             # PostgreSQL 16 + Redis 7
├── package.json                   # Workspace root
├── tsconfig.json                  # Base config with project references
└── .mcp.json                      # MCP server config
```
