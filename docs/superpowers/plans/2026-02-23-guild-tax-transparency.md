# Guild Tax Transparency & Real Cost

**Goal:** Make guild tax a real gameplay cost in all turn-spending activities, and show players the breakdown.

**Current state:** Only exploration reduces effectiveness from tax. Gathering, crafting, forge, salvage, rest, and travel give the guild free treasury turns with no player trade-off. No API response includes tax info. Exploration estimates ignore tax.

---

## Tax Model

### Variable-turn activities (exploration, gathering, rest)

Tax reduces effective turns:

```
effectiveTurns = floor(spentTurns * (1 - taxRate / 100))
```

- **Exploration:** Already works this way. `effectiveTurns` passed to `simulateExploration()`.
- **Gathering:** Calculate `effectiveTurns`, then `actions = floor(effectiveTurns / BASE_TURN_COST)`. For "mine all", charge `ceil(baseCost / (1 - taxRate / 100))` so the player can still fully clear a node — it just costs more turns.
- **Rest:** `effectiveTurns` passed to healing calculation. Same turn spend yields less HP recovery.

### Fixed-cost activities (crafting, forge upgrade/reroll, salvage, travel)

Tax inflates the turn cost:

```
actualCost = ceil(baseCost / (1 - taxRate / 100))
taxAmount = actualCost - baseCost
```

Player always gets the full outcome (crafted item, forged result, salvage materials, zone travel) but pays more turns. At 20% tax: a 200-turn recipe costs 250 turns.

### Examples at 20% tax

| Activity | Base Cost | Actual Cost | Tax | Outcome |
|----------|-----------|-------------|-----|---------|
| Explore 100 turns | 100 | 100 | 20 | 80 effective turns for probabilities |
| Mine 51 copper (30/action) | 1530 | 1913 | 383 | 51 copper (full node) |
| Rest 100 turns | 100 | 100 | 20 | 80 effective healing turns |
| Craft 1 sword (200 base) | 200 | 250 | 50 | 1 sword |
| Forge upgrade (500 base) | 500 | 625 | 125 | 1 upgrade attempt |
| Salvage (50 base) | 50 | 63 | 13 | Full salvage materials |
| Travel (40 base) | 40 | 50 | 10 | Full zone travel |

---

## API Changes

### Tax response shape

Every turn-spending endpoint adds a `tax` field to its response:

```typescript
interface TaxInfo {
  rate: number;      // e.g. 20
  amount: number;    // turns taken as tax
  guildId: string;
}

// In responses: tax: TaxInfo | null
// null when player has no guild or tax rate is 0
```

### Route changes

**Exploration start** — already reduces effectiveness. Add `tax` to response.

**Gathering mine** — change from pure treasury to reduced effectiveness:
1. Calculate `effectiveTurns = floor(turnsAvailable * (1 - taxRate/100))`
2. Derive `actions` from effective turns (not raw turns)
3. Charge `ceil(actions * BASE_TURN_COST / (1 - taxRate/100))`
4. Add `tax` to response.

**Rest** — change from decoupled tax to reduced effectiveness:
1. Apply tax inside the rest calculation: `effectiveTurns = floor(turnsToSpend * (1 - taxRate/100))`
2. Use `effectiveTurns` for healing math
3. Charge full `turnsToSpend`
4. Add `tax` to response.

**Crafting (craft, forge upgrade, forge reroll, salvage)** — change from pure treasury to inflated cost:
1. Calculate `actualCost = ceil(baseCost / (1 - taxRate/100))`
2. Charge `actualCost` instead of `baseCost`
3. Tax amount = `actualCost - baseCost` → guild treasury
4. Add `tax` to response.

**Travel** — change from decoupled tax to inflated cost:
1. Calculate `actualCost = ceil(baseTravelCost / (1 - taxRate/100))`
2. Charge `actualCost` instead of `baseTravelCost`
3. Add `tax` to response.

**Exploration estimate** — factor in player's guild tax:
1. Look up player's guild tax rate (endpoint is already behind auth)
2. Calculate `effectiveTurns = floor(turns * (1 - taxRate/100))`
3. Run `estimateExploration(effectiveTurns, ...)`
4. Include `taxRate` and `effectiveTurns` in the response

### Rest estimate

The existing `/hp/rest/estimate` endpoint should also reflect tax so the frontend can show accurate healing predictions.

---

## Frontend Changes

### Shared tax display pattern

Show tax inline wherever turn costs appear:

- With tax: `"250 turns (50 guild tax)"`
- Without tax (no guild or 0% rate): `"200 turns"`

### Per-screen changes

**Exploration screen:**
- Slider label shows effective turns: `"Turn Investment: 100 (80 effective)"`
- Probability estimates use post-tax effective turns
- Result summary includes tax paid

**Gathering screen:**
- "Mine All" button shows inflated cost: `"Mine All: 1913 turns (383 tax)"`
- Partial mine shows same pattern
- Result summary includes tax paid

**Rest screen:**
- Turn input shows effective healing: `"Rest 100 turns (80 effective)"`
- Estimate reflects post-tax healing
- Result summary includes tax paid

**Crafting screens:**
- Recipe cost shows inflated amount: `"Cost: 250 turns (50 tax)"`
- Forge/salvage costs show same pattern

**Travel / Zone screen:**
- Travel button shows inflated cost: `"Travel: 50 turns (10 tax)"`

---

## Implementation scope

### Backend (5 files + 1 shared type)
1. Add `TaxInfo` type to shared package
2. Modify `guildTaxService.ts` — add helper for inflated cost calculation
3. Modify each route file (8 routes across 6 files) to apply real tax and return tax info
4. Modify exploration estimate to include player tax context
5. Modify rest estimate to include player tax context

### Frontend (6 screen files + API types)
1. Add `TaxInfo` to API response types
2. Update each screen to display tax breakdown
3. Update exploration/rest estimate handling

### No database changes required
