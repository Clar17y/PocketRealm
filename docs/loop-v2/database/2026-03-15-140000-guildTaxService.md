# Database Audit: guildTaxService

**Date:** 2026-03-15
**Service:** `apps/api/src/services/guildTaxService.ts` (151 lines, 6 exported functions + 3 pure utilities)

## Prisma Models Touched

Direct: `GuildMember`, `Guild`, `TurnBank`
Via sub-service: `TurnBank` (via `spendPlayerTurnsTx`)

---

## Findings

### N+1 Queries
None.

### Missing Indexes
None — all queries use `@@unique(playerId)` on GuildMember and PK on Guild.

### Payload Bloat

**1. `spendWithTaxTx` — redundant guild member fetch (lines 79–82)**
Calls `getPlayerTaxRateTx` (which fetches `guildMember` + `guild.{id, taxRate}`) and then `applyGuildTaxTx` (which fetches the SAME `guildMember` + `guild.{id, taxRate, treasuryTurns, level}`). Same data queried twice within one transaction.

```ts
// Line 79: fetches guildMember + guild.{id, taxRate}
const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
const actualCost = calculateInflatedCost(baseCost, taxRate);
await spendPlayerTurnsTx(tx, playerId, actualCost);
// Line 82: fetches guildMember + guild.{id, taxRate, treasuryTurns, level} AGAIN
const taxResult = await applyGuildTaxTx(tx, playerId, actualCost);
```

**2. `turnBank.findUnique` without select in zero-cost path (line 66)**
Fetches full `TurnBank` row. Uses `currentTurns` and `lastRegenAt` — 2 fields.

### Cache Issues
No Redis usage. Tax data is always read inside transactions for consistency — not cacheable.

### Migration Risks
None. Good patterns: atomic increments, treasury cap enforcement.

---

## Query Patterns

### `getPlayerTaxRateTx` — 1 query

| Query | Select/Include | Index |
|-------|---------------|-------|
| `guildMember.findUnique({ playerId })` | `include: { guild: { select: { id, taxRate } } }` | `@@unique(playerId)` |

Good `select` on guild join.

### `applyGuildTaxTx` — 1–3 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `guildMember.findUnique({ playerId })` with guild select | Good join select |
| 2 | `guild.update({ treasuryTurns: { increment } })` | Conditional (tax > 0) |
| 3 | `guildMember.update({ totalTurnsContributed: { increment } })` | Conditional (tax > 0) |

### `spendWithTaxTx` — 3–6 queries

| Step | Query | Notes |
|------|-------|-------|
| 1 | `getPlayerTaxRateTx` | **Redundant** — same data re-fetched in step 3 |
| 2 | `spendPlayerTurnsTx` | 1–2 queries |
| 3 | `applyGuildTaxTx` | 1–3 queries (re-fetches guild member) |

---

## Suggested Fixes

### Priority 1 — Eliminate redundant fetch in `spendWithTaxTx`

Fetch the guild member once and pass the data to both calculations:

```ts
export async function spendWithTaxTx(tx, playerId, baseCost) {
  const membership = await tx.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true, treasuryTurns: true, level: true } } },
  });

  const taxRate = membership?.guild.taxRate ?? 0;
  const actualCost = calculateInflatedCost(baseCost, taxRate);
  const turnSpend = await spendPlayerTurnsTx(tx, playerId, actualCost);

  // Apply tax using pre-fetched data instead of re-querying
  let taxResult: TaxResult;
  if (!membership || taxRate === 0) {
    taxResult = NO_TAX(actualCost);
  } else {
    const taxAmount = Math.floor(actualCost * (taxRate / 100));
    // ... apply treasury update using membership.guild data ...
  }

  return { turnSpend, taxResult };
}
```

Saves 1 query per taxed turn spend. This function is called on every crafting, forging, salvaging, and travel action.

### Priority 2 — Add `select` to zero-cost turnBank fetch

```ts
const bank = await tx.turnBank.findUnique({
  where: { playerId },
  select: { currentTurns: true, lastRegenAt: true },
});
```
