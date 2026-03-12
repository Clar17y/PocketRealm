# Item Rarity System

## Design Summary

Five-tier rarity (Common → Uncommon → Rare → Epic → Legendary) that determines how many **bonus stat slots** an item has. Higher rarity = more random bonus stats.

| Rarity | Bonus Stats | Drop Weight | Upgrade To | Success % | Upgrade Cost | Reroll Cost |
|---|---|---|---|---|---|---|
| Common | 0 | 650 | Uncommon | 60% | 200 turns | — |
| Uncommon | 1 | 250 | Rare | 35% | 500 turns | 150 turns |
| Rare | 2 | 80 | Epic | 15% | 1000 turns | 300 turns |
| Epic | 3 | 18 | Legendary | 5% | 2000 turns | 600 turns |
| Legendary | 4 | 2 | — | — | — | 1200 turns |

**Sources of rarity:**
- **Mob drops** — weighted random roll; mob level and prefix boost higher-rarity odds
- **Crafting crits** — crit produces Uncommon (1 bonus stat). Normal craft = Common. Same crit chance formula as today.
- **Forge upgrade** — risky: pay turns, roll success. **Failure destroys the item.** Luck stat gives small bonus (0.1%/pt, max +10%).

**Re-rolling** — at the Forge, pay turns to re-roll ALL bonus stats at once. No stat locking.

## Rarity Mechanics

### Bonus Stats by Rarity
Each rarity tier unlocks additional randomly-rolled bonus stat slots:
- Bonus stats drawn from same pool as crafting crits (weapons: attack/magicPower/rangedPower/evasion/luck; armor: armor/health/evasion/luck)
- Each slot rolls a unique stat (no duplicates)
- Bonus value: 10-30% of the item's base stat value (min 1 point)

### Drop Rarity Rolling
- Base weights: Common 650, Uncommon 250, Rare 80, Epic 18, Legendary 2
- Per mob level above 1: shift +2 weight from Common to higher tiers (distributed 2:1.2:0.6:0.2 across Uncommon/Rare/Epic/Legendary)
- Mob prefix `dropChanceMultiplier` (e.g., Ancient = 2.0) multiplies non-common weights
- Only non-stackable equipment (weapons/armor) gets rarity; resources/consumables stay unaffected

### Forge Upgrade (Risky)
- Player selects an unequipped weapon/armor item
- Pays turn cost based on current rarity
- Rolls against success chance (base rate + luck bonus)
- **Success**: rarity increases by one tier, ALL bonus stats re-rolled for new slot count
- **Failure**: item is **destroyed** (deleted from DB)
- Luck bonus: +0.1% per luck point, capped at +10% total
- Cannot upgrade Legendary (already max)

### Forge Reroll
- Player selects an Uncommon+ unequipped weapon/armor item
- Pays turn cost based on rarity
- ALL bonus stats are re-randomized (same slot count, new random stat picks + values)
- No risk of destruction

### Crafting Integration
- Normal craft → Common (0 bonus stats)
- Crit craft → Uncommon (1 bonus stat, randomly rolled)
- Same crit chance formula: 5% base + 1%/level above recipe + 0.2%/luck (clamped 1-50%)
- To go higher than Uncommon, use Forge upgrade
