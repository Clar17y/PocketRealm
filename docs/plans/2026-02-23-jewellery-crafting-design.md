# Jewellery Crafting System Design

## Summary

Add a `jewelcrafting` skill with craftable rings, necklaces, and charms across 5 tiers. Precious gems come from a new **gathering crit** mechanic (bonus rare drop on any gather action) and mob drops. Gems are processed via the existing `refining` skill, then combined with metal ingots to craft jewellery.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Skill | New `jewelcrafting` (15th skill) | Dedicated progression, clean identity |
| Gem sources | Gathering crits + mob drops | Dual sourcing, rewards both playstyles |
| Crit scope | All gathering skills | Mining → gemstones, foraging → organic gems, woodcutting → resin gems |
| Gem → slot mapping | Skill-specific | Mining gems → rings, foraging gems → necklaces, woodcutting gems → charms |
| Durability | Normal (same as armor) | Material sink, prevents endgame stagnation |
| Gem processing | Existing `refining` skill, single step | Consistent with ore→ingot pattern |
| Tiers | 5 tiers matching weapons/armor | Consistent progression curve |
| Items per tier | All 3 slots | 15 base recipes total |

## Gathering Crit System

Every gathering action rolls for a bonus precious material alongside normal yield.

### Formula

```
gemCritChance = BASE_GEM_CRIT_CHANCE
  + (levelsAboveRequirement * GEM_CRIT_LEVEL_BONUS)
  + (luck * GEM_CRIT_LUCK_BONUS)
```

Capped at `GEM_CRIT_MAX_CHANCE`.

### Constants

```
BASE_GEM_CRIT_CHANCE:  0.03   (3%)
GEM_CRIT_LEVEL_BONUS:  0.005  (+0.5% per level above requirement)
GEM_CRIT_LUCK_BONUS:   0.003  (+0.3% per luck point)
GEM_CRIT_MAX_CHANCE:    0.25   (25% cap)
```

### Gem Types by Gathering Skill

| Skill | T1 | T2 | T3 | T4 | T5 |
|---|---|---|---|---|---|
| Mining | Rough Ruby | Rough Sapphire | Rough Emerald | Rough Diamond | Rough Opal |
| Foraging | Raw Amber | Raw Pearl | Raw Jade | Raw Moonstone | Raw Starcrystal |
| Woodcutting | Tree Resin | Fossilized Sap | Crystal Bark | Heartwood Gem | Ancient Amber |

Gem tier matches the resource node tier. Mining copper (T1) can crit a Rough Ruby; mining mithril (T4) can crit a Rough Diamond.

## Gem Processing (Refining)

Single step: raw gem → cut gem via `refining` skill.

| Tier | Input | Output | Refining Level | Turn Cost | XP |
|---|---|---|---|---|---|
| T1 | Rough Ruby / Raw Amber / Tree Resin | Cut Ruby / Cut Amber / Cut Resin | 1 | 50 | 6 |
| T2 | Rough Sapphire / Raw Pearl / Fossilized Sap | Cut Sapphire / Cut Pearl / Cut Sap | 5 | 50 | 12 |
| T3 | Rough Emerald / Raw Jade / Crystal Bark | Cut Emerald / Cut Jade / Cut Bark | 12 | 50 | 20 |
| T4 | Rough Diamond / Raw Moonstone / Heartwood Gem | Cut Diamond / Cut Moonstone / Cut Heartwood | 20 | 50 | 32 |
| T5 | Rough Opal / Raw Starcrystal / Ancient Amber | Cut Opal / Cut Starcrystal / Cut Ancient Amber | 28 | 50 | 45 |

15 refining recipes total (5 tiers x 3 gem types).

## Jewelcrafting Recipes

15 base recipes across 5 tiers and 3 slots.

### Recipe Structure

| Tier | Slot | Level | Metal | Gem | Mob Drop | Turn Cost | XP |
|---|---|---|---|---|---|---|---|
| T1 | Ring | 1 | 3x Copper Ingot | 1x Cut Ruby | — | 50 | 8 |
| T1 | Necklace | 1 | 3x Copper Ingot | 1x Cut Amber | — | 50 | 8 |
| T1 | Charm | 1 | 3x Copper Ingot | 1x Cut Resin | — | 50 | 8 |
| T2 | Ring | 5 | 4x Iron Ingot | 1x Cut Sapphire | — | 50 | 15 |
| T2 | Necklace | 5 | 4x Iron Ingot | 1x Cut Pearl | — | 50 | 15 |
| T2 | Charm | 5 | 4x Iron Ingot | 1x Cut Sap | — | 50 | 15 |
| T3 | Ring | 12 | 5x Dark Iron Ingot | 2x Cut Emerald | 2x mob material | 50 | 25 |
| T3 | Necklace | 12 | 5x Dark Iron Ingot | 2x Cut Jade | 2x mob material | 50 | 25 |
| T3 | Charm | 12 | 5x Dark Iron Ingot | 2x Cut Bark | 2x mob material | 50 | 25 |
| T4 | Ring | 20 | 6x Mithril Ingot | 3x Cut Diamond | 3x mob material | 50 | 38 |
| T4 | Necklace | 20 | 6x Mithril Ingot | 3x Cut Moonstone | 3x mob material | 50 | 38 |
| T4 | Charm | 20 | 6x Mithril Ingot | 3x Cut Heartwood | 3x mob material | 50 | 38 |
| T5 | Ring | 28 | 8x Ancient Ingot | 4x Cut Opal | 4x rare mob material | 50 | 50 |
| T5 | Necklace | 28 | 8x Ancient Ingot | 4x Cut Starcrystal | 4x rare mob material | 50 | 50 |
| T5 | Charm | 28 | 8x Ancient Ingot | 4x Cut Ancient Amber | 4x rare mob material | 50 | 50 |

T1-T2: Metal + gem only (accessible entry point).
T3+: Add mob drop materials for complexity.

### Jewellery Base Stats

Follow existing `SLOT_STAT_POOLS`:
- **Ring:** luck, accuracy, critChance, critDamage (utility: dodge)
- **Neck:** health, luck (utility: accuracy)
- **Charm:** luck, accuracy, dodge, critChance, critDamage (utility: health)

Base stat values scale with tier, comparable to same-tier armor pieces. Crafting crits produce higher-rarity versions with bonus stat slots (existing crit system).

## Mob Drop Gems

Raw gems added to existing mob drop tables.

| Zone Tier | Gem Tiers Dropped | Drop Rate |
|---|---|---|
| T1 (Whispering Woods) | T1 | ~5% |
| T2 (Goblin Warrens) | T1-T2 | ~5-8% |
| T3 (Fae Wilds) | T2-T3 | ~5-8% |
| T4 (Shadowmere) | T3-T4 | ~5-8% |
| T5 (Abyssal Depths) | T4-T5 | ~5-10% |

- Mobs drop **raw** gems (still need refining)
- Mobs can drop **any** gem type (mining/foraging/woodcutting variants) — combat is a way to access all slots
- Drop rates are low — gems are a bonus, not primary loot

## Schema Changes

**Prisma enum addition:** `jewelcrafting` added to `SkillType`.

**New item templates:**
- 15 raw gem resources (itemType: `resource`)
- 15 cut gem resources (itemType: `resource`)
- 15 jewellery equipment pieces (itemType: `armor`, slots: ring/neck/charm)

**New recipes:**
- 15 refining recipes (raw → cut gem)
- 15 jewelcrafting recipes (materials → jewellery)

**Drop table additions:** ~20-30 new entries for gem drops on existing mobs.

**No new database tables.** Uses existing: `ItemTemplate`, `CraftingRecipe`, `DropTable`, `PlayerSkill`.

**One migration:** Add `jewelcrafting` to `SkillType` enum + seed data for items, recipes, drops.

## Existing Advanced Jewellery

The 9 existing mob-family-gated jewellery items (Wolf Fang Necklace, Bandit's Lucky Ring, etc.) remain unchanged. They serve as special alternatives alongside the base craftable set — distinct recipes with unique stat profiles and soulbound status.
