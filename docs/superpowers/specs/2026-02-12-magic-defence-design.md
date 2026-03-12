# Magic Defence Design

## Problem
Magic attacks use physical `defence` for damage reduction. The `magicDefence` stat exists on players/items but mobs have no `magicDefence` field (hardcoded to 0). Additionally, magical mobs auto-attack using physical damage when they should deal magic damage.

## Solution
1. Add `damageType` concept — determines which defence stat reduces damage
2. Add `magicDefence` to mobs — per-archetype values
3. Add `damageType` to mobs — magical creatures deal magic auto-attack damage
4. Prefixes can override `damageType` and scale `magicDefence`

## Data Model Changes

### `CombatantStats` (combat.types.ts)
Add: `damageType: 'physical' | 'magic'`

### `MobTemplate` (combat.types.ts + Prisma schema + seed)
Add: `magicDefence: number`, `damageType: 'physical' | 'magic'`

Prisma columns: `magic_defence Int`, `damage_type String @default("physical")`

### `MobPrefixDefinition` (mobPrefix.types.ts)
Add: `magicDefence?: number` to `statMultipliers`
Add: `damageTypeOverride?: 'physical' | 'magic'`

## Combat Engine Changes

### `buildPlayerCombatStats()` (damageCalculator.ts)
Set `damageType` from `attackStyle`: magic = `'magic'`, melee/ranged = `'physical'`

### Mob stat builder (combatEngine.ts)
Read `mob.magicDefence` and `mob.damageType` instead of hardcoding.

### `executePlayerAttack()` (combatEngine.ts)
If `playerStats.damageType === 'magic'` → use `mobStats.magicDefence`
Else → use `mobStats.defence`

### `executeMobAttack()` (combatEngine.ts)
If `mobStats.damageType === 'magic'` → use `playerStats.magicDefence`
Else → use `playerStats.defence`

### `applyMobPrefix()` (mobPrefixes.ts)
Scale `magicDefence` via `statMultipliers.magicDefence`.
Apply `damageTypeOverride` if present, else inherit base mob's `damageType`.

## Prefix Updates

| Prefix | magicDefence mult | damageTypeOverride |
|--------|------------------|--------------------|
| Weak | 0.7 | — |
| Frail | 0.5 | — |
| Tough | 1.3 | — |
| Gigantic | 1.2 | — |
| Swift | 0.8 | — |
| Ferocious | 0.9 | — |
| Shaman | 1.3 | magic |
| Venomous | 1.0 | — |
| Ancient | 1.3 | — |
| Spectral | 1.5 | magic |

## Mob Values

Format: `name (def → mdef, damageType)`

### Forest Edge (diff 1)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Forest Rat | 2 | 1 | physical |
| Field Mouse | 1 | 0 | physical |
| Giant Rat | 5 | 2 | physical |
| Rat King | 7 | 3 | physical |
| Forest Spider | 2 | 1 | physical |
| Web Spinner | 3 | 1 | physical |
| Venomous Spider | 4 | 2 | physical |
| Brood Mother | 8 | 3 | physical |
| Wild Boar | 6 | 2 | physical |
| Tusked Boar | 9 | 3 | physical |
| Great Boar | 12 | 4 | physical |

### Deep Forest (diff 2)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Young Wolf | 8 | 3 | physical |
| Forest Wolf | 10 | 4 | physical |
| Dire Wolf | 14 | 5 | physical |
| Alpha Wolf | 16 | 6 | physical |
| Woodland Bandit | 7 | 5 | physical |
| Bandit Scout | 5 | 4 | physical |
| Bandit Enforcer | 12 | 8 | physical |
| Bandit Captain | 15 | 10 | physical |
| Twig Blight | 12 | 8 | physical |
| Bark Golem | 16 | 6 | physical |
| Dark Treant | 20 | 10 | physical |
| Elder Treant | 24 | 12 | physical |

### Ancient Grove (diff 3)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Forest Sprite | 8 | 12 | magic |
| Wisp | 6 | 10 | magic |
| Dryad | 14 | 18 | magic |
| Ancient Spirit | 18 | 24 | magic |
| Dark Treant | 18 | 9 | physical |
| Moss Golem | 22 | 8 | physical |
| Ancient Treant | 26 | 13 | physical |
| Treant Patriarch | 30 | 15 | physical |
| Pixie Swarm | 6 | 10 | magic |
| Thorn Fairy | 10 | 14 | magic |
| Fae Knight | 16 | 14 | physical |
| Fae Queen | 20 | 26 | magic |

### Cave Entrance (diff 2)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Cave Rat | 4 | 2 | physical |
| Cavern Beetle | 8 | 3 | physical |
| Giant Cave Spider | 8 | 3 | physical |
| Rat Matriarch | 10 | 4 | physical |
| Cave Bat | 4 | 2 | physical |
| Dire Bat | 6 | 2 | physical |
| Vampire Bat | 8 | 6 | physical |
| Bat Swarm Lord | 10 | 4 | physical |
| Goblin | 6 | 4 | physical |
| Goblin Archer | 4 | 3 | physical |
| Goblin Warrior | 10 | 5 | physical |
| Goblin Shaman | 8 | 12 | magic |

### Deep Mines (diff 3)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Goblin Miner | 10 | 6 | physical |
| Goblin Sapper | 8 | 5 | physical |
| Goblin Foreman | 14 | 7 | physical |
| Goblin Chieftain | 18 | 10 | physical |
| Clay Golem | 18 | 6 | physical |
| Stone Golem | 22 | 8 | physical |
| Iron Golem | 28 | 10 | physical |
| Crystal Golem | 32 | 12 | physical |
| Rock Crawler | 14 | 5 | physical |
| Cave Lurker | 10 | 4 | physical |
| Burrower | 16 | 6 | physical |
| Tunnel Wyrm | 20 | 8 | physical |

### Whispering Plains (diff 3)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Plains Wolf | 12 | 5 | physical |
| Coyote | 8 | 3 | physical |
| Warg | 16 | 6 | physical |
| Pack Alpha | 20 | 8 | physical |
| Highway Bandit | 10 | 6 | physical |
| Bandit Archer | 8 | 5 | physical |
| Bandit Lieutenant | 14 | 8 | physical |
| Bandit Warlord | 18 | 10 | physical |
| Harpy | 8 | 8 | physical |
| Harpy Scout | 6 | 6 | physical |
| Harpy Windcaller | 12 | 16 | magic |
| Harpy Matriarch | 16 | 18 | magic |

### Haunted Marsh (diff 4)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Skeleton | 16 | 8 | physical |
| Zombie | 12 | 6 | physical |
| Wraith | 14 | 20 | magic |
| Death Knight | 24 | 14 | physical |
| Bog Toad | 14 | 5 | physical |
| Marsh Crawler | 18 | 6 | physical |
| Swamp Hydra | 20 | 8 | physical |
| Ancient Crocodile | 26 | 8 | physical |
| Hag Servant | 10 | 14 | magic |
| Cursed Villager | 14 | 8 | physical |
| Bog Witch | 12 | 18 | magic |
| Coven Mother | 18 | 24 | magic |

### Crystal Caverns (diff 4)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Goblin Gem Hunter | 12 | 7 | physical |
| Goblin Tunneler | 14 | 8 | physical |
| Goblin Artificer | 16 | 10 | physical |
| Goblin King | 22 | 14 | physical |
| Crystal Golem | 26 | 10 | physical |
| Gem Construct | 24 | 10 | physical |
| Diamond Golem | 32 | 12 | physical |
| Golem Overlord | 36 | 14 | physical |
| Shard Elemental | 14 | 18 | magic |
| Crystal Wisp | 10 | 14 | magic |
| Storm Crystal | 18 | 22 | magic |
| Crystal Titan | 24 | 28 | magic |

### Sunken Ruins (diff 5)
| Mob | Def | MDef | Type |
|-----|-----|------|------|
| Drowned Sailor | 18 | 10 | physical |
| Skeletal Knight | 22 | 12 | physical |
| Spectral Captain | 20 | 24 | magic |
| Lich | 26 | 34 | magic |
| Sea Snake | 14 | 6 | physical |
| Marsh Viper | 12 | 5 | physical |
| Naga Warrior | 22 | 16 | physical |
| Naga Queen | 28 | 22 | magic |
| Ooze | 20 | 8 | physical |
| Tentacle Horror | 16 | 10 | physical |
| Flesh Golem | 24 | 8 | physical |
| Eldritch Abomination | 28 | 32 | magic |

## Tests
- Player magic attack uses mob `magicDefence` (not `defence`)
- Player physical attack still uses mob `defence`
- Mob magic auto-attack uses player `magicDefence`
- Mob physical auto-attack still uses player `defence`
- Mob spells still use player `magicDefence` (no change)
- Prefix `damageTypeOverride` works
- Prefix `magicDefence` multiplier scales correctly
