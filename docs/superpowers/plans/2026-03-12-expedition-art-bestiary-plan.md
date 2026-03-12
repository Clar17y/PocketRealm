# Expedition Art & Bestiary Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add themed backgrounds and monster icons to guild expeditions, restructure the Bestiary into 4 tabs (Monsters, Expeditions, World Bosses, Prefixes), and track expedition mob kills for progressive unlock.

**Architecture:** New `PlayerExpeditionBestiary` Prisma model tracks kills. Two new API endpoints (`GET /bestiary/expeditions`, `GET /bestiary/bosses`) serve the new tabs. Frontend Bestiary component gains two new tab panels and a hook extension. Background switching extends the existing `screenBackgroundSrc()` utility. Art prompts are documentation-only deliverables.

**Tech Stack:** Prisma 6 (migration), Express routes, React (Next.js 16), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-12-expedition-art-bestiary-design.md`

---

## Chunk 1: Data Model & Backend

### Task 1: Prisma Migration — PlayerExpeditionBestiary

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (add model after `PlayerBestiaryPrefix` at ~line 382)
- Create: new migration via `npm run db:migrate`

- [ ] **Step 1: Add PlayerExpeditionBestiary model to schema**

Add after the `PlayerBestiaryPrefix` model (line 382):

```prisma
model PlayerExpeditionBestiary {
  playerId           String   @map("player_id")
  mobTemplateId      String   @map("mob_template_id") @db.VarChar(64)
  theme              String   @db.VarChar(32)
  killCount          Int      @default(0) @map("kill_count")
  firstEncounteredAt DateTime @default(now()) @map("first_encountered_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@id([playerId, mobTemplateId])
  @@map("player_expedition_bestiary")
}
```

Also add the reverse relation to the `Player` model — find the existing `bestiaryEntries` field and add below it:

```prisma
expeditionBestiaryEntries PlayerExpeditionBestiary[]
```

- [ ] **Step 2: Generate and run migration**

```bash
cd packages/database
npx prisma migrate dev --name add-player-expedition-bestiary
```

Expected: Migration creates `player_expedition_bestiary` table with composite PK.

- [ ] **Step 3: Generate Prisma client**

```bash
npm run db:generate
```

- [ ] **Step 4: Verify schema compiles**

```bash
npx prisma validate --schema packages/database/prisma/schema.prisma
```

Expected: "The schema is valid."

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/
git commit -m "feat(db): add PlayerExpeditionBestiary model"
```

---

### Task 2: Expedition Bestiary Service

**Files:**
- Create: `apps/api/src/services/expeditionBestiaryService.ts`
- Test: `apps/api/src/services/expeditionBestiaryService.test.ts`

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-03-12-expedition-art-bestiary-design.md` (unlock thresholds: 1/3/5)
- Expedition definitions: `packages/shared/src/constants/expeditionDefinitions.ts` (EXPEDITION_THEMES, ExpeditionThemeMob)
- Existing bestiary route pattern: `apps/api/src/routes/bestiary.ts`

- [ ] **Step 1: Write failing test for `getExpeditionBestiary`**

Create `apps/api/src/services/expeditionBestiaryService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database
vi.mock('@pocketrealm/database', () => ({
  prisma: {
    playerExpeditionBestiary: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@pocketrealm/database';
import { getExpeditionBestiary } from './expeditionBestiaryService';

const mockedFindMany = vi.mocked(prisma.playerExpeditionBestiary.findMany);

describe('getExpeditionBestiary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all themes with attempted=false when player has no kills', async () => {
    mockedFindMany.mockResolvedValue([]);

    const result = await getExpeditionBestiary('player1');

    expect(result.themes).toHaveLength(4);
    expect(result.themes.every(t => !t.attempted)).toBe(true);
    // Each theme still lists all mobs (undiscovered)
    expect(result.themes[0].mobs.length).toBeGreaterThan(0);
    result.themes[0].mobs.forEach(m => {
      expect(m.killCount).toBe(0);
      expect(m.stats).toBeNull();
      expect(m.rotation).toBeNull();
    });
  });

  it('marks theme as attempted when player has kills in it', async () => {
    mockedFindMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 2, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');

    const spiderNest = result.themes.find(t => t.theme === 'spider_nest')!;
    expect(spiderNest.attempted).toBe(true);

    const wolfPack = result.themes.find(t => t.theme === 'wolf_pack')!;
    expect(wolfPack.attempted).toBe(false);
  });

  it('reveals stats at 3+ kills', async () => {
    mockedFindMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 3, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');
    const mob = result.themes.find(t => t.theme === 'spider_nest')!.mobs.find(m => m.mobTemplateId === 'expCavernSpider')!;

    expect(mob.stats).not.toBeNull();
    expect(mob.stats!.hp).toBeGreaterThan(0);
    expect(mob.rotation).toBeNull(); // Not unlocked yet
  });

  it('reveals rotation at 5+ kills', async () => {
    mockedFindMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 5, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');
    const mob = result.themes.find(t => t.theme === 'spider_nest')!.mobs.find(m => m.mobTemplateId === 'expCavernSpider')!;

    expect(mob.stats).not.toBeNull();
    expect(mob.rotation).not.toBeNull();
    expect(mob.rotation!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run apps/api/src/services/expeditionBestiaryService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getExpeditionBestiary`**

Create `apps/api/src/services/expeditionBestiaryService.ts`:

```typescript
import { prisma } from '@pocketrealm/database';
import { EXPEDITION_THEMES } from '@pocketrealm/shared';
import type { ExpeditionTheme, ExpeditionThemeMob } from '@pocketrealm/shared';

type MobRole = 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';

interface ExpeditionBestiaryMob {
  mobTemplateId: string;
  name: string;
  role: MobRole;
  killCount: number;
  stats: { hp: number; attack: number; defence: number } | null;
  rotation: Array<{ round: number; actionName: string; targetMode: string }> | null;
}

interface ExpeditionBestiaryTheme {
  theme: string;
  themeName: string;
  attempted: boolean;
  mobs: ExpeditionBestiaryMob[];
}

export interface ExpeditionBestiaryResponse {
  themes: ExpeditionBestiaryTheme[];
}

const STATS_THRESHOLD = 3;
const ROTATION_THRESHOLD = 5;

/**
 * Returns the action rotation for a mob. Final bosses use phase-based
 * rotations from the theme definition; all other roles use actionTemplate.
 */
function getRotation(
  mob: ExpeditionThemeMob,
  role: MobRole,
  theme: ExpeditionTheme,
): Array<{ round: number; actionName: string; targetMode: string }> {
  if (role === 'final_boss') {
    // Final boss has phase1/phase2/phase3 templates on theme.finalBoss
    const allActions = [
      ...theme.finalBoss.phase1,
      ...theme.finalBoss.phase2,
      ...theme.finalBoss.phase3,
    ];
    return allActions.map((a, i) => ({
      round: i + 1,
      actionName: a.actionId,
      targetMode: a.targetMode,
    }));
  }
  return mob.actionTemplate.map((a, i) => ({
    round: i + 1,
    actionName: a.actionId,
    targetMode: a.targetMode,
  }));
}

/**
 * Builds the full mob roster for a theme with assigned roles.
 */
function getThemeMobRoster(theme: ExpeditionTheme): Array<{ mob: ExpeditionThemeMob; role: MobRole }> {
  const roster: Array<{ mob: ExpeditionThemeMob; role: MobRole }> = [];

  // All fields are top-level on ExpeditionTheme (no .mobs wrapper)
  for (const m of theme.trash) roster.push({ mob: m, role: 'trash' });
  for (const m of theme.elites) roster.push({ mob: m, role: 'elite' });
  roster.push({ mob: theme.casterAdd, role: 'caster' });
  roster.push({ mob: theme.regularAdd, role: 'add' });
  // miniBossAdds uses the same mob as regularAdd — no separate entry needed
  roster.push({ mob: theme.miniBoss, role: 'mini_boss' });
  roster.push({ mob: theme.finalBoss.mob, role: 'final_boss' });

  return roster;
}

export async function getExpeditionBestiary(playerId: string): Promise<ExpeditionBestiaryResponse> {
  const entries = await prisma.playerExpeditionBestiary.findMany({
    where: { playerId },
  });

  const killsByMob = new Map<string, number>();
  const attemptedThemes = new Set<string>();
  for (const e of entries) {
    killsByMob.set(e.mobTemplateId, e.killCount);
    attemptedThemes.add(e.theme);
  }

  const themes: ExpeditionBestiaryTheme[] = EXPEDITION_THEMES.map(theme => {
    const roster = getThemeMobRoster(theme);
    const attempted = attemptedThemes.has(theme.id);

    const mobs: ExpeditionBestiaryMob[] = roster.map(({ mob, role }) => {
      const kills = killsByMob.get(mob.key) ?? 0;
      return {
        mobTemplateId: mob.key,
        name: mob.name,
        role,
        killCount: kills,
        stats: kills >= STATS_THRESHOLD ? {
          hp: mob.hp,
          attack: mob.stats.attack,
          defence: mob.stats.defence,
        } : null,
        rotation: kills >= ROTATION_THRESHOLD
          ? getRotation(mob, role, theme as ExpeditionTheme)
          : null,
      };
    });

    return { theme: theme.id, themeName: theme.name, attempted, mobs };
  });

  return { themes };
}
```

> **Note:** `ExpeditionTheme` fields (`trash`, `elites`, `casterAdd`, `regularAdd`, `miniBoss`, `finalBoss`) are all top-level. The `miniBossAdds` field uses the same mob object as `regularAdd` — it's shared via a constant, so no separate bestiary entry is needed. The `finalBoss` object has `phase1`, `phase2`, `phase3` template arrays and a `mob` field.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run apps/api/src/services/expeditionBestiaryService.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/expeditionBestiaryService.ts apps/api/src/services/expeditionBestiaryService.test.ts
git commit -m "feat(api): add expedition bestiary service with progressive unlock"
```

---

### Task 3: World Boss Bestiary Service

**Files:**
- Create: `apps/api/src/services/bossBestiaryService.ts`
- Test: `apps/api/src/services/bossBestiaryService.test.ts`

**Reference docs:**
- Boss template definitions: `packages/shared/src/constants/bossTemplateDefinitions.ts`
- Boss encounter service pattern: `apps/api/src/services/bossEncounterService.ts`
- Spec unlock thresholds: 1/3/5 defeats

- [ ] **Step 1: Write failing test for `getWorldBossBestiary`**

Create `apps/api/src/services/bossBestiaryService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => ({
  prisma: {
    mobTemplate: {
      findMany: vi.fn(),
    },
    bossParticipant: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@pocketrealm/database';
import { getWorldBossBestiary } from './bossBestiaryService';

const mockedBossParticipants = vi.mocked(prisma.bossParticipant.findMany);
const mockedMobTemplates = vi.mocked(prisma.mobTemplate.findMany);

// Default boss mob template for all tests
const GORRATH_TEMPLATE = {
  id: 'gorrath', name: 'Gorrath the Undying',
  hp: 2000, attack: 180, accuracy: 180, defence: 95,
};

describe('getWorldBossBestiary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedMobTemplates.mockResolvedValue([GORRATH_TEMPLATE] as any);
  });

  it('returns boss roster with zero defeats for new player', async () => {
    mockedBossParticipants.mockResolvedValue([]);

    const result = await getWorldBossBestiary('player1');

    expect(result.bosses).toHaveLength(1);
    expect(result.bosses[0].defeatCount).toBe(0);
    expect(result.bosses[0].hpPerParticipant).toBeNull();
    expect(result.bosses[0].stats).toBeNull();
    expect(result.bosses[0].rotation).toBeNull();
  });

  it('reveals hpPerParticipant at 1+ defeats', async () => {
    mockedBossParticipants.mockResolvedValue([
      { encounterId: 'enc1', playerId: 'player1', encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 } },
    ] as any);

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss).toBeDefined();
    expect(boss!.defeatCount).toBe(1);
    expect(boss!.hpPerParticipant).not.toBeNull();
    expect(boss!.stats).toBeNull();
  });

  it('reveals stats at 3+ defeats', async () => {
    mockedBossParticipants.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        encounterId: `enc${i}`, playerId: 'player1',
        encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 },
      })) as any,
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss!.defeatCount).toBe(3);
    expect(boss!.stats).not.toBeNull();
    expect(boss!.rotation).toBeNull();
  });

  it('reveals rotation at 5+ defeats', async () => {
    mockedBossParticipants.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        encounterId: `enc${i}`, playerId: 'player1',
        encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 },
      })) as any,
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss!.defeatCount).toBe(5);
    expect(boss!.rotation).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run apps/api/src/services/bossBestiaryService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `getWorldBossBestiary`**

Create `apps/api/src/services/bossBestiaryService.ts`:

> **Important:** `BOSS_TEMPLATES` only contains `actions` (flat rotation array) and `actionDefinitions` — it does NOT have `name`, `hpPerParticipant`, `attack`, `defence`, or `phases`. Boss HP and stats come from the `MobTemplate` table (boss flag) and `BOSS_ENCOUNTER_CONSTANTS`. The template is keyed by the boss's **display name** (e.g. `'Stone Colossus'`), not a template ID.

```typescript
import { prisma } from '@pocketrealm/database';
import { BOSS_TEMPLATES, BOSS_ENCOUNTER_CONSTANTS } from '@pocketrealm/shared';

const HP_THRESHOLD = 1;
const STATS_THRESHOLD = 3;
const ROTATION_THRESHOLD = 5;

interface BossBestiaryEntry {
  bossTemplateId: string;
  name: string;
  defeatCount: number;
  hpPerParticipant: number | null;
  stats: { accuracy: number; defence: number } | null;
  rotation: Array<{ round: number; actionName: string; targetMode: string; isTelegraphed: boolean }> | null;
}

export interface WorldBossBestiaryResponse {
  bosses: BossBestiaryEntry[];
}

export async function getWorldBossBestiary(playerId: string): Promise<WorldBossBestiaryResponse> {
  // Get all boss-flagged mob templates for the full roster
  const bossMobTemplates = await prisma.mobTemplate.findMany({
    where: { isBoss: true },
    select: { id: true, name: true, hp: true, attack: true, accuracy: true, defence: true },
  });

  // Fetch player's boss encounter participations
  const participations = await prisma.bossParticipant.findMany({
    where: { playerId },
    include: {
      encounter: {
        select: { mobTemplateId: true, status: true, baseHp: true },
      },
    },
  });

  // Count defeats per boss mob template ID
  const defeatsByBoss = new Map<string, number>();
  const baseHpByBoss = new Map<string, number>();
  for (const p of participations) {
    if (p.encounter.status === 'defeated') {
      const id = p.encounter.mobTemplateId;
      defeatsByBoss.set(id, (defeatsByBoss.get(id) ?? 0) + 1);
      if (!baseHpByBoss.has(id)) baseHpByBoss.set(id, p.encounter.baseHp);
    }
  }

  const bosses: BossBestiaryEntry[] = bossMobTemplates.map(mob => {
    const defeats = defeatsByBoss.get(mob.id) ?? 0;
    const accuracy = typeof mob.accuracy === 'number' ? mob.accuracy : (mob.attack ?? 0);

    // hpPerParticipant from BOSS_ENCOUNTER_CONSTANTS or derived from baseHp
    const hpPerParticipant = baseHpByBoss.get(mob.id)
      ?? BOSS_ENCOUNTER_CONSTANTS.BASE_HP_PER_PARTICIPANT;

    // Rotation from BOSS_TEMPLATES (keyed by boss display name)
    const template = BOSS_TEMPLATES[mob.name];

    return {
      bossTemplateId: mob.id,
      name: mob.name,
      defeatCount: defeats,
      hpPerParticipant: defeats >= HP_THRESHOLD ? hpPerParticipant : null,
      stats: defeats >= STATS_THRESHOLD ? {
        accuracy,
        defence: mob.defence,
      } : null,
      rotation: defeats >= ROTATION_THRESHOLD && template
        ? template.actions.map((a, i) => ({
            round: i + 1,
            actionName: template.actionDefinitions[a.actionId]?.name ?? a.actionId,
            targetMode: a.targetMode,
            isTelegraphed: a.isTelegraphed ?? false,
          }))
        : null,
    };
  });

  return { bosses };
}
```

> **Note:** Verify `MobTemplate` has an `isBoss` field, and check the exact fields available (`attack`, `accuracy`, `defence`). Also verify `BossEncounter.baseHp` exists and that `BOSS_ENCOUNTER_CONSTANTS.BASE_HP_PER_PARTICIPANT` is the correct constant name. The boss rotation is a flat action list (no phases concept in `BOSS_TEMPLATES`), so the API returns a flat `rotation` array rather than `phases`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run apps/api/src/services/bossBestiaryService.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/bossBestiaryService.ts apps/api/src/services/bossBestiaryService.test.ts
git commit -m "feat(api): add world boss bestiary service with progressive unlock"
```

---

### Task 4: API Routes — Expedition & Boss Bestiary Endpoints

**Files:**
- Modify: `apps/api/src/routes/bestiary.ts` (add two new route handlers)
- Modify: `apps/api/src/index.ts` (no change needed — routes are on same router prefix)

**Reference:**
- Existing pattern: `apps/api/src/routes/bestiary.ts:26-148` (`GET /`)
- Service imports: `expeditionBestiaryService.ts`, `bossBestiaryService.ts`

- [ ] **Step 1: Add expedition bestiary route**

In `apps/api/src/routes/bestiary.ts`, add after the existing `GET /` handler (after line 148):

```typescript
import { getExpeditionBestiary } from '../services/expeditionBestiaryService';
import { getWorldBossBestiary } from '../services/bossBestiaryService';

bestiaryRouter.get('/expeditions', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getExpeditionBestiary(playerId);
  res.json(result);
}));

bestiaryRouter.get('/bosses', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await getWorldBossBestiary(playerId);
  res.json(result);
}));
```

Add the imports at the top of the file.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc apps/api/src/routes/bestiary.ts --noEmit
```

Expected: No errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/bestiary.ts
git commit -m "feat(api): add GET /bestiary/expeditions and GET /bestiary/bosses endpoints"
```

---

### Task 5: Record Expedition Kills During Round Resolution

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts` (~line 870, after round resolution)

**Reference:**
- How overworld combat records bestiary kills: `apps/api/src/routes/combat/start.ts:898-910` (upsert pattern)
- Round resolution: `apps/api/src/services/expeditionService.ts:748-875`
- Mob state: `ExpeditionMobState.mobTemplateId` is the key matching `expeditionDefinitions.ts` mob keys

The kill recording needs to happen in two places:
1. `resolveExpeditionRound()` — single round resolution (used by the timer)
2. `autoResolveRoom()` — batch round resolution (used by auto-resolve)

- [ ] **Step 1: Add helper function `recordExpeditionKills`**

Add a new function in `expeditionService.ts` (or extract to a helper file if the service is already large):

```typescript
/**
 * Upserts expedition bestiary entries for all participating players
 * when mobs are killed during a round/room.
 */
async function recordExpeditionKills(
  themeId: string,
  playerIds: string[],
  mobsBefore: ExpeditionMobState[],
  mobsAfter: ExpeditionMobState[],
): Promise<void> {
  // Find mobs that were alive before but are no longer in mobsAfter
  const afterIds = new Set(mobsAfter.map(m => m.id));
  const killedMobs = mobsBefore.filter(m => m.hp > 0 && !afterIds.has(m.id));
  if (killedMobs.length === 0) return;

  // Count kills per mobTemplateId (3 Cavern Spiders killed = 3 kills)
  const killCounts = new Map<string, number>();
  for (const mob of killedMobs) {
    killCounts.set(mob.mobTemplateId, (killCounts.get(mob.mobTemplateId) ?? 0) + 1);
  }

  // Upsert for each player × killed template with correct increment
  const upserts = [];
  for (const playerId of playerIds) {
    for (const [mobTemplateId, count] of killCounts) {
      upserts.push(
        prisma.playerExpeditionBestiary.upsert({
          where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
          create: { playerId, mobTemplateId, theme: themeId, killCount: count },
          update: { killCount: { increment: count } },
        }),
      );
    }
  }
  await Promise.all(upserts);
}
```

- [ ] **Step 2: Hook into `resolveExpeditionRound()`**

In `resolveExpeditionRound()`, after the round is resolved and member records updated (~line 870), add:

```typescript
// Record expedition bestiary kills for all alive participants
const participantIds = aliveMembers.map(m => m.playerId);
await recordExpeditionKills(expedition.themeId, participantIds, survivingMobs, result.mobsAfter);
```

- [ ] **Step 3: Hook into `autoResolveRoom()`**

In `autoResolveRoom()`, after the while loop completes (~line 996), compare initial mobs with final state:

```typescript
// Record expedition bestiary kills
const initialMobs = currentRoomDef.mobs.filter(m => m.hp > 0);
const participantIds = aliveMembers.map(m => m.playerId);
await recordExpeditionKills(expedition.themeId, participantIds, initialMobs, mobs);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc apps/api/src/services/expeditionService.ts --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/expeditionService.ts
git commit -m "feat(api): record expedition mob kills to bestiary during round resolution"
```

---

## Chunk 2: Frontend Changes

### Task 6: Background Switching for Expeditions

**Files:**
- Modify: `apps/web/src/lib/assets.ts` (extend `screenBackgroundSrc`)
- Modify: `apps/web/src/app/game/page.tsx` (~line 1188, pass expedition context)
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx` (expose theme/room info)

- [ ] **Step 1: Extend `screenBackgroundSrc` signature**

In `apps/web/src/lib/assets.ts`, update the function:

```typescript
interface ExpeditionContext {
  theme: string;
  isBossRoom: boolean;
}

export function screenBackgroundSrc(
  screen: string,
  activeCraftingSkill?: string,
  expeditionContext?: ExpeditionContext,
): string | undefined {
  // Expedition background override
  if (screen === 'guild' && expeditionContext) {
    const suffix = expeditionContext.isBossRoom ? '_boss' : '';
    return `/assets/screens/screen_expedition_${expeditionContext.theme}${suffix}.webp`;
  }

  if (screen === 'crafting' && activeCraftingSkill && CRAFTING_SKILLS.has(activeCraftingSkill)) {
    return `/assets/screens/screen_${activeCraftingSkill}.webp`;
  }
  if (SCREEN_BACKGROUNDS.has(screen)) {
    return `/assets/screens/screen_${screen}.webp`;
  }
  return undefined;
}
```

- [ ] **Step 2: Pass expedition context from game page**

In `apps/web/src/app/game/page.tsx`, find where `screenBackgroundSrc` is called (~line 1188). The active expedition data should be available from the guild/expedition hooks. Pass the expedition context:

```typescript
const expeditionContext = activeExpedition && activeGuildTab === 'expeditions'
  ? {
      theme: activeExpedition.themeId,
      isBossRoom: activeExpedition.currentRoom === activeExpedition.totalRooms - 1,
    }
  : undefined;

const backgroundSrc = screenBackgroundSrc(activeScreen, activeCraftingSkill, expeditionContext)
  || (/* existing zone fallback */);
```

> **Note:** The exact variable names for the active expedition state need to be verified against the game controller. Look for `activeExpedition`, `expeditionStatus`, or similar in the game page or hooks. The key fields needed are `themeId`, `currentRoom`, and `totalRooms`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc apps/web/src/lib/assets.ts --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/assets.ts apps/web/src/app/game/page.tsx
git commit -m "feat(web): switch background based on active expedition theme"
```

---

### Task 7: API Client Functions for Expedition & Boss Bestiary

**Files:**
- Modify: `apps/web/src/lib/api/player.ts` (add two new API functions)
- Modify: `apps/web/src/lib/api/index.ts` (re-export new functions)

- [ ] **Step 1: Add API client functions**

In `apps/web/src/lib/api/player.ts`, add after the existing `getBestiary()` function:

```typescript
export async function getExpeditionBestiary() {
  return fetchApi<{
    themes: Array<{
      theme: string;
      themeName: string;
      attempted: boolean;
      mobs: Array<{
        mobTemplateId: string;
        name: string;
        role: 'trash' | 'elite' | 'caster' | 'add' | 'mini_boss' | 'final_boss';
        killCount: number;
        stats: { hp: number; attack: number; defence: number } | null;
        rotation: Array<{ round: number; actionName: string; targetMode: string }> | null;
      }>;
    }>;
  }>('/api/v1/bestiary/expeditions');
}

export async function getWorldBossBestiary() {
  return fetchApi<{
    bosses: Array<{
      bossTemplateId: string;
      name: string;
      defeatCount: number;
      hpPerParticipant: number | null;
      stats: { accuracy: number; defence: number } | null;
      rotation: Array<{ round: number; actionName: string; targetMode: string; isTelegraphed: boolean }> | null;
    }>;
  }>('/api/v1/bestiary/bosses');
}
```

- [ ] **Step 2: Re-export from index**

In `apps/web/src/lib/api/index.ts`, add `getExpeditionBestiary` and `getWorldBossBestiary` to the re-exports from `./player`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc apps/web/src/lib/api/player.ts --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api/player.ts apps/web/src/lib/api/index.ts
git commit -m "feat(web): add API client functions for expedition and boss bestiary"
```

---

### Task 8: Extend useBestiary Hook

**Files:**
- Modify: `apps/web/src/app/game/hooks/useBestiary.ts`

**Reference:** Existing hook pattern at `apps/web/src/app/game/hooks/useBestiary.ts`

- [ ] **Step 1: Add expedition and boss bestiary state + fetchers**

Extend `useBestiary.ts` to also fetch from the two new endpoints when the bestiary screen is active:

```typescript
import { getBestiary, getExpeditionBestiary, getWorldBossBestiary } from '@/lib/api';

// Add new interfaces (inline or imported from API types):
// ExpeditionBestiaryTheme, WorldBossEntry — match the API response shapes

// Add state:
const [expeditionThemes, setExpeditionThemes] = useState<ExpeditionBestiaryTheme[]>([]);
const [worldBosses, setWorldBosses] = useState<WorldBossEntry[]>([]);

// In loadBestiary, fetch all three in parallel:
const [bestiaryRes, expRes, bossRes] = await Promise.all([
  getBestiary(),
  getExpeditionBestiary(),
  getWorldBossBestiary(),
]);

if (bestiaryRes.data) { /* existing */ }
if (expRes.data) setExpeditionThemes(expRes.data.themes);
if (bossRes.data) setWorldBosses(bossRes.data.bosses);

// Return:
return { bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary, expeditionThemes, worldBosses, loadBestiary };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc apps/web/src/app/game/hooks/useBestiary.ts --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/game/hooks/useBestiary.ts
git commit -m "feat(web): extend useBestiary hook to fetch expedition and boss data"
```

---

### Task 9: Bestiary Component — 4-Tab Restructure

**Files:**
- Modify: `apps/web/src/components/screens/Bestiary.tsx`

**Reference:**
- Current component: `apps/web/src/components/screens/Bestiary.tsx` (520 lines, 2-view toggle)
- Mockups: `.superpowers/brainstorm/22381-1773332089/bestiary-tabs.html`
- Spec: expedition tab has theme sections with role badges, world boss tab has card layout

This is the largest frontend task. The existing component stays intact for the Monsters and Prefixes tabs. Two new tab panels are added.

- [ ] **Step 1: Update tab state and tab bar**

Change the `activeView` state from `'monsters' | 'prefixes'` to `'monsters' | 'expeditions' | 'bosses' | 'prefixes'`.

Update the tab bar to show 4 tabs:

```typescript
const [activeView, setActiveView] = useState<'monsters' | 'expeditions' | 'bosses' | 'prefixes'>('monsters');
```

Update the tab buttons:

```typescript
{(['monsters', 'expeditions', 'bosses', 'prefixes'] as const).map((view) => (
  <button
    key={view}
    onClick={() => setActiveView(view)}
    className={/* existing styles */}
  >
    {view === 'monsters' ? `Monsters ${discoveredCount}/${totalCount}`
      : view === 'expeditions' ? 'Expeditions'
      : view === 'bosses' ? 'World Bosses'
      : 'Prefixes'}
  </button>
))}
```

- [ ] **Step 2: Add props for new data**

Extend `BestiaryProps` to accept the new data:

```typescript
interface BestiaryProps {
  monsters: Monster[];
  prefixSummary: PrefixSummaryEntry[];
  expeditionThemes: ExpeditionBestiaryTheme[];
  worldBosses: WorldBossEntry[];
}
```

Define the types inline or import from the hook.

- [ ] **Step 3: Build Expeditions tab panel**

Create an `ExpeditionBestiaryTab` component (can be inline or extracted to a separate file if the component grows large). Renders:

- Theme sections with header (theme name + discovered count)
- 3-column grid of mob tiles with role badge
- Undiscovered mobs shown as "???"
- Unattempted themes dimmed at bottom
- Detail modal on click (reuses existing modal pattern, shows stats + rotation based on unlock)
- Monster icons via `monsterImageSrc(mob.name)`

Role badge styles:

```typescript
const ROLE_STYLES: Record<string, string> = {
  trash: 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)]',
  elite: 'bg-[var(--rpg-background)] text-[var(--rpg-blue-light)]',
  caster: 'bg-[var(--rpg-background)] text-[var(--rpg-purple)]',
  add: 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)]',
  mini_boss: 'bg-[var(--rpg-background)] text-[var(--rpg-purple)]',
  final_boss: 'bg-[var(--rpg-background)] text-[var(--rpg-gold)]',
};
```

- [ ] **Step 4: Build World Bosses tab panel**

Create a `WorldBossBestiaryTab` component. Renders:

- Card layout for each boss
- Boss icon via `monsterImageSrc(boss.name)`
- HP displayed as "X HP / participant"
- Stats shown or "???" based on unlock
- Unlock progress bar (defeatCount / 5)
- Undiscovered bosses as dashed-border placeholder cards
- Detail modal showing phase rotation when unlocked

- [ ] **Step 5: Wire tab panels into the render**

```typescript
{activeView === 'monsters' ? (
  {/* existing monster grid + modal */}
) : activeView === 'expeditions' ? (
  <ExpeditionBestiaryTab themes={expeditionThemes} />
) : activeView === 'bosses' ? (
  <WorldBossBestiaryTab bosses={worldBosses} />
) : (
  <PrefixEncyclopedia prefixSummary={prefixSummary} />
)}
```

- [ ] **Step 6: Pass new props from parent**

Find where `<Bestiary>` is rendered (likely in the game page or screen switcher) and pass the new props from the hook:

```typescript
<Bestiary
  monsters={bestiaryMobs}
  prefixSummary={bestiaryPrefixSummary}
  expeditionThemes={expeditionThemes}
  worldBosses={worldBosses}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc apps/web/src/components/screens/Bestiary.tsx --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/screens/Bestiary.tsx apps/web/src/app/game/
git commit -m "feat(web): restructure bestiary into 4 tabs with expedition and world boss panels"
```

---

## Chunk 3: Art Prompts & Monster Icons in Expedition UI

### Task 10: Generate Art Prompts

**Files:**
- Create: `docs/assets/expedition_background_prompts.md`
- Modify: `docs/assets/monster_prompts.md` (append new section)

**Reference:**
- Existing prompt format: `docs/assets/monster_prompts.md`
- Background prompt format: `docs/assets/stable-diffusion-workflow.md` (Zone/Landscape Art section)
- Expedition theme descriptions: `docs/superpowers/specs/2026-03-09-expedition-themed-encounters-design.md`
- All 32 mob names: see spec mob list

- [ ] **Step 1: Write expedition background prompts**

Create `docs/assets/expedition_background_prompts.md` with 8 prompts (4 themes x 2):

Each prompt follows the zone/landscape format:
```
pixel art landscape of [DESCRIPTION], fantasy RPG environment, atmospheric, wide view, [LIGHTING], [MOOD]
```

Themes:
- **Spider Nest room:** dark underground cavern with thick cobwebs, egg sacs, faintly glowing silk strands
- **Spider Nest boss:** massive web-covered chamber with a central nest, glowing venom pools, oppressive darkness
- **Wolf Pack room:** moonlit forest clearing with wolf tracks, scattered bones, misty undergrowth
- **Wolf Pack boss:** ancient wolf den in a rocky ravine, towering pines, full moon, pack howling atmosphere
- **Bandit Camp room:** crude wooden fortifications in a forest clearing, campfires, stolen goods
- **Bandit Camp boss:** fortified bandit stronghold with watchtowers, war banners, imposing palisade walls
- **Corrupted Grove room:** twisted diseased forest with bioluminescent fungus, rotting trees, sickly green mist
- **Corrupted Grove boss:** heart of corruption with a massive rotting tree, pulsing dark energy veins, spore clouds

- [ ] **Step 2: Write expedition monster prompts**

Append to `docs/assets/monster_prompts.md` a new section `--- Guild Expeditions` with 32 monster prompts. Follow the existing prompt format exactly:

```
Monster: [Name]
Prompt: pixel art of a [description], fantasy RPG [creature/elite creature/boss creature], front-facing, isolated on solid pure white background (#FFFFFF), consistent padding (10% canvas margin), no cast shadow, no glow, no border, no frame
```

Group by theme (Spider Nest, Wolf Pack, Bandit Camp, Corrupted Grove). Each mob prompt should visually match its theme and role (trash mobs simpler/smaller, bosses more imposing).

- [ ] **Step 3: Commit**

```bash
git add docs/assets/expedition_background_prompts.md docs/assets/monster_prompts.md
git commit -m "docs: add art prompts for expedition backgrounds and monster icons"
```

---

### Task 11: Wire Monster Icons into Expedition UI

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

**Reference:**
- `monsterImageSrc()` utility: `apps/web/src/lib/assets.ts:63-66`
- How bestiary renders monster images: `apps/web/src/components/screens/Bestiary.tsx:257-273`

Currently expedition mobs are displayed as text names only. Add monster icons alongside the mob name in the expedition combat UI.

- [ ] **Step 1: Import monsterImageSrc and Image**

```typescript
import { monsterImageSrc } from '@/lib/assets';
import Image from 'next/image';
```

- [ ] **Step 2: Add monster images to mob display**

Find where mobs are rendered in the expedition UI (mob health bars, mob names in the room view). Add the monster icon:

```typescript
<Image
  src={monsterImageSrc(mob.name)}
  alt={mob.name}
  width={32}
  height={32}
  className="image-rendering-pixelated"
/>
```

The exact placement depends on the existing mob rendering JSX in `GuildExpeditionsTab.tsx`. Look for where `mobDisplayName()` is called and add the image next to it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc apps/web/src/components/guild/GuildExpeditionsTab.tsx --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "feat(web): display monster icons in expedition combat UI"
```

---

### Task 12: Manual Testing & Cleanup

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Fix any failures.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Fix any errors.

- [ ] **Step 3: Manual testing checklist**

- Start dev server (`npm run dev`)
- Open Bestiary screen — verify 4 tabs render
- Monsters tab — unchanged, shows overworld mobs
- Expeditions tab — shows all 4 themes (dimmed if unattempted)
- World Bosses tab — shows boss cards with "???" for unencountered
- Prefixes tab — unchanged
- Navigate to guild with active expedition — verify background switches to theme
- Navigate to boss room — verify boss background loads
- Check expedition mob icons appear in expedition combat UI
- Check expedition bestiary mob icons appear in expedition bestiary tiles

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: cleanup and fixes from manual testing"
```
