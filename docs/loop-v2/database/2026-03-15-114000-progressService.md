# Database Audit: progressService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/progressService.ts` (33 lines, 1 exported function)

## Prisma Models Touched

Direct: none
Via sub-services: `GuildMember` (via `getPlayerGuildId`), `PlayerQuest` (via `incrementQuestProgress`), `GuildContract`, `Guild`, `GuildLog` (via `incrementContractProgress`)

---

## Findings

### N+1 Queries

**1. `incrementQuestProgress` — per-quest update loop (transitive, in questService)**
Fetches all active quests for the player, then loops over matching ones and updates each individually. Per matching quest: 1 `update` + possibly 1 `updateMany` (completion guard).

```ts
// In questService.incrementQuestProgress:
const activeQuests = await prisma.playerQuest.findMany({
  where: { playerId, status: 'active' },
});
for (const quest of activeQuests) {
  // ... filter by type ...
  await prisma.playerQuest.update({ where: { id: quest.id }, ... });
  if (completed) await prisma.playerQuest.updateMany({ ... });
}
```

### Missing Indexes

No new issues. `PlayerQuest` uses `@@index([playerId, status])` — well indexed.

### Payload Bloat

**1. `playerQuest.findMany` — no `select` (transitive, in questService)**
Fetches full `PlayerQuest` rows. Only uses: `questKey`, `filterValue`, `id`, `currentValue`, `targetValue`, `status`.

### Cache Issues

**1. `getPlayerGuildId` called redundantly — 3× per combat (line 20)**
In the combat path, `trackProgress` is called 3 times sequentially (`kill_count`, `kill_family`, `kill_prefix`). Each call independently fetches the guild ID via `getPlayerGuildId`. The result is identical across all 3 calls.

```ts
// Called 3 times from combatOrchestrationService.processCombatVictoryRewards:
const killProgress = await trackProgress(playerId, 'kill_count', 1);
const familyProgress = await trackProgress(playerId, 'kill_family', 1);
const prefixProgress = await trackProgress(playerId, 'kill_prefix', 1, { prefix });
// Each calls getPlayerGuildId internally — 3 redundant queries
```

Additionally, `getPlayerGuildId` is called a 4th time directly in `processCombatVictoryRewards` (line 225 of combatOrchestrationService) before these `trackProgress` calls.

**2. Active quests fetched 3× per combat (transitive)**
Same issue — `incrementQuestProgress` fetches the same `playerQuest.findMany({ playerId, status: 'active' })` on each of the 3 `trackProgress` calls. The active quest list is identical across calls.

### Migration Risks

None.

---

## Query Patterns

### `trackProgress` — 2 + N queries per call

| Step | Query | Index | Notes |
|------|-------|-------|-------|
| 1 | `getPlayerGuildId` → `guildMember.findUnique` | `@@unique(playerId)` | Redundant across calls |
| 2 | `incrementQuestProgress` → `playerQuest.findMany` | `@@index([playerId, status])` | Redundant across calls |
| 3–N | Per matching quest: `playerQuest.update` | PK | N+1 |
| parallel | `incrementContractProgress` | Various | Fire-and-forget |

**Per `trackProgress` call:** 2 + M queries (M = matching quests)
**Per combat (3 calls):** 6 + 3M queries — **could be 2 + M with batching**

---

## Suggested Fixes

### Priority 1 — Accept pre-fetched `guildId` parameter

```ts
export async function trackProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: { prefix?: string },
  guildId?: string | null,  // ← add this
): Promise<QuestProgressUpdate[]> {
  const resolvedGuildId = guildId !== undefined ? guildId : await getPlayerGuildId(playerId);
  // ...
}
```

The caller (`processCombatVictoryRewards`) already has `guildId` from line 225. Pass it through to save 3 queries per combat.

### Priority 2 — Batch `trackProgress` calls

Create a `trackProgressBatch` that handles multiple progress types in one pass:

```ts
export async function trackProgressBatch(
  playerId: string,
  updates: Array<{ type: ProgressType; amount: number; metadata?: { prefix?: string } }>,
  guildId?: string | null,
): Promise<QuestProgressUpdate[]> {
  const resolvedGuildId = guildId !== undefined ? guildId : await getPlayerGuildId(playerId);

  // Fetch active quests ONCE
  const activeQuests = await prisma.playerQuest.findMany({
    where: { playerId, status: 'active' },
    select: { id: true, questKey: true, filterValue: true, currentValue: true, targetValue: true },
  });

  // Process all types against the quest list
  // ...
}
```

Reduces 3× (guild ID + quest fetch) to 1× each. Saves ~4 queries per combat.

### Priority 3 — Add `select` to quest fetch (in questService)

```ts
prisma.playerQuest.findMany({
  where: { playerId, status: 'active' },
  select: { id: true, questKey: true, filterValue: true, currentValue: true, targetValue: true, status: true },
});
```
