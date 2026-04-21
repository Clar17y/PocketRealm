```bash
npm run test           # All tests across all workspaces
npm run test:engine    # Game engine unit tests
npm run test:api       # API integration tests
```

**Test distribution (~88 test files):**
- `packages/game-engine/` — 26 test files (combat, XP, turns, exploration, HP, crafting, items, inventory, resources, events, casino)
- `apps/api/src/services/` — 44 test files (one per service)
- `apps/api/src/middleware/` — 3 test files (auth, admin, error handler)
- `apps/api/src/routes/` — 4 test files (admin, exploration tutorial, player settings/tutorial)
- `apps/api/src/socket/` — 1 test file (socketAuth)
- `apps/web/src/lib/` — 6 test files (rarity, assets, format, combatShare, changelog, utils)
- `packages/shared/src/` — 6 test files (gameConstants, mobPrefixes, achievementDefinitions, worldEventTemplates, achievementChains, tierUtils)
