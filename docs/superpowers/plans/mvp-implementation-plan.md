# Adventure RPG MVP Implementation Plan

## Executive Summary

Phased development of the Adventure RPG MVP - a turn-based asynchronous RPG with real-time turn regeneration. Focus: validating the core gameplay loop (turn economy, exploration, combat, progression).

**Target Duration:** 8-10 weeks
**Tech Stack:** Next.js (TypeScript) PWA, Node.js backend, PostgreSQL, Redis

---

## Project Structure

```
D:\code\Adventure\
├── apps/
│   ├── web/                    # Next.js PWA frontend
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router
│   │   │   ├── components/     # React components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── lib/            # Client utilities
│   │   │   └── styles/         # Global styles
│   │   └── public/             # Static assets
│   └── api/                    # Node.js backend
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   ├── services/       # Business logic
│       │   ├── repositories/   # Database access
│       │   ├── jobs/           # Background jobs (BullMQ)
│       │   └── middleware/     # Express middleware
├── packages/
│   ├── shared/                 # Shared types & constants
│   │   └── src/
│   │       ├── types/          # TypeScript interfaces
│   │       └── constants/      # Game constants
│   ├── game-engine/            # Core game logic (pure functions)
│   │   └── src/
│   │       ├── combat/         # Combat resolution
│   │       ├── exploration/    # Exploration mechanics
│   │       ├── skills/         # Skill calculations
│   │       └── turns/          # Turn economy
│   └── database/               # Database schemas & migrations
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/
├── docs/                       # Documentation (existing)
└── docker-compose.yml
```

---

## Phase 1: Project Foundation (Week 1) ✅

### 1.1 Project Scaffolding
- [x] Initialize monorepo with workspaces (apps/web, apps/api, packages/*)
- [x] Configure TypeScript (strict mode, path aliases)
- [x] Configure ESLint/Prettier
- [x] Docker Compose for PostgreSQL + Redis
- [ ] Basic CI/CD (type checking, lint)

### 1.2 Database Schema

**Core Tables:**

```sql
-- Players
players (
  id UUID PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
)

-- Turn Bank
turn_banks (
  player_id UUID PRIMARY KEY REFERENCES players(id),
  current_turns INTEGER NOT NULL DEFAULT 86400,
  last_regen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_turns CHECK (current_turns >= 0 AND current_turns <= 64800)
)

-- Character Skills
player_skills (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  skill_type VARCHAR(32) NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  xp BIGINT NOT NULL DEFAULT 0,
  daily_xp_gained INTEGER NOT NULL DEFAULT 0,
  last_xp_reset_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(player_id, skill_type)
)

-- Equipment Slots
player_equipment (
  player_id UUID REFERENCES players(id),
  slot VARCHAR(16) NOT NULL,
  item_id UUID REFERENCES items(id),
  PRIMARY KEY(player_id, slot)
)

-- Item Templates
item_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  item_type VARCHAR(32) NOT NULL,
  slot VARCHAR(16),
  tier INTEGER NOT NULL DEFAULT 1,
  base_stats JSONB NOT NULL DEFAULT '{}',
  required_skill VARCHAR(32),
  required_level INTEGER DEFAULT 1,
  max_durability INTEGER DEFAULT 100,
  stackable BOOLEAN DEFAULT false
)

-- Item Instances
items (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES item_templates(id),
  owner_id UUID REFERENCES players(id),
  current_durability INTEGER,
  max_durability INTEGER,
  quantity INTEGER DEFAULT 1
)

-- Mob Templates
mob_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  zone_id UUID REFERENCES zones(id),
  hp INTEGER NOT NULL,
  attack INTEGER NOT NULL,
  defence INTEGER NOT NULL,
  evasion INTEGER NOT NULL,
  damage_min INTEGER NOT NULL,
  damage_max INTEGER NOT NULL,
  xp_reward INTEGER NOT NULL,
  encounter_weight INTEGER NOT NULL DEFAULT 100,
  spell_pattern JSONB DEFAULT '[]'
)

-- Zones
zones (
  id UUID PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  description TEXT,
  difficulty INTEGER NOT NULL DEFAULT 1,
  travel_cost INTEGER NOT NULL,
  is_starter BOOLEAN DEFAULT false
)

-- Bestiary Progress
player_bestiary (
  player_id UUID REFERENCES players(id),
  mob_template_id UUID REFERENCES mob_templates(id),
  kills INTEGER NOT NULL DEFAULT 0,
  first_encountered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY(player_id, mob_template_id)
)

-- Drop Tables
drop_tables (
  id UUID PRIMARY KEY,
  mob_template_id UUID REFERENCES mob_templates(id),
  item_template_id UUID REFERENCES item_templates(id),
  drop_chance DECIMAL(5,4) NOT NULL,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER DEFAULT 1
)

-- Activity Logs
activity_logs (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  activity_type VARCHAR(32) NOT NULL,
  turns_spent INTEGER NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Crafting Recipes
crafting_recipes (
  id UUID PRIMARY KEY,
  skill_type VARCHAR(32) NOT NULL,
  required_level INTEGER NOT NULL,
  result_template_id UUID REFERENCES item_templates(id),
  turn_cost INTEGER NOT NULL,
  materials JSONB NOT NULL,
  xp_reward INTEGER NOT NULL
)

-- Resource Nodes
resource_nodes (
  id UUID PRIMARY KEY,
  zone_id UUID REFERENCES zones(id),
  resource_type VARCHAR(32) NOT NULL,
  skill_required VARCHAR(32) NOT NULL,
  level_required INTEGER NOT NULL DEFAULT 1,
  base_yield INTEGER NOT NULL,
  discovery_chance DECIMAL(5,4) NOT NULL
)
```

---

## Phase 2: Turn Economy & Auth (Week 2) ✅

### 2.1 Turn System Backend
- [x] Turn regeneration service (Redis-based, lazy calculation)
- [x] `POST /api/turns/spend` - turn deduction
- [x] `GET /api/turns` - current balance + time to cap

### 2.2 Authentication System
- [x] `POST /api/auth/register` - create account, init turn bank + skills
- [x] `POST /api/auth/login` - JWT tokens
- [x] Auth middleware (JWT verification, rate limiting)

### 2.3 Frontend Auth UI
- [x] Login page
- [x] Register page
- [x] Auth context provider (useAuth hook)
- [x] Protected route wrapper (dashboard redirect)

---

## Phase 3: Core Game Engine (Week 3) ✅

### 3.1 Combat Resolution Engine
- [x] Combat state machine (initiative, turn order, rounds)
- [x] Attack resolution (hit roll vs defence, evasion check, damage calc)
- [x] Combat log generation (narrative format)
- [x] Combat outcome (XP, loot rolls, durability)

**Key file:** `packages/game-engine/src/combat/combatEngine.ts`

### 3.2 Exploration Probability Model
- [x] Per-turn probability calculator: `cumulative = 1 - (1 - p)^n`
- [x] Outcome types: mob encounter, resource node, hidden cache, zone exit
- [x] Exploration resolver (turn count → discovery list)

**Key file:** `packages/game-engine/src/exploration/probabilityModel.ts`

### 3.3 Skill Progression System
- [x] XP curve: `xp_for_level = base * (level ^ exponent)`
- [x] Daily cap enforcement (hard cap combat, diminishing returns others)
- [x] Efficiency calculator: `efficiency = max(0, 1 - (turns/cap)^n)`

**Key file:** `packages/game-engine/src/skills/xpCalculator.ts`

---

## Phase 4: Exploration & Combat API (Week 4) ✅

### 4.1 Exploration Endpoints
- [x] `POST /api/exploration/start` - spend turns, get encounters
- [x] `GET /api/exploration/estimate` - probability preview
- [x] `GET /api/zones` - discovered zones

### 4.2 Combat Endpoints
- [x] `POST /api/combat/start` - run combat, return log + rewards
- [x] `GET /api/combat/logs/:id` - playback data

### 4.3 Loot & Rewards
- [x] Loot resolver (drop tables → item instances)
- [x] XP grant service (cap checking, efficiency)

### 4.4 Verification & Testing
- [x] Seed data for local testing (`npm run db:seed`)
- [x] Manual smoke test doc (`docs/testing/phase-4.md`)
- [ ] Minimal dev UI harness (optional; can pull forward from Phase 7–8)

---

## Phase 5: Inventory & Equipment (Week 5) ✅

### 5.1 Inventory Backend
- [x] `GET /api/inventory` - all items
- [x] `DELETE /api/inventory/:id` - destroy item (supports stack reduction)
- [x] Stack management (loot merge + quantities)

### 5.2 Equipment System
- [x] `POST /api/equipment/equip` - validate requirements, equip
- [x] `POST /api/equipment/unequip`
- [x] Equipment stat calculator (aggregate + skill scaling)

### 5.3 Durability System
- [x] Degrade on combat
- [x] Basic repair (turns + max durability decay) (`POST /api/inventory/repair`)

---

## Phase 6: Gathering & Crafting (Week 6) ✅

### 6.1 Mining System
- [x] `POST /api/gathering/mine` - spend turns, get resources + XP
- [~] Resource node discovery (via exploration) (discovery exists; mining doesn’t strictly enforce “discovered” yet)

### 6.2 Weaponsmithing System
- [x] `GET /api/crafting/recipes` - available recipes
- [x] `POST /api/crafting/craft` - validate, deduct, create item

---

## Phase 7: Frontend Core UI (Week 7)

### 7.1 Layout & Navigation
- [ ] Main layout with turn display header
- [ ] Navigation menu
- [ ] Turn display widget (balance, time to cap, regen indicator)

### 7.2 Character Screen
- [ ] Skills display (8 skills, levels, XP bars, efficiency)
- [ ] Equipment panel (11 slots visual, tooltips, durability)
- [ ] Stats summary

### 7.3 Exploration UI
- [ ] Zone selector
- [ ] Turn investment slider + probability preview
- [ ] Log playback (narrative, discoveries)

---

## Phase 8: Combat & Activity UI (Week 8)

### 8.1 Combat Screen
- [ ] Combat log display (round-by-round, auto-scroll)
- [ ] Rewards display (XP, loot)
- [ ] Combat summary

### 8.2 Inventory UI
- [ ] Item grid
- [ ] Item actions (equip, destroy, details modal)

### 8.3 Gathering & Crafting UI
- [ ] Mining interface (nodes, turn investment, yield preview)
- [ ] Crafting interface (recipes, materials, craft button)

---

## Phase 9: Bestiary & Polish (Week 9)

### 9.1 Bestiary System
- [ ] `GET /api/bestiary` - discovered mobs
- [ ] Progressive reveal (1 kill: name, 5: zones, 10: weaknesses, 25: drops)

### 9.2 Bestiary UI
- [ ] Mob list with unlock progress
- [ ] Mob detail page

### 9.3 Tutorial Integration
- [ ] Tutorial state tracking
- [ ] Contextual tooltip overlays
- [ ] Skip button

---

## Phase 10: Testing & Launch Prep (Week 10)

### 10.1 Testing
- [ ] Unit tests (combat engine, probability, XP)
- [ ] Integration tests (API endpoints)
- [ ] E2E tests (core loop, auth)

### 10.2 Data Seeding
- [ ] Starter zone: 5-8 mobs with stats + drop tables
- [ ] Equipment templates: 3-4 tiers
- [ ] Crafting recipes: tier 1-2 weapons

### 10.3 PWA Configuration
- [ ] Service worker (offline caching)
- [ ] Manifest (icons, theme)
- [ ] Install prompts

---

## Critical Path

```
Database Schema
  └── Turn System
      └── Auth System
          └── Combat Engine
              └── Exploration System
                  └── Combat API
                      └── Inventory API
                          └── Frontend Core
                              └── Combat UI
```

**Parallel workstreams:**
- Skill progression can parallel combat engine
- Gathering/Crafting can parallel frontend
- Bestiary can parallel testing

---

## MVP Content: Starter Zone "Forest Edge"

### Mobs

| Mob | HP | Attack | Defence | XP | Tier |
|-----|-----|--------|---------|-----|------|
| Training Dummy | 10 | 5 | 5 | 5 | Tutorial |
| Forest Rat | 15 | 8 | 3 | 10 | 1 |
| Wild Boar | 25 | 12 | 8 | 20 | 1 |
| Cave Bat | 20 | 10 | 5 | 15 | 1 |
| Goblin Scout | 30 | 15 | 10 | 30 | 2 |
| Forest Wolf | 35 | 18 | 12 | 40 | 2 |
| Goblin Warrior | 45 | 22 | 15 | 60 | 3 |

### Resources
- Copper Ore Node (Mining 1)
- Coal Deposit (Mining 5)
- Iron Ore Node (Mining 10)

### Equipment Tiers

| Tier | Example | Required Level | Attack Bonus |
|------|---------|----------------|--------------|
| 1 | Wooden Sword | 1 | +5 |
| 2 | Bronze Sword | 10 | +12 |
| 3 | Iron Sword | 20 | +20 |
| 4 | Steel Sword | 30 | +30 |

---

## Tunable Constants

```typescript
// packages/shared/src/constants/gameConstants.ts

export const TURN_CONSTANTS = {
  REGEN_RATE: 1,              // turns per second
  BANK_CAP: 64800,            // 18 hours
  STARTING_TURNS: 86400,      // 24 hours for new players
};

export const COMBAT_CONSTANTS = {
  BASE_HIT_CHANCE: 0.7,       // 70% base hit rate
  CRIT_CHANCE: 0.05,          // 5% crit
  CRIT_MULTIPLIER: 1.5,
};

export const SKILL_CONSTANTS = {
  XP_BASE: 100,
  XP_EXPONENT: 1.5,
  DAILY_CAP_COMBAT: 10000,    // XP per day
  EFFICIENCY_DECAY_POWER: 2,  // for diminishing returns
};

export const EXPLORATION_CONSTANTS = {
  MOB_ENCOUNTER_BASE_CHANCE: 0.001,   // per turn
  RESOURCE_NODE_BASE_CHANCE: 0.0005,
  HIDDEN_CACHE_BASE_CHANCE: 0.0001,
};

export const DURABILITY_CONSTANTS = {
  COMBAT_DEGRADATION: 1,      // per combat
  REPAIR_COST_TURNS: 100,
  MAX_DURABILITY_DECAY: 5,    // per repair
};
```

---

## Success Criteria

1. **Core Loop Works:** Turns → explore → fight → XP → level up
2. **Progression Feels Rewarding:** XP curve and loot create engagement
3. **Turn Economy Balanced:** Players check in 1-2x daily naturally
4. **Performance:** API response < 200ms
5. **Reliable:** Auth, turns, combat all work correctly
