# Expedition Auto-Resolve & Auto-Advance — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instant room auto-resolve (backend, with token bonus) and auto-advance toggle (frontend timer) to guild expeditions.

**Architecture:** Auto-resolve loops the existing `resolveRaidRound()` pure function in-memory until room clear or wipe, then persists final state in one DB transaction. Auto-advance is a frontend-only `setInterval` that auto-clicks force-round every 10 seconds.

**Tech Stack:** TypeScript, Vitest, Express routes, React (frontend toggle)

**Spec:** `docs/superpowers/specs/2026-03-11-expedition-auto-resolve-design.md`

**Business Rules:** `docs/business-rules.md` (check expedition sections before starting)

**Scope:** Backend auto-resolve (Chunk 1-2) + Frontend auto-advance toggle (Chunk 3).

**Compilability Note:** Each chunk boundary is independently compilable and testable.

---

## Chunk 1: Constants & Auto-Resolve Service

### Task 1: Add auto-resolve constants

**Files:**
- Modify: `packages/shared/src/constants/gameConstants.ts` (EXPEDITION_CONSTANTS block, ~line 1374)

- [ ] **Step 1: Add constants**

In `packages/shared/src/constants/gameConstants.ts`, add to the `EXPEDITION_CONSTANTS` object before the closing `} as const;`:

```typescript
  AUTO_RESOLVE_TOKEN_BONUS_PERCENT: 0.25,
  AUTO_RESOLVE_MAX_ROUNDS: 100,
```

- [ ] **Step 2: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/gameConstants.ts
git commit -m "feat: add auto-resolve expedition constants"
```

---

### Task 2: Implement autoResolveRoom service function

**Files:**
- Modify: `apps/api/src/services/expeditionService.ts`

This is the core function. It reuses the existing round resolution pieces but loops in-memory.

- [ ] **Step 1: Add the autoResolveRoom function**

In `apps/api/src/services/expeditionService.ts`, add after the `resolveExpeditionRound` function (after line 877). The function needs to import `EXPEDITION_CONSTANTS` (already imported) and `resolveRaidRound` (already imported).

```typescript
export interface AutoResolveResult {
  outcome: 'cleared' | 'wiped';
  roundsResolved: number;
  roundLogs: ExpeditionRoundLog[];
  tokensAwarded: number;
}

export async function autoResolveRoom(expeditionId: string): Promise<AutoResolveResult> {
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id: expeditionId },
    include: {
      members: { include: { player: { select: { username: true } } } },
    },
  });
  if (!expedition || expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }
  if (expedition.roundNumber !== 0) {
    throw new AppError(400, 'Room already has rounds resolved — cannot auto-resolve', 'ROUND_IN_PROGRESS');
  }

  // Prevent background timer from interfering
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: { nextRoundAt: null },
  });

  const rooms = expedition.roomDefinitions as unknown as ExpeditionRoomDefinition[];
  const currentRoomDef = rooms[expedition.currentRoom];
  if (!currentRoomDef) {
    throw new AppError(400, 'No room to resolve', 'NO_ROOM');
  }

  // Build participants once
  const aliveMembers = expedition.members.filter(m => !m.isKnockedOut && m.currentHp > 0);
  if (aliveMembers.length === 0) {
    // Already wiped before starting
    await handleWipe(expeditionId);
    return { outcome: 'wiped', roundsResolved: 0, roundLogs: [], tokensAwarded: 0 };
  }

  const participants: RaidParticipant[] = await Promise.all(
    aliveMembers.map(m => buildRaidParticipant(m)),
  );

  // Build summon pool
  const theme = EXPEDITION_THEMES_BY_ID.get(expedition.themeId ?? '');
  const summonPool: ExpeditionMobState[] = [];
  if (theme) {
    const summonNames = [theme.regularAdd.name, theme.casterAdd.name];
    const summonTemplates = await prisma.mobTemplate.findMany({
      where: { isExpeditionMob: true, name: { in: summonNames } },
      select: { id: true, name: true },
    });
    const summonIdByName = new Map(summonTemplates.map(t => [t.name, t.id]));

    [theme.regularAdd, theme.casterAdd].forEach((add, i) => {
      summonPool.push({
        id: `summon-template-${i}`,
        mobTemplateId: summonIdByName.get(add.name) ?? '',
        name: add.name,
        prefix: null,
        hp: add.hp,
        maxHp: add.hp,
        stats: { ...add.stats, hp: add.hp, maxHp: add.hp },
        actionTemplate: [...add.actionTemplate],
        activeEffects: [],
      });
    });
  }

  // In-memory state for the loop
  let mobs = currentRoomDef.mobs.filter(m => m.hp > 0);
  let threatTable = initThreatTable(aliveMembers.map(m => m.playerId));
  const allRoundLogs: ExpeditionRoundLog[] = [];
  // Track potions consumed per player across all rounds
  const potionsByPlayer = new Map<string, PotionConsumed[]>();
  // Track damage/healing per player across all rounds
  const damageByPlayer = new Map<string, number>();
  const healingByPlayer = new Map<string, number>();
  let roundNumber = 0;

  // Run rounds until room clear, wipe, or max rounds
  while (roundNumber < EXPEDITION_CONSTANTS.AUTO_RESOLVE_MAX_ROUNDS) {
    roundNumber++;

    const survivingMobs = mobs.filter(m => m.hp > 0);
    if (survivingMobs.length === 0) break;

    const alivePlayers = participants.filter(p => p.hp > 0);
    if (alivePlayers.length === 0) break;

    const input: RaidRoundInput = {
      mobs: survivingMobs,
      participants: alivePlayers,
      threatTable,
      roundNumber,
      environmentalDotPercent: currentRoomDef.environmentalDotPercent,
      summonPool: summonPool.map(s => ({ ...s, activeEffects: [] })),
    };

    const result = resolveRaidRound(input);

    // Carry forward participant state
    for (const pr of result.participantResults) {
      const p = participants.find(pp => pp.playerId === pr.playerId);
      if (!p) continue;

      p.hp = pr.hpAfter;
      p.stamina = pr.staminaAfter;
      p.mana = pr.manaAfter;
      p.templateRound = pr.templateRoundAfter;
      p.activeEffects = pr.activeEffectsAfter as typeof p.activeEffects;

      // Remove consumed potions from available pool
      for (const consumed of pr.potionsConsumed) {
        const idx = p.availablePotions.findIndex(pot => pot.templateId === consumed.templateId);
        if (idx >= 0) p.availablePotions.splice(idx, 1);
      }

      // Track consumed potions for later DB deduction
      if (pr.potionsConsumed.length > 0) {
        const existing = potionsByPlayer.get(pr.playerId) ?? [];
        existing.push(...pr.potionsConsumed);
        potionsByPlayer.set(pr.playerId, existing);
      }

      // Accumulate damage/healing
      damageByPlayer.set(pr.playerId, (damageByPlayer.get(pr.playerId) ?? 0) + pr.damageDealt);
      healingByPlayer.set(pr.playerId, (healingByPlayer.get(pr.playerId) ?? 0) + pr.healingDone);
    }

    // Carry forward mob state and threat table
    mobs = result.mobsAfter;
    threatTable = result.threatTableAfter;

    // Accumulate round log
    allRoundLogs.push({ ...result.roundLog, roomIndex: expedition.currentRoom });

    if (result.roomCleared || result.allPlayersDead) break;
  }

  // Determine outcome
  const outcome = mobs.filter(m => m.hp > 0).length === 0 ? 'cleared' : 'wiped';

  // Update room mob state
  const updatedRooms = [...rooms];
  const existingMobIds = new Set(currentRoomDef.mobs.map(m => m.id));
  const updatedMobs = currentRoomDef.mobs.map(mob => {
    const afterMob = mobs.find(m => m.id === mob.id);
    return afterMob
      ? { ...mob, hp: afterMob.hp, activeEffects: afterMob.activeEffects, actionTemplate: afterMob.actionTemplate }
      : { ...mob, hp: 0 };
  });
  for (const afterMob of mobs) {
    if (!existingMobIds.has(afterMob.id)) updatedMobs.push(afterMob);
  }
  updatedRooms[expedition.currentRoom] = { ...currentRoomDef, mobs: updatedMobs };

  // Persist final state
  await prisma.guildExpedition.update({
    where: { id: expeditionId },
    data: {
      roundNumber,
      roomDefinitions: JSON.parse(JSON.stringify(updatedRooms)),
      roundSummaries: JSON.parse(JSON.stringify(allRoundLogs)),
      nextRoundAt: null,
    },
  });

  // Update member records
  await Promise.all(
    participants.map(p => {
      const threatEntry = threatTable.find(t => t.playerId === p.playerId);
      const totalDamage = damageByPlayer.get(p.playerId) ?? 0;
      const totalHealing = healingByPlayer.get(p.playerId) ?? 0;

      return prisma.guildExpeditionMember.updateMany({
        where: { expeditionId, playerId: p.playerId },
        data: {
          currentHp: p.hp,
          currentStamina: p.stamina,
          currentMana: p.mana,
          totalDamage: { increment: totalDamage },
          totalHealing: { increment: totalHealing },
          roomDamage: { increment: totalDamage },
          roomHealing: { increment: totalHealing },
          isKnockedOut: p.hp <= 0,
          ...(p.hp <= 0 ? { targetMobId: null } : {}),
          templateRound: p.templateRound,
          activeEffects: JSON.parse(JSON.stringify(p.activeEffects)),
          threatValue: threatEntry?.threat ?? 0,
        },
      });
    }),
  );

  // Deduct all consumed potions
  for (const [playerId, consumed] of potionsByPlayer) {
    await deductConsumedPotions(playerId, consumed);
  }

  // Handle outcome
  let tokensAwarded = 0;
  if (outcome === 'cleared') {
    await handleRoomCleared(expeditionId);

    // Award bonus tokens on top of normal award (handleRoomCleared already awards base tokens)
    const roomType = currentRoomDef.roomType;
    const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[roomType];
    const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[expedition.tier - 1] ?? 1;
    const normalTokens = baseTokens * tierMultiplier;
    const bonusTokens = Math.floor(normalTokens * EXPEDITION_CONSTANTS.AUTO_RESOLVE_TOKEN_BONUS_PERCENT);
    tokensAwarded = normalTokens + bonusTokens;

    if (bonusTokens > 0) {
      const playerIds = expedition.members.map(m => m.playerId);
      await prisma.player.updateMany({
        where: { id: { in: playerIds } },
        data: { expeditionTokens: { increment: bonusTokens } },
      });
    }
  } else {
    await handleWipe(expeditionId);
  }

  return { outcome, roundsResolved: roundNumber, roundLogs: allRoundLogs, tokensAwarded };
}
```

- [ ] **Step 2: Build API to verify compilation**

Run: `npm run typecheck`
Expected: Clean build. If there are type issues with the round log access patterns, adjust the potion deduction to use `allPotionsConsumed` directly grouped by player from `result.participantResults` instead of parsing logs.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/expeditionService.ts
git commit -m "feat: add autoResolveRoom expedition service function"
```

---

## Chunk 2: Route & Integration

### Task 3: Add auto-resolve API endpoint

**Files:**
- Modify: `apps/api/src/routes/expedition.ts` (after the force-round endpoint, ~line 242)

- [ ] **Step 1: Add the route handler**

In `apps/api/src/routes/expedition.ts`, add after the force-round handler (line 242). Add `autoResolveRoom` to the imports from `../services/expeditionService`:

```typescript
// POST /:id/auto-resolve
expeditionRouter.post('/:id/auto-resolve', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = expeditionIdSchema.parse(req.params);

  const expedition = await prisma.guildExpedition.findUnique({
    where: { id },
    select: { id: true, guildId: true, status: true, roundNumber: true },
  });
  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }
  if (expedition.roundNumber !== 0) {
    throw new AppError(400, 'Room already has rounds resolved', 'ROUND_IN_PROGRESS');
  }

  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true, role: true },
  });
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }

  const result = await autoResolveRoom(id);

  res.json({
    success: true,
    outcome: result.outcome,
    roundsResolved: result.roundsResolved,
    tokensAwarded: result.tokensAwarded,
  });
}));
```

- [ ] **Step 2: Update imports**

Add `autoResolveRoom` to the import from `'../services/expeditionService'` at the top of the file.

- [ ] **Step 3: Build and typecheck**

Run: `npm run typecheck`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/expedition.ts
git commit -m "feat: add auto-resolve expedition API endpoint"
```

---

### Task 4: Add frontend API client function

**Files:**
- Modify: `apps/web/src/lib/api/expedition.ts`

- [ ] **Step 1: Add the API client function**

In `apps/web/src/lib/api/expedition.ts`, add after `forceNextRound`:

```typescript
export async function autoResolveRoom(expeditionId: string): Promise<{
  data?: { success: boolean; outcome: 'cleared' | 'wiped'; roundsResolved: number; tokensAwarded: number };
  error?: { message: string };
}> {
  return fetchApi(`/expedition/${expeditionId}/auto-resolve`, { method: 'POST' });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api/expedition.ts
git commit -m "feat: add autoResolveRoom frontend API client"
```

---

## Chunk 3: Frontend Auto-Advance & Auto-Resolve UI

### Task 5: Add auto-resolve button and auto-advance toggle to expedition UI

**Files:**
- Modify: `apps/web/src/components/guild/GuildExpeditionsTab.tsx`

- [ ] **Step 1: Add auto-resolve handler**

In `GuildExpeditionsTab.tsx`, add a handler near the existing `handleForceRound`:

```typescript
const handleAutoResolve = async () => {
  if (!expedition) return;
  if (!confirm('Auto-resolve this room? Your current templates will be locked and all rounds resolved instantly. You earn +25% bonus tokens on success.')) return;
  setActionLoading(true);
  setError(null);
  try {
    const res = await autoResolveRoom(expedition.id);
    if (res.error) { setError(res.error.message); return; }
    void loadExpedition();
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Failed to auto-resolve');
  } finally {
    setActionLoading(false);
  }
};
```

Add the `autoResolveRoom` import from `'@/lib/api/expedition'`.

- [ ] **Step 2: Add auto-advance state and effect**

Add state for the auto-advance toggle:

```typescript
const [autoAdvance, setAutoAdvance] = useState(false);
const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);

useEffect(() => {
  if (autoAdvance && expedition?.status === 'in_progress') {
    autoAdvanceRef.current = setInterval(() => {
      void forceNextRound(expedition.id).then(() => void loadExpedition());
    }, 10_000);
  }
  return () => {
    if (autoAdvanceRef.current) {
      clearInterval(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  };
}, [autoAdvance, expedition?.id, expedition?.status]);
```

Add `useRef` to React imports if not already present.

- [ ] **Step 3: Add auto-resolve button to UI**

Near the "Force Next Round" button, add the auto-resolve button (only visible at round 0 of a room):

```tsx
{expedition.roundNumber === 0 && myRole !== 'member' && (
  <button
    onClick={handleAutoResolve}
    disabled={actionLoading}
    className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--rpg-gold)] text-[var(--rpg-bg)] hover:brightness-110 disabled:opacity-50"
  >
    {actionLoading ? 'Resolving...' : 'Auto-Resolve Room (+25% tokens)'}
  </button>
)}
```

- [ ] **Step 4: Add auto-advance toggle button**

Near the force-round button:

```tsx
{myRole !== 'member' && expedition.roundNumber > 0 && (
  <button
    onClick={() => setAutoAdvance(prev => !prev)}
    className={`px-3 py-1.5 text-xs font-medium rounded ${
      autoAdvance
        ? 'bg-[var(--rpg-green-light)] text-[var(--rpg-bg)]'
        : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)]'
    }`}
  >
    {autoAdvance ? 'Auto: ON (10s)' : 'Auto: OFF'}
  </button>
)}
```

- [ ] **Step 5: Build frontend**

Run: `npm run build:web`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/guild/GuildExpeditionsTab.tsx
git commit -m "feat: add auto-resolve button and auto-advance toggle to expedition UI"
```

---

### Task 6: Typecheck and test

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass. No existing tests should break since auto-resolve is additive.

- [ ] **Step 3: Fix any failures**

If tests fail, diagnose and fix.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git commit -m "fix: resolve any integration issues from auto-resolve feature"
```
