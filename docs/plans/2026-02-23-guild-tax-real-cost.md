# Guild Tax Real Cost Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make guild tax reduce effectiveness in all turn-spending activities, and return tax info in every response so the frontend can display it.

**Architecture:** Add a `getPlayerTaxRateTx` helper to look up tax rate before turn calculations. Variable-turn routes (exploration, gathering, rest) use `taxResult.postTaxAmount` as effective turns. Fixed-cost routes (crafting, forge, salvage, travel) inflate the turn cost via `ceil(baseCost / (1 - rate/100))`. Every response includes a `tax: { rate, amount, guildId } | null` field.

**Tech Stack:** Prisma (transactions), Express routes (TypeScript), shared types, Next.js frontend (TypeScript).

---

## How the existing code works (read this first)

- **`applyGuildTaxTx(tx, playerId, turnAmount)`** (`guildTaxService.ts:20`) — looks up guild membership + tax rate, calculates `taxAmount = floor(turnAmount * rate)`, updates treasury + member contributions, returns `TaxResult { preTaxAmount, taxAmount, postTaxAmount, guildId }`.
- **`applyGuildTax(playerId, turnAmount)`** (`guildTaxService.ts:71`) — standalone wrapper that creates its own `$transaction`.
- **`spendPlayerTurnsTx(tx, playerId, turns)`** — deducts turns from the player's bank inside a transaction.
- **`NO_TAX(turnAmount)`** — returns a TaxResult with 0 tax when player has no guild or rate is 0.
- **Exploration** is the only route that currently uses `taxResult.postTaxAmount` as `effectiveTurns` (line 164 in `exploration/start.ts`).
- **All other routes** call `applyGuildTaxTx` but ignore the result — tax is a free treasury contribution.

---

## Task 1: Add TaxInfo shared type and getPlayerTaxRateTx helper

**Files:**
- Modify: `packages/shared/src/types/guild.types.ts`
- Modify: `apps/api/src/services/guildTaxService.ts`

**Step 1: Add TaxInfo type**

In `packages/shared/src/types/guild.types.ts`, after the `GuildData` interface (line 28), add:

```typescript
export interface TaxInfo {
  rate: number;
  amount: number;
  guildId: string;
}
```

Export it from `packages/shared/src/index.ts` if not auto-exported.

**Step 2: Add getPlayerTaxRateTx helper**

In `apps/api/src/services/guildTaxService.ts`, after the `NO_TAX` const (line 13), add:

```typescript
export async function getPlayerTaxRateTx(
  tx: Prisma.TransactionClient,
  playerId: string,
): Promise<{ taxRate: number; guildId: string | null }> {
  const membership = await tx.guildMember.findUnique({
    where: { playerId },
    include: { guild: { select: { id: true, taxRate: true } } },
  });
  if (!membership || membership.guild.taxRate === 0) return { taxRate: 0, guildId: null };
  return { taxRate: membership.guild.taxRate, guildId: membership.guild.id };
}
```

**Step 3: Add calculateInflatedCost pure helper**

In the same file, after `getPlayerTaxRateTx`:

```typescript
export function calculateInflatedCost(baseCost: number, taxRatePercent: number): number {
  if (taxRatePercent <= 0) return baseCost;
  return Math.ceil(baseCost / (1 - taxRatePercent / 100));
}
```

**Step 4: Add a helper to build TaxInfo from TaxResult**

```typescript
export function toTaxInfo(result: TaxResult): TaxInfo | null {
  if (!result.guildId || result.taxAmount === 0) return null;
  return { rate: Math.round(result.taxAmount / result.preTaxAmount * 100), amount: result.taxAmount, guildId: result.guildId };
}
```

Wait — that re-derives rate. Simpler: store rate in TaxResult. Instead, add the rate to the function that builds the response:

Actually, the simplest approach: build TaxInfo directly in each route from the TaxResult plus the known rate. Skip the helper — YAGNI.

Delete the `toTaxInfo` idea. Instead, each route builds `tax` inline:

```typescript
const tax = taxResult.guildId
  ? { rate: taxResult.taxAmount > 0 ? Math.round((taxResult.taxAmount / taxResult.preTaxAmount) * 100) : 0, amount: taxResult.taxAmount, guildId: taxResult.guildId }
  : null;
```

This is repetitive across routes. Extract a one-liner:

```typescript
export function taxInfoFromResult(result: TaxResult): TaxInfo | null {
  if (!result.guildId || result.taxAmount === 0) return null;
  return {
    rate: Math.round((result.taxAmount / result.preTaxAmount) * 100),
    amount: result.taxAmount,
    guildId: result.guildId,
  };
}
```

**Step 5: Build shared package and typecheck**

```bash
npm run build --workspace=packages/shared
npm run typecheck
```

**Step 6: Commit**

```bash
git add packages/shared/src/types/guild.types.ts packages/shared/src/index.ts apps/api/src/services/guildTaxService.ts
git commit -m "feat: add TaxInfo type, getPlayerTaxRateTx, calculateInflatedCost, taxInfoFromResult helpers"
```

---

## Task 2: Update gathering route — tax reduces effective turns

**Files:**
- Modify: `apps/api/src/routes/gathering.ts`

**Step 1: Import the new helpers**

At the top of `gathering.ts`, update the import from guildTaxService:

```typescript
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, taxInfoFromResult } from '../services/guildTaxService';
```

**Step 2: Replace turn calculation and tax application**

Find the block around lines 260–295 (turn calculation → transaction). The current flow calculates `maxActionsByTurns` from `body.turns` directly. Change to:

1. Move the transaction to wrap the tax rate lookup + turn spend:

Replace from `const maxActionsByTurns` (line 261) through the transaction open (line 293–295) with:

```typescript
  const { turnSpend, taxResult, actions, totalYield, newCapacity, nodeDepleted, stack } = await prisma.$transaction(async (tx) => {
    // Look up tax rate to calculate effective turns
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const effectiveTurns = taxRate > 0
      ? Math.floor(body.turns * (1 - taxRate / 100))
      : body.turns;

    const maxActionsByTurns = Math.floor(effectiveTurns / GATHERING_CONSTANTS.BASE_TURN_COST);
    const maxActionsByCapacity = Math.ceil(effectiveCapacity / yieldPerAction);
    const innerActions = Math.min(maxActionsByTurns, maxActionsByCapacity);

    if (innerActions <= 0) {
      throw new AppError(400, 'Not enough turns after guild tax', 'INSUFFICIENT_TURNS');
    }

    const baseTurns = innerActions * GATHERING_CONSTANTS.BASE_TURN_COST;
    const actualTurns = calculateInflatedCost(baseTurns, taxRate);

    const innerTotalYield = Math.min(innerActions * yieldPerAction, effectiveCapacity);
    const innerNewCapacity = effectiveCapacity - innerTotalYield;
    const innerNodeDepleted = innerNewCapacity <= 0;

    const spent = await spendPlayerTurnsTx(tx, playerId, actualTurns);
    const tax = await applyGuildTaxTx(tx, playerId, actualTurns);
```

Keep the existing node update logic (deleteMany/updateMany) and item creation, then close:

```typescript
    const minedStack = await addStackableItemTx(tx, playerId, resourceTemplateId, innerTotalYield);
    return {
      turnSpend: spent,
      taxResult: tax,
      actions: innerActions,
      totalYield: innerTotalYield,
      newCapacity: innerNewCapacity,
      nodeDepleted: innerNodeDepleted,
      stack: minedStack,
    };
  });
```

Remove the old `turnsSpent`, `totalYield`, `newCapacity`, `nodeDepleted` declarations that were outside the transaction.

**Step 3: Add tax to the response**

In the response object (around line 372), add the tax field:

```typescript
  tax: taxInfoFromResult(taxResult),
```

**Step 4: Typecheck**

```bash
npm run typecheck
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/gathering.ts
git commit -m "feat: gathering tax reduces effective turns, return tax info in response"
```

---

## Task 3: Update crafting routes — tax inflates turn cost

**Files:**
- Modify: `apps/api/src/routes/crafting/craft.ts`
- Modify: `apps/api/src/routes/crafting/forge.ts`
- Modify: `apps/api/src/routes/crafting/salvage.ts`

**Step 1: Update craft.ts**

Import helpers at the top:

```typescript
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, taxInfoFromResult } from '../../services/guildTaxService';
```

Find the turn cost + transaction block (lines 110–120). Change:

```typescript
const totalTurnCost = recipe.turnCost * quantity;
```

To:

```typescript
const baseTurnCost = recipe.turnCost * quantity;
```

Inside the transaction (line 111), before `spendPlayerTurnsTx`:

```typescript
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const totalTurnCost = calculateInflatedCost(baseTurnCost, taxRate);
    const spent = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);
    const tax = await applyGuildTaxTx(tx, playerId, totalTurnCost);
```

Update the transaction return to include `taxResult: tax`.

Add `tax: taxInfoFromResult(taxResult)` to the response.

**Step 2: Update forge.ts — upgrade route**

Import helpers. Find `upgradeCost` (line 53) and the transaction (lines 67–81).

Inside the transaction, inflate the cost:

```typescript
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const actualUpgradeCost = calculateInflatedCost(upgradeCost, taxRate);
    const spent = await spendPlayerTurnsTx(tx, playerId, actualUpgradeCost);
    const tax = await applyGuildTaxTx(tx, playerId, actualUpgradeCost);
```

Return `taxResult: tax` from transaction. Add `tax: taxInfoFromResult(taxResult)` to response.

**Step 3: Update forge.ts — reroll route**

Same pattern as upgrade. Find `rerollCost` (line 249) and the transaction (lines 269–283).

```typescript
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const actualRerollCost = calculateInflatedCost(rerollCost, taxRate);
    const spent = await spendPlayerTurnsTx(tx, playerId, actualRerollCost);
    const tax = await applyGuildTaxTx(tx, playerId, actualRerollCost);
```

Return `taxResult: tax`, add `tax: taxInfoFromResult(taxResult)` to response.

**Step 4: Update salvage.ts**

Import helpers. Find the transaction (lines 58–60):

```typescript
    const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
    const actualSalvageCost = calculateInflatedCost(CRAFTING_CONSTANTS.SALVAGE_TURN_COST, taxRate);
    const spent = await spendPlayerTurnsTx(tx, playerId, actualSalvageCost);
    const tax = await applyGuildTaxTx(tx, playerId, actualSalvageCost);
```

Return `taxResult: tax`, add `tax: taxInfoFromResult(taxResult)` to response.

**Step 5: Typecheck**

```bash
npm run typecheck
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/crafting/
git commit -m "feat: crafting/forge/salvage tax inflates turn cost, return tax info"
```

---

## Task 4: Update rest route — tax reduces effective healing turns

**Files:**
- Modify: `apps/api/src/routes/hp.ts`

**Step 1: Import helpers**

```typescript
import { applyGuildTax, taxInfoFromResult } from '../services/guildTaxService';
```

(Already imports `applyGuildTax` — just add `taxInfoFromResult`.)

**Step 2: Change rest to pass tax-reduced turns to service**

Current flow (lines 38–39):

```typescript
const result = await rest(playerId, body.turns);
await applyGuildTax(playerId, result.turnsSpent);
```

The `rest` service function internally decides how many turns to spend. We need to reduce effectiveness: the player submits N turns, but the rest service should only heal based on effective turns.

New approach — apply tax first, pass effective turns to rest:

```typescript
const taxResult = await applyGuildTax(playerId, body.turns);
const effectiveTurns = taxResult.postTaxAmount;
const result = await rest(playerId, effectiveTurns);
```

But `rest()` calls `spendPlayerTurnsTx` internally with the turns it receives. With `effectiveTurns`, it would only deduct the post-tax amount. We need to deduct the FULL amount.

Better approach: let rest use `effectiveTurns` for healing calculation but deduct the full `body.turns`. This requires modifying the `rest` service to accept a separate `turnsToDeduct` parameter, which is invasive.

Simpler: keep the current `rest(playerId, body.turns)` call (which deducts full amount), then apply tax after. The only change needed is that the REST response should report the effective healing, not the full turn amount's healing.

Actually the simplest change: the `rest` function computes healing based on turns passed. If we pass `effectiveTurns`, it heals less. Then we need an additional turn deduction for the tax amount.

Even simpler: restructure the route to match the exploration pattern:
1. Spend full `body.turns` via `spendPlayerTurns`
2. Apply tax via `applyGuildTax`
3. Calculate healing from `taxResult.postTaxAmount`

But `rest()` does the spending AND the healing in one call. We need to decouple.

**The cleanest fix:** Add an optional `effectiveTurns` override to the rest service, or handle the rest logic in the route.

Actually, let's look at what `rest()` does: it calls `spendPlayerTurnsTx` with `turnsToSpend` and then does healing math. The turns spent IS the healing turns. So:

Change the route to:
1. `spendPlayerTurns(playerId, body.turns)` — deduct full amount
2. `taxResult = applyGuildTax(playerId, body.turns)` — route to treasury
3. Call rest healing logic with `taxResult.postTaxAmount` as the healing turns

This requires extracting the healing logic from `rest()` or adding a parameter. Let me check the rest service to find the simplest option.

For now, the plan approach: modify the rest route to spend turns itself and call a `calculateRestHealing` function (which the rest service likely already uses internally). Check the hpService for this.

**Alternative approach (simplest):** The rest route currently does:
```typescript
const result = await rest(playerId, body.turns);
await applyGuildTax(playerId, result.turnsSpent);
```

Change to inflate the cost. The player wants to rest for N turns of healing. The actual cost is `calculateInflatedCost(N, taxRate)`. But the player is choosing how many turns to spend, not how much healing they want. So "reduce effectiveness" means: they spend N, they heal for `floor(N * (1 - rate/100))` turns worth.

The simplest implementation: just change the parameter to `rest()` to be the effective turns, and manually deduct the tax portion separately:

```typescript
const taxResult = await applyGuildTax(playerId, body.turns);
const result = await rest(playerId, taxResult.postTaxAmount);
```

But wait — `rest()` internally calls `spendPlayerTurnsTx`. So this would spend `postTaxAmount` from the bank, and `applyGuildTax` would... it only routes to treasury, it doesn't deduct from bank. So the player only loses `postTaxAmount` turns from their bank, not the full `body.turns`.

Need to deduct the tax amount separately. Change to:

```typescript
await spendPlayerTurns(playerId, body.turns);
const taxResult = await applyGuildTax(playerId, body.turns);
const healingTurns = taxResult.postTaxAmount;
// Call rest healing with healingTurns but WITHOUT spending turns again
```

This requires a version of `rest()` that doesn't spend turns. Getting complex.

**Pragmatic approach:** Pass `body.turns` to `rest()` unchanged (it spends and heals for full amount). Then ALSO spend the tax amount:

No — that double-deducts.

**Final approach for rest:** Modify the rest service to accept an optional `overrideEffectiveTurns` parameter. When provided, it still spends the full amount but heals based on the override. If this feels too invasive, just apply tax to the rest turn spend amount BEFORE calling rest:

```typescript
const taxResult = await applyGuildTax(playerId, body.turns);
// rest() will spend postTaxAmount and heal for that many turns
const result = await rest(playerId, taxResult.postTaxAmount);
```

The player's bank loses: `postTaxAmount` (from rest spend) + tax already routed. But `applyGuildTax` doesn't deduct from bank — it only adds to guild treasury! So the player only loses `postTaxAmount` turns. The tax amount is... free again.

OK I need to re-read `applyGuildTax` carefully. From line 71–78:

```typescript
export async function applyGuildTax(playerId, turnAmount) {
  return prisma.$transaction(async (tx) => {
    return applyGuildTaxTx(tx, playerId, turnAmount);
  });
}
```

And `applyGuildTaxTx` (lines 38-54): it increments the guild treasury and member contributions. It does NOT deduct from the player's turn bank. The player's turns are only deducted by `spendPlayerTurnsTx`.

So for rest, the correct approach:
1. `spendPlayerTurns(playerId, body.turns)` — deduct full amount from bank
2. Calculate effective healing turns = `floor(body.turns * (1 - taxRate/100))`
3. Heal for the effective turns only
4. `applyGuildTax(playerId, body.turns)` — route tax to treasury

But `rest()` combines spending + healing. So either:
(a) Break rest into separate functions
(b) Don't call rest() — replicate the logic in the route

Option (b) is bad. Option (a) is the right approach but requires modifying the service.

For the plan, let's take option (a): extract a `restHeal(playerId, turnsToHeal)` function from the rest service that does only the HP calculation + update, without spending turns. Then the route can:

```typescript
await spendPlayerTurns(playerId, body.turns);
const taxResult = await applyGuildTax(playerId, body.turns);
const result = await restHeal(playerId, taxResult.postTaxAmount);
```

Actually, even simpler: just add a `turnsToSpend` parameter to `rest()`:

```typescript
const result = await rest(playerId, body.turns, taxResult.postTaxAmount);
// rest() spends body.turns, heals for postTaxAmount
```

Let's plan this. Read the rest service to understand the extraction.

**Step 3: Modify hpService.rest to accept effective healing turns**

Read `apps/api/src/services/hpService.ts` to find the `rest` function. Add an optional `effectiveHealingTurns` parameter. When provided, spend the first arg but calculate healing from the second.

**Step 4: Update the route**

```typescript
const taxResult = await applyGuildTax(playerId, body.turns);
const result = await rest(playerId, body.turns, taxResult.postTaxAmount);
```

Add `tax: taxInfoFromResult(taxResult)` to response.

**Step 5: Update rest estimate route**

The `/hp/rest/estimate` endpoint should also factor in tax. Look up the player's tax rate, reduce the turns, and return the estimate based on effective turns + the tax info.

**Step 6: Typecheck**

```bash
npm run typecheck
```

**Step 7: Commit**

```bash
git add apps/api/src/routes/hp.ts apps/api/src/services/hpService.ts
git commit -m "feat: rest tax reduces effective healing turns, return tax info"
```

---

## Task 5: Update travel route — tax inflates travel cost

**Files:**
- Modify: `apps/api/src/routes/zones.ts`

**Step 1: Import helpers**

Add `calculateInflatedCost` and `taxInfoFromResult` to imports from guildTaxService. Also import `getPlayerTaxRateTx` or use `applyGuildTax` with the inflated cost.

**Step 2: Inflate travel cost**

Find lines 248–256 where `travelCost` is calculated and turns are spent. After computing `travelCost` (which already factors in guild travel cost reduction), inflate:

```typescript
const taxResult = await applyGuildTax(playerId, travelCost);
// No need to inflate separately — the exploration pattern works:
// Spend full inflated cost, tax routes to treasury
```

Wait — travel uses fixed cost, so we want to inflate:

```typescript
const guildMods = await getPlayerGuildModifiers(playerId);
const baseTravelCost = guildMods.travelCostReduction > 0
  ? Math.max(1, Math.round(rawTravelCost * (1 - guildMods.travelCostReduction)))
  : rawTravelCost;

// Get tax rate and inflate
const taxResult = await applyGuildTax(playerId, baseTravelCost);
// But applyGuildTax doesn't know the inflated cost yet...
```

For travel, the cleanest approach: look up tax rate first, inflate, spend inflated, apply tax on inflated.

Since travel uses the non-transactional `spendPlayerTurns` + `applyGuildTax`, we need the tax rate BEFORE spending. Use a new non-transactional `getPlayerTaxRate`:

Add to guildTaxService.ts:

```typescript
export async function getPlayerTaxRate(playerId: string): Promise<{ taxRate: number; guildId: string | null }> {
  return prisma.$transaction(async (tx) => getPlayerTaxRateTx(tx, playerId));
}
```

Then in the travel route:

```typescript
const { taxRate } = await getPlayerTaxRate(playerId);
const actualTravelCost = calculateInflatedCost(travelCost, taxRate);
await spendPlayerTurns(playerId, actualTravelCost);
const taxResult = await applyGuildTax(playerId, actualTravelCost);
```

**Step 3: Add tax to travel response**

Add `tax: taxInfoFromResult(taxResult)` to the response object (around line 612).

**Step 4: Typecheck**

```bash
npm run typecheck
```

**Step 5: Commit**

```bash
git add apps/api/src/routes/zones.ts apps/api/src/services/guildTaxService.ts
git commit -m "feat: travel tax inflates cost, return tax info"
```

---

## Task 6: Add tax info to exploration response + fix estimate

**Files:**
- Modify: `apps/api/src/routes/exploration/start.ts`
- Modify: `apps/api/src/routes/exploration/estimate.ts`

**Step 1: Add tax to exploration start response**

Exploration already reduces effectiveness correctly. Just add `tax: taxInfoFromResult(taxResult)` to the response (around line 789). Import `taxInfoFromResult`.

**Step 2: Fix estimate endpoint to factor in tax**

In `apps/api/src/routes/exploration/estimate.ts`, the endpoint already requires auth (it's behind `authenticate` middleware via the parent router). Import `getPlayerTaxRate` and modify:

```typescript
import { getPlayerTaxRate } from '../../services/guildTaxService';

estimateRouter.get('/estimate', asyncHandler(async (req, res) => {
    const query = estimateQuerySchema.parse(req.query);
    const validation = validateExplorationTurns(query.turns);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Invalid turns', 'INVALID_TURNS');
    }

    let zoneExitChance: number | null = null;
    if (query.zoneId) {
      const zone = await prisma.zone.findUnique({
        where: { id: query.zoneId },
        select: { zoneExitChance: true },
      });
      if (zone) zoneExitChance = zone.zoneExitChance;
    }

    const { taxRate } = await getPlayerTaxRate(req.player!.playerId);
    const effectiveTurns = taxRate > 0
      ? Math.floor(query.turns * (1 - taxRate / 100))
      : query.turns;

    res.json({
      estimate: estimateExploration(effectiveTurns, zoneExitChance),
      taxRate,
      effectiveTurns,
    });
}));
```

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/api/src/routes/exploration/
git commit -m "feat: add tax to exploration response, factor tax into estimate"
```

---

## Task 7: Update frontend API types

**Files:**
- Modify: `apps/web/src/lib/api/combat.ts` (exploration/gathering types)
- Modify: `apps/web/src/lib/api/guild.ts` or wherever crafting/rest/zone types live

**Step 1: Add TaxInfo to frontend types**

Find or create a shared type file. Add near the other response types:

```typescript
export interface TaxInfo {
  rate: number;
  amount: number;
  guildId: string;
}
```

**Step 2: Add `tax: TaxInfo | null` to all response types**

Add the optional `tax` field to every turn-spending response type:
- Exploration start response
- Gathering mine response
- Crafting craft response
- Forge upgrade/reroll response
- Salvage response
- Rest response
- Travel response

Also update the exploration estimate response to include `taxRate` and `effectiveTurns`.

**Step 3: Typecheck**

```bash
npm run typecheck
```

**Step 4: Commit**

```bash
git add apps/web/src/lib/api/
git commit -m "feat: add TaxInfo to all turn-spending response types"
```

---

## Task 8: Update frontend screens — show tax breakdown

**Files:**
- Modify: `apps/web/src/components/screens/Exploration.tsx`
- Modify: `apps/web/src/components/screens/Gathering.tsx`
- Modify: `apps/web/src/components/screens/Crafting.tsx`
- Modify: `apps/web/src/components/screens/Rest.tsx`
- Modify: Zone/travel display (find in `useGameController.ts` or zone screen)

**Step 1: Exploration screen — show effective turns**

In the Turn Investment card, after the slider value display (line 181), add a line showing effective turns when taxRate > 0. Fetch taxRate from the estimate endpoint response.

```tsx
{taxRate > 0 && (
  <p className="text-xs text-[var(--rpg-text-secondary)]">
    {effectiveTurns.toLocaleString()} effective ({taxRate}% guild tax)
  </p>
)}
```

Update probability calculations to use `effectiveTurns` from the estimate response.

**Step 2: Gathering screen — show inflated cost**

In `getNodeTurnsToDeplete`, factor in tax rate. Show the inflated cost next to the mine button:

```tsx
{taxRate > 0 && (
  <span className="text-xs text-[var(--rpg-text-secondary)]">
    ({taxAmount.toLocaleString()} guild tax)
  </span>
)}
```

The tax rate can come from the player's guild data (already available via `getPlayerGuild`).

**Step 3: Crafting screen — show inflated recipe cost**

Show `"Cost: 250 turns (50 guild tax)"` instead of `"Cost: 200 turns"` when tax applies. Calculate inline from the recipe's `turnCost * quantity` and the guild tax rate.

**Step 4: Rest screen — show effective healing**

In the rest estimate display, show the effective turns: `"Rest 100 turns → 80 effective (20% guild tax)"`. Update the estimate fetch to account for tax.

**Step 5: Travel — show inflated cost**

Wherever the travel cost is shown (likely in the zone screen or travel confirmation), show the inflated cost with tax breakdown.

**Step 6: Typecheck**

```bash
npm run typecheck
```

**Step 7: Commit**

```bash
git add apps/web/src/components/screens/
git commit -m "feat: show guild tax breakdown in all turn-spending screens"
```

---

## Task 9: Run tests and verify

**Step 1: Run full test suite**

```bash
npm run test
```

**Step 2: Manual testing checklist**

1. **No guild player** — all costs unchanged, no tax shown anywhere
2. **Guild member (0% tax)** — same as no guild, no tax indicators
3. **Guild member (20% tax) — Exploration** — slider shows effective turns, probabilities reflect post-tax turns, response includes tax field
4. **Guild member (20% tax) — Gathering** — mine all shows inflated cost, response includes tax, yield unchanged
5. **Guild member (20% tax) — Crafting** — recipe cost shows inflated amount, items crafted normally
6. **Guild member (20% tax) — Rest** — healing reduced by tax, display shows effective turns
7. **Guild member (20% tax) — Travel** — travel cost inflated, travel succeeds

**Step 3: Commit any fixes**

---

## Implementation Notes

- `getPlayerTaxRateTx` queries the guild membership once; `applyGuildTaxTx` queries it again. For routes that call both, this is 2 queries. Acceptable — keep it simple, optimize later if needed.
- The exploration estimate endpoint now requires `req.player` — it's already behind the `authenticate` middleware so this is fine.
- Rest is the trickiest route because the `rest()` service function owns the turn spend. May need to add an `effectiveHealingTurns` parameter to the service function.
- Travel cost already has guild reduction applied. Tax is applied on top of the reduced cost, not the raw cost. This is intentional — guild perks reduce the base, tax is on the result.
