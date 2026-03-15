# Overnight Loop Setup v2

Run each loop in its own terminal tab with `claude --dangerously-skip-permissions`.
5 tabs, 5 sessions, paste one block per tab.

---

## Tab 1: Code Health Auditor

```
Create the folder `docs/loop-v2/code-health/` if it doesn't exist, then set up a recurring loop (*/10 * * * *):

Pick ONE file (service, route, engine module, or utility). Read existing reports in `docs/loop-v2/code-health/` first to avoid repeats. Audit it for ALL of the following:
- **Type safety**: `as` casts, implicit `any`, weak generic types, missing return types
- **Error handling**: swallowed errors, uncaught promises, missing try/catch in async code, errors that lose context
- **Dead code**: unused exports, unreachable branches, commented-out code, orphan imports
- **Unused exports**: trace whether each export is imported anywhere — if not, flag it

Save as `docs/loop-v2/code-health/YYYY-MM-DD-HHMMSS-filename.md` with: File Audited, Findings (grouped by category above), Severity (critical/high/medium/low per finding), Suggested Fix (specific code changes).
```

---

## Tab 2: Database Auditor

```
Create the folder `docs/loop-v2/database/` if it doesn't exist, then set up a recurring loop (*/10 * * * *):

Pick ONE service file that makes Prisma calls. Read existing reports in `docs/loop-v2/database/` first to avoid repeats. Trace its full DB interaction path and audit for ALL of the following:
- **N+1 queries**: loops that make individual queries instead of batched/included queries
- **Missing indexes**: query patterns (WHERE, ORDER BY, JOIN conditions) that lack supporting indexes in the Prisma schema
- **Payload bloat**: queries that fetch full rows when only a few fields are needed (missing `select`)
- **Cache issues**: Redis usage gaps — data that's fetched repeatedly but never cached, or cached but never invalidated on write
- **Migration risks**: schema patterns that would be dangerous to change (required fields without defaults, implicit cascades, missing @@index)

Save as `docs/loop-v2/database/YYYY-MM-DD-HHMMSS-service-name.md` with: Service Audited, Prisma Models Touched, Findings (grouped by category above), Query Patterns (show the actual Prisma calls), Suggested Fix.
```

---

## Tab 3: Player Experience Simulator

```
Create the folder `docs/loop-v2/player-experience/` if it doesn't exist, then set up a recurring loop (*/10 * * * *):

Pick ONE player scenario and simulate it mathematically using actual values from `packages/shared/src/constants/gameConstants.ts`. Read existing reports in `docs/loop-v2/player-experience/` first to avoid repeats. Scenarios to rotate through:
- **New player first 50 turns**: what can they realistically do? Where do they get stuck?
- **Specific skill grind**: pick one skill, model time-to-level at key breakpoints (10, 25, 50, 75, 100)
- **Gold economy**: model income vs expenses for a player at a specific level range
- **Gear progression**: how long to craft/find upgrades at each tier?
- **Zone progression**: when should a player move zones? Is the power curve smooth?
- **Cross-system consistency**: verify that types, constants, DB schema, and business rules agree. Find orphan enum values, constants referenced nowhere, schema fields with no API exposure

Show your math. Flag dead ends, frustration spikes, progression walls, or exploitable shortcuts. Save as `docs/loop-v2/player-experience/YYYY-MM-DD-HHMMSS-scenario-name.md` with: Scenario, Assumptions, Math (step by step), Findings, Recommendations.
```

---

## Tab 4: Frontend Auditor

```
Create the folder `docs/loop-v2/frontend/` if it doesn't exist, then set up a recurring loop (*/10 * * * *):

Pick ONE page or component from `apps/web/src/`. Read existing reports in `docs/loop-v2/frontend/` first to avoid repeats. Audit for ALL of the following:
- **Accessibility**: missing ARIA labels, no keyboard navigation, missing alt text, color contrast issues, no focus indicators
- **Component duplication**: UI patterns in this file that are nearly identical to patterns in other files — candidates for extraction to `components/common/`
- **State issues**: stale closures, missing deps in useEffect, race conditions in async state updates, state that should be derived instead of stored
- **UX issues**: missing loading states, no error feedback, confusing layouts, inconsistent styling with rest of app

Save as `docs/loop-v2/frontend/YYYY-MM-DD-HHMMSS-component-name.md` with: Component Audited, Findings (grouped by category above), Severity, Suggested Fix (specific code changes or component extractions).
```

---

## Tab 5: Lore Writer

```
Create the folder `docs/loop-v2/lore/` if it doesn't exist, then set up a recurring loop (*/10 * * * *):

Pick ONE area of the game and write flavor text for it. Read existing lore in `docs/loop-v2/lore/` first to avoid repeats and maintain consistency. Rotate through:
- **Item descriptions**: pick 3-5 items from the DB schema/constants that lack flavor. Write short (1-2 sentence) descriptions that hint at world-building
- **Mob flavor text**: pick a mob type, write a bestiary entry (appearance, behavior, lore origin, combat feel)
- **Zone atmosphere**: pick a zone, write the arrival text, ambient descriptions, and environmental flavor
- **NPC dialogue snippets**: shopkeeper lines, quest-giver hooks, incidental world-building dialogue
- **Achievement/title flavor**: write satisfying unlock text for achievements

Tone: dark fantasy with dry humor. Not grimdark, not silly. Think Runescape meets Hades. Save as `docs/loop-v2/lore/YYYY-MM-DD-HHMMSS-topic.md` with: Category, Content, Notes (how/where to integrate it). Never use em-dashes. 
```
