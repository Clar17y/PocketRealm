```bash
npm run test           # All tests across all workspaces
npm run test:engine    # Game engine unit tests
npm run test:api       # API integration tests
npm run typecheck      # TypeScript project references
npm run verify:ci      # CI parity: typecheck, builds, engine/API/shared/web tests
```

**Test distribution (263 test/spec files as of 2026-05-12):**
- `packages/game-engine/` — 32 test files
- `apps/api/src/services/` — 95 test files
- `apps/api/src/middleware/` — 8 test files
- `apps/api/src/routes/` — 27 test files
- `apps/api/src/socket/` — 2 test files
- `apps/web/src/app/` — 27 test files
- `apps/web/src/components/` — 30 test files
- `apps/web/src/lib/` — 13 test files
- `apps/web/src/hooks/` — 6 test files
- `packages/shared/src/` — 10 test files

Refresh the total with:

```powershell
(rg --files | Where-Object { $_ -match '\.(test|spec)\.(ts|tsx)$' } | Measure-Object).Count
```
