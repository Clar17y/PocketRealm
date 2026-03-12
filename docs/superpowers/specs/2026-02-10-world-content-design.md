# World Content Design

Comprehensive data design for all zones, mobs, mob families, resources, items, crafting recipes, and drop tables.

## Zone Graph

```
              [Millbrook]  (starter town — tier 1-2 crafting)
                  |
            Forest Edge  (diff 1, level 1-5)
              /       \
       Deep Forest    Cave Entrance  (diff 2, level 5-10)
         /    \            |
Ancient Grove  Whispering Plains   Deep Mines  (diff 3, level 12-18)
(dead end)         |              (dead end)
              [Thornwall]  (frontier town — tier 3-5 crafting)
                /       \
        Haunted Marsh   Crystal Caverns  (diff 4, level 20-28)
             |
        Sunken Ruins  (diff 5, level 30+, dead end)
```

### Zone Details

| Zone | Difficulty | Level Range | Travel Cost | Starter | Type |
|------|-----------|-------------|-------------|---------|------|
| Millbrook | — | — | — | Yes | Town |
| Forest Edge | 1 | 1-5 | 50 | No | Wild |
| Deep Forest | 2 | 5-10 | 150 | No | Wild |
| Cave Entrance | 2 | 5-10 | 150 | No | Wild |
| Ancient Grove | 3 | 12-18 | 300 | No | Wild (dead end) |
| Deep Mines | 3 | 12-18 | 300 | No | Wild (dead end) |
| Whispering Plains | 3 | 12-18 | 250 | No | Wild |
| Thornwall | — | — | — | No | Town |
| Haunted Marsh | 4 | 20-28 | 400 | No | Wild |
| Crystal Caverns | 4 | 20-28 | 400 | No | Wild |
| Sunken Ruins | 5 | 30+ | 600 | No | Wild (dead end) |

### Zone Connections

```
Millbrook ↔ Forest Edge
Forest Edge ↔ Deep Forest
Forest Edge ↔ Cave Entrance
Deep Forest ↔ Ancient Grove
Deep Forest ↔ Whispering Plains
Cave Entrance ↔ Deep Mines
Whispering Plains ↔ Thornwall
Thornwall ↔ Haunted Marsh
Thornwall ↔ Crystal Caverns
Haunted Marsh ↔ Sunken Ruins
```

### Town Services

| Town | Crafting Tiers | Services |
|------|---------------|----------|
| Millbrook | 1-2 | Basic crafting, rest, shops, all processing |
| Thornwall | 3-5 | Advanced crafting, rest, shops, all processing |

---

## Mob Families & Zone Distribution

### Family Roster

| Family | Zones Present | Site Nouns (S/M/L) |
|--------|--------------|-------------------|
| Vermin | Forest Edge, Cave Entrance | Nest / Warren / Burrow |
| Spiders | Forest Edge | Web / Nest / Lair |
| Boars | Forest Edge | Herd / Mud Wallow / Territory |
| Wolves | Deep Forest, Whispering Plains | Pack / Den / Territory |
| Bandits | Deep Forest, Whispering Plains | Patrol / Camp / Stronghold |
| Treants | Deep Forest, Ancient Grove | Thicket / Grove / Heart |
| Spirits | Ancient Grove | Cluster / Circle / Sanctum |
| Fae | Ancient Grove | Glade / Court / Throne |
| Bats | Cave Entrance | Roost / Colony / Cavern |
| Goblins | Cave Entrance, Deep Mines, Crystal Caverns | Patrol / Camp / Warren |
| Golems | Deep Mines, Crystal Caverns | Vein / Cavern / Core |
| Crawlers | Deep Mines | Tunnel / Nest / Deep Burrow |
| Harpies | Whispering Plains | Roost / Aerie / Eyrie |
| Undead | Haunted Marsh, Sunken Ruins | Grave / Crypt / Tomb |
| Swamp Beasts | Haunted Marsh | Pool / Mire / Depths |
| Witches | Haunted Marsh | Hut / Circle / Coven |
| Elementals | Crystal Caverns | Cluster / Nexus / Core |
| Serpents | Sunken Ruins | Nest / Temple / Throne |
| Abominations | Sunken Ruins | Pool / Cavern / Abyss |

### Mob Templates by Zone

Shared families get zone-appropriate variants with scaled stats.

#### Forest Edge (diff 1)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Forest Rat | Vermin | trash | 12 | 6 | 2 | 3 | 1-3 | 6 | — |
| Field Mouse | Vermin | trash | 8 | 5 | 1 | 5 | 1-2 | 4 | — |
| Giant Rat | Vermin | elite | 22 | 10 | 5 | 3 | 2-5 | 14 | — |
| Rat King | Vermin | boss | 40 | 14 | 7 | 2 | 3-7 | 30 | R3: Frenzy (6 dmg) |
| Forest Spider | Spiders | trash | 10 | 8 | 2 | 4 | 1-3 | 7 | — |
| Web Spinner | Spiders | trash | 14 | 7 | 3 | 3 | 1-4 | 8 | — |
| Venomous Spider | Spiders | elite | 20 | 12 | 4 | 5 | 2-6 | 16 | R4: Venom Bite (5 dmg) |
| Brood Mother | Spiders | boss | 45 | 15 | 8 | 3 | 3-8 | 35 | R3: Web Spit (4 dmg), R6: Poison Spray (8 dmg) |
| Wild Boar | Boars | trash | 20 | 10 | 6 | 1 | 2-5 | 10 | — |
| Tusked Boar | Boars | elite | 30 | 14 | 9 | 1 | 3-7 | 20 | — |
| Great Boar | Boars | boss | 50 | 18 | 12 | 1 | 4-9 | 40 | R4: Charge (8 dmg) |

#### Deep Forest (diff 2)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Young Wolf | Wolves | trash | 22 | 14 | 8 | 5 | 3-6 | 18 | — |
| Forest Wolf | Wolves | trash | 30 | 16 | 10 | 5 | 3-7 | 22 | — |
| Dire Wolf | Wolves | elite | 45 | 20 | 14 | 4 | 5-10 | 38 | — |
| Alpha Wolf | Wolves | boss | 65 | 24 | 16 | 6 | 6-12 | 55 | R3: Howl (buff, +3 ATK self), R5: Lunge (10 dmg) |
| Woodland Bandit | Bandits | trash | 25 | 13 | 7 | 4 | 2-6 | 16 | — |
| Bandit Scout | Bandits | trash | 18 | 15 | 5 | 7 | 2-5 | 14 | — |
| Bandit Enforcer | Bandits | elite | 40 | 18 | 12 | 3 | 4-9 | 34 | — |
| Bandit Captain | Bandits | boss | 60 | 22 | 15 | 5 | 5-11 | 50 | R2: Rally (buff), R5: Power Strike (12 dmg) |
| Twig Blight | Treants | trash | 28 | 10 | 12 | 1 | 2-5 | 15 | — |
| Bark Golem | Treants | trash | 35 | 12 | 16 | 0 | 3-6 | 20 | — |
| Dark Treant | Treants | elite | 55 | 14 | 20 | 0 | 4-8 | 40 | R4: Root Slam (7 dmg) |
| Elder Treant | Treants | boss | 80 | 16 | 24 | 0 | 5-10 | 60 | R3: Vine Whip (6 dmg), R6: Nature's Wrath (12 dmg) |

#### Ancient Grove (diff 3, dead end)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Forest Sprite | Spirits | trash | 25 | 16 | 8 | 10 | 3-6 | 24 | R3: Sparkle (4 dmg) |
| Wisp | Spirits | trash | 18 | 14 | 6 | 12 | 2-5 | 20 | — |
| Dryad | Spirits | elite | 45 | 20 | 14 | 8 | 5-9 | 42 | R3: Heal Self (8 HP), R5: Thorn Burst (9 dmg) |
| Ancient Spirit | Spirits | boss | 70 | 24 | 18 | 10 | 6-12 | 65 | R2: Spirit Shield (buff), R4: Soul Drain (10 dmg), R7: Wrath (15 dmg) |
| Dark Treant | Treants | trash | 50 | 14 | 18 | 0 | 4-8 | 30 | — |
| Moss Golem | Treants | trash | 55 | 12 | 22 | 0 | 3-7 | 28 | — |
| Ancient Treant | Treants | elite | 75 | 18 | 26 | 0 | 5-10 | 50 | R3: Root Cage (8 dmg), R6: Bark Shield (buff) |
| Treant Patriarch | Treants | boss | 110 | 22 | 30 | 0 | 7-14 | 80 | R3: Earthquake (10 dmg), R5: Regenerate (12 HP), R8: Ancient Fury (18 dmg) |
| Pixie Swarm | Fae | trash | 20 | 18 | 6 | 14 | 2-5 | 22 | R2: Confusion (debuff) |
| Thorn Fairy | Fae | trash | 28 | 16 | 10 | 10 | 3-6 | 26 | R3: Thorn Shot (5 dmg) |
| Fae Knight | Fae | elite | 50 | 22 | 16 | 8 | 5-10 | 46 | R2: Enchanted Blade (buff), R5: Fae Strike (11 dmg) |
| Fae Queen | Fae | boss | 75 | 26 | 20 | 12 | 6-13 | 75 | R2: Royal Guard (buff), R4: Charm (debuff), R6: Fae Wrath (16 dmg) |

#### Cave Entrance (diff 2)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Cave Rat | Vermin | trash | 16 | 8 | 4 | 4 | 1-4 | 10 | — |
| Cavern Beetle | Vermin | trash | 20 | 7 | 8 | 2 | 2-4 | 12 | — |
| Giant Cave Spider | Vermin | elite | 30 | 14 | 8 | 5 | 3-7 | 26 | R3: Web Trap (debuff) |
| Rat Matriarch | Vermin | boss | 50 | 16 | 10 | 3 | 4-8 | 42 | R3: Summon Swarm (6 dmg), R6: Frenzy (10 dmg) |
| Cave Bat | Bats | trash | 14 | 12 | 4 | 8 | 2-4 | 12 | — |
| Dire Bat | Bats | trash | 22 | 14 | 6 | 7 | 2-5 | 16 | — |
| Vampire Bat | Bats | elite | 35 | 18 | 8 | 9 | 3-7 | 30 | R3: Life Drain (5 dmg, heal self) |
| Bat Swarm Lord | Bats | boss | 55 | 22 | 10 | 6 | 4-9 | 48 | R2: Screech (debuff), R5: Swarm (10 dmg) |
| Goblin | Goblins | trash | 18 | 11 | 6 | 4 | 2-5 | 12 | — |
| Goblin Archer | Goblins | trash | 15 | 14 | 4 | 5 | 2-6 | 14 | — |
| Goblin Warrior | Goblins | elite | 32 | 16 | 10 | 3 | 3-7 | 28 | — |
| Goblin Shaman | Goblins | boss | 45 | 14 | 8 | 5 | 3-6 | 44 | R2: Hex (debuff), R4: Fire Bolt (8 dmg), R6: Dark Ritual (12 dmg) |

#### Deep Mines (diff 3, dead end)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Goblin Miner | Goblins | trash | 28 | 16 | 10 | 4 | 3-7 | 24 | — |
| Goblin Sapper | Goblins | trash | 22 | 18 | 8 | 5 | 4-8 | 26 | R3: Bomb (7 dmg) |
| Goblin Foreman | Goblins | elite | 45 | 20 | 14 | 3 | 5-10 | 42 | R4: Whip Crack (buff, +2 ATK self) |
| Goblin Chieftain | Goblins | boss | 70 | 24 | 18 | 4 | 6-12 | 60 | R2: War Cry (buff), R4: Cleave (10 dmg), R7: Execute (15 dmg) |
| Clay Golem | Golems | trash | 40 | 12 | 18 | 0 | 3-7 | 22 | — |
| Stone Golem | Golems | trash | 50 | 14 | 22 | 0 | 4-8 | 28 | — |
| Iron Golem | Golems | elite | 70 | 18 | 28 | 0 | 5-10 | 48 | R4: Ground Pound (9 dmg) |
| Crystal Golem | Golems | boss | 100 | 22 | 32 | 0 | 7-14 | 70 | R3: Crystal Barrage (8 dmg), R5: Harden (buff), R8: Shatter (16 dmg) |
| Rock Crawler | Crawlers | trash | 30 | 16 | 14 | 3 | 3-7 | 24 | — |
| Cave Lurker | Crawlers | trash | 25 | 18 | 10 | 6 | 4-7 | 22 | — |
| Burrower | Crawlers | elite | 50 | 22 | 16 | 4 | 5-10 | 44 | R3: Burrow (dodge next attack), R5: Ambush (11 dmg) |
| Tunnel Wyrm | Crawlers | boss | 80 | 26 | 20 | 2 | 7-14 | 68 | R3: Tremor (8 dmg), R5: Acid Spit (12 dmg), R8: Swallow (18 dmg) |

#### Whispering Plains (diff 3)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Plains Wolf | Wolves | trash | 35 | 18 | 12 | 6 | 4-8 | 26 | — |
| Coyote | Wolves | trash | 28 | 20 | 8 | 8 | 3-7 | 24 | — |
| Warg | Wolves | elite | 55 | 24 | 16 | 5 | 6-11 | 46 | R3: Pounce (9 dmg) |
| Pack Alpha | Wolves | boss | 80 | 28 | 20 | 6 | 7-13 | 65 | R2: Howl (buff), R4: Savage Bite (12 dmg), R7: Frenzy (16 dmg) |
| Highway Bandit | Bandits | trash | 32 | 18 | 10 | 5 | 3-7 | 24 | — |
| Bandit Archer | Bandits | trash | 26 | 20 | 8 | 6 | 4-8 | 26 | — |
| Bandit Lieutenant | Bandits | elite | 50 | 22 | 14 | 5 | 5-10 | 44 | R3: Dirty Trick (debuff) |
| Bandit Warlord | Bandits | boss | 75 | 26 | 18 | 5 | 6-12 | 62 | R2: Battle Cry (buff), R4: Shield Bash (8 dmg), R6: Devastating Blow (14 dmg) |
| Harpy | Harpies | trash | 28 | 18 | 8 | 10 | 3-7 | 26 | — |
| Harpy Scout | Harpies | trash | 24 | 16 | 6 | 12 | 3-6 | 24 | — |
| Harpy Windcaller | Harpies | elite | 45 | 22 | 12 | 9 | 5-10 | 44 | R3: Gust (6 dmg), R5: Wind Shear (10 dmg) |
| Harpy Matriarch | Harpies | boss | 70 | 26 | 16 | 8 | 6-12 | 64 | R2: Screech (debuff), R4: Talon Fury (10 dmg), R7: Tempest (16 dmg) |

#### Haunted Marsh (diff 4)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Skeleton | Undead | trash | 40 | 22 | 16 | 3 | 5-9 | 36 | — |
| Zombie | Undead | trash | 55 | 18 | 12 | 1 | 4-10 | 34 | — |
| Wraith | Undead | elite | 60 | 26 | 14 | 10 | 6-12 | 56 | R3: Life Drain (8 dmg, heal), R5: Fear (debuff) |
| Death Knight | Undead | boss | 100 | 30 | 24 | 4 | 8-16 | 85 | R2: Dark Aura (buff), R4: Soul Strike (12 dmg), R7: Death Blow (20 dmg) |
| Bog Toad | Swamp Beasts | trash | 45 | 20 | 14 | 4 | 4-9 | 34 | R3: Tongue Lash (5 dmg) |
| Marsh Crawler | Swamp Beasts | trash | 50 | 18 | 18 | 2 | 5-9 | 36 | — |
| Swamp Hydra | Swamp Beasts | elite | 80 | 24 | 20 | 3 | 6-12 | 58 | R3: Acid Spray (8 dmg), R5: Regenerate (6 HP) |
| Ancient Crocodile | Swamp Beasts | boss | 110 | 28 | 26 | 1 | 8-16 | 82 | R3: Death Roll (12 dmg), R5: Submerge (dodge), R7: Jaws (18 dmg) |
| Hag Servant | Witches | trash | 35 | 20 | 10 | 6 | 4-8 | 32 | R3: Curse (debuff) |
| Cursed Villager | Witches | trash | 45 | 16 | 14 | 3 | 4-9 | 30 | — |
| Bog Witch | Witches | elite | 55 | 24 | 12 | 8 | 5-11 | 54 | R2: Hex (debuff), R4: Shadow Bolt (9 dmg), R6: Drain Life (7 dmg, heal) |
| Coven Mother | Witches | boss | 85 | 28 | 18 | 7 | 7-14 | 80 | R2: Dark Shield (buff), R4: Poison Cloud (10 dmg), R6: Curse of Weakness (debuff), R8: Cataclysm (18 dmg) |

#### Crystal Caverns (diff 4)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Goblin Gem Hunter | Goblins | trash | 38 | 22 | 12 | 6 | 4-9 | 36 | — |
| Goblin Tunneler | Goblins | trash | 42 | 20 | 14 | 4 | 5-9 | 38 | — |
| Goblin Artificer | Goblins | elite | 60 | 26 | 16 | 5 | 6-11 | 56 | R3: Bomb Trap (9 dmg), R5: Gadget Shield (buff) |
| Goblin King | Goblins | boss | 95 | 30 | 22 | 5 | 7-15 | 82 | R2: Royal Decree (buff), R4: Golden Strike (12 dmg), R6: Gem Barrage (14 dmg), R8: Crown's Fury (20 dmg) |
| Crystal Golem | Golems | trash | 60 | 16 | 26 | 0 | 5-10 | 38 | — |
| Gem Construct | Golems | trash | 55 | 18 | 24 | 0 | 5-9 | 36 | — |
| Diamond Golem | Golems | elite | 90 | 22 | 32 | 0 | 7-13 | 60 | R4: Crystal Slam (11 dmg), R6: Diamond Shell (buff) |
| Golem Overlord | Golems | boss | 130 | 26 | 36 | 0 | 8-16 | 90 | R3: Shockwave (10 dmg), R5: Crystal Prison (debuff), R7: Overload (16 dmg), R9: Collapse (22 dmg) |
| Shard Elemental | Elementals | trash | 40 | 24 | 14 | 8 | 5-9 | 38 | R3: Crystal Shard (6 dmg) |
| Crystal Wisp | Elementals | trash | 30 | 22 | 10 | 12 | 4-8 | 36 | — |
| Storm Crystal | Elementals | elite | 55 | 28 | 18 | 7 | 6-12 | 58 | R3: Lightning Arc (9 dmg), R5: Static Field (debuff) |
| Crystal Titan | Elementals | boss | 90 | 32 | 24 | 5 | 8-16 | 85 | R2: Resonance (buff), R4: Crystal Storm (12 dmg), R6: Prism Beam (16 dmg), R8: Shatter All (22 dmg) |

#### Sunken Ruins (diff 5, dead end)

| Mob | Family | Role | HP | ATK | DEF | EVA | DMG | XP | Spells |
|-----|--------|------|-----|-----|-----|-----|-----|-----|--------|
| Drowned Sailor | Undead | trash | 55 | 26 | 18 | 4 | 6-11 | 48 | — |
| Skeletal Knight | Undead | trash | 65 | 28 | 22 | 3 | 6-12 | 52 | — |
| Spectral Captain | Undead | elite | 80 | 32 | 20 | 8 | 8-14 | 72 | R3: Ghost Blade (10 dmg), R5: Spectral Chains (debuff) |
| Lich | Undead | boss | 120 | 36 | 26 | 6 | 9-18 | 110 | R2: Death Ward (buff), R4: Necrotic Bolt (14 dmg), R6: Raise Dead (summon), R8: Soul Harvest (22 dmg) |
| Sea Snake | Serpents | trash | 45 | 28 | 14 | 10 | 5-10 | 48 | R3: Venom Strike (6 dmg) |
| Marsh Viper | Serpents | trash | 40 | 30 | 12 | 12 | 5-11 | 50 | — |
| Naga Warrior | Serpents | elite | 70 | 34 | 22 | 8 | 7-14 | 74 | R3: Trident Thrust (11 dmg), R5: Scale Shield (buff) |
| Naga Queen | Serpents | boss | 110 | 38 | 28 | 7 | 9-18 | 105 | R2: Tidal Blessing (buff), R4: Water Jet (14 dmg), R6: Constrict (debuff), R8: Tsunami (24 dmg) |
| Ooze | Abominations | trash | 60 | 20 | 20 | 0 | 5-10 | 46 | R3: Acid Splash (6 dmg) |
| Tentacle Horror | Abominations | trash | 50 | 26 | 16 | 4 | 6-11 | 50 | R3: Grapple (debuff) |
| Flesh Golem | Abominations | elite | 90 | 30 | 24 | 0 | 8-14 | 72 | R3: Slam (10 dmg), R6: Regenerate (10 HP) |
| Eldritch Abomination | Abominations | boss | 140 | 34 | 28 | 3 | 10-20 | 120 | R2: Madness Aura (debuff), R4: Void Bolt (14 dmg), R6: Tentacle Storm (18 dmg), R9: Consume (28 dmg) |

---

## Gathering Resources by Zone

### Resource Nodes

| Zone | Mining | Woodcutting | Herbalism | Skill Req | Min Cap | Max Cap |
|------|--------|-------------|-----------|-----------|---------|---------|
| Forest Edge | Copper Ore | Oak Log | Forest Sage | 1 | 15 | 80 |
| Deep Forest | Tin Ore | Maple Log | Moonpetal | 5 | 20 | 100 |
| Cave Entrance | Tin Ore | Fungal Wood | Cave Moss | 5 | 20 | 100 |
| Ancient Grove | — | Elderwood Log | Starbloom | 12 | 25 | 120 |
| Deep Mines | Iron Ore | — | Glowcap Mushroom | 12 | 25 | 120 |
| Whispering Plains | Sandstone | Willow Log | Windbloom | 12 | 25 | 120 |
| Haunted Marsh | Dark Iron Ore | Bogwood Log | Gravemoss | 20 | 30 | 150 |
| Crystal Caverns | Mithril Ore | Crystal Wood | Shimmer Fern | 20 | 30 | 150 |
| Sunken Ruins | Ancient Ore | Petrified Wood | Abyssal Kelp | 30 | 40 | 200 |

Ancient Grove has no mining (sacred forest). Deep Mines has no woodcutting (underground). Dead ends are specialised.

### Processed Materials

| Tier | Ore → Ingot | Log → Plank | Herb → Potion | Refining Level |
|------|-------------|-------------|---------------|----------------|
| 1 | Copper Ore → Copper Ingot | Oak Log → Oak Plank | Forest Sage → Minor Health Potion | 1 |
| 2 | Tin Ore → Tin Ingot | Maple Log → Maple Plank | Moonpetal → Health Potion | 5 |
| 2b | — | Fungal Wood → Fungal Plank | Cave Moss → Antivenom Potion | 5 |
| 3 | Iron Ore → Iron Ingot | Willow Log → Willow Plank | — | 12 |
| 3b | Sandstone → Cut Stone | Elderwood Log → Elderwood Plank | Starbloom → Greater Health Potion | 12 |
| 4 | Dark Iron Ore → Dark Iron Ingot | Bogwood Log → Bogwood Plank | Gravemoss → Resist Potion | 20 |
| 4b | Mithril Ore → Mithril Ingot | Crystal Wood → Crystal Plank | Shimmer Fern → Mana Potion | 20 |
| 5 | Ancient Ore → Ancient Ingot | Petrified Wood → Petrified Plank | Abyssal Kelp → Elixir of Power | 30 |

### Mob Drop Materials

| Zone Tier | Leather/Hide | Cloth/Silk | Family-Specific |
|-----------|-------------|------------|-----------------|
| 1 (Forest Edge) | Rat Pelt, Boar Hide | Spider Silk | Rat Tail, Boar Tusk |
| 2 (Deep Forest) | Wolf Pelt | Bandit Cloth | Wolf Fang, Ancient Bark |
| 2 (Cave Entrance) | Bat Wing | Goblin Rag | Bat Fang, Stolen Coin, Crude Gemstone |
| 3 (Ancient Grove) | — | Fae Silk, Dryad Thread | Sprite Dust, Pixie Wing |
| 3 (Deep Mines) | Crawler Chitin | — | Rough Gem, Stolen Ore, Crystal Shard |
| 3 (Plains) | Warg Hide, Harpy Feather | — | Harpy Talon |
| 4 (Marsh) | Croc Hide, Hydra Scale | Witch Cloth, Wraith Essence | Bone Fragment, Bog Heart |
| 4 (Crystal Cav) | — | — | Cut Gem, Goblin Gold, Dark Crystal |
| 5 (Sunken Ruins) | Naga Scale | Spectral Silk, Ooze Residue | Eldritch Fragment, Lich Dust, Naga Pearl, Ancient Relic |

### Processed Leather/Cloth

| Tier | Hide → Leather | Silk/Cloth → Fabric | Tanning/Weaving Level |
|------|---------------|--------------------|-----------------------|
| 1 | Rat Pelt → Rat Leather | Spider Silk → Silk Cloth | 1 |
| 1 | Boar Hide → Boar Leather | — | 1 |
| 2 | Wolf Pelt → Wolf Leather | Bandit Cloth → Woven Cloth | 5 |
| 2 | Bat Wing → Bat Leather | — | 5 |
| 3 | Warg Hide → Warg Leather | Fae Silk → Fae Fabric | 12 |
| 3 | Crawler Chitin → Chitin Plate | — | 12 |
| 4 | Croc Hide → Croc Leather | Witch Cloth → Cursed Fabric | 20 |
| 4 | Hydra Scale → Scale Mail | Wraith Essence → Ethereal Cloth | 20 |
| 5 | Naga Scale → Naga Leather | Spectral Silk → Spectral Fabric | 30 |

---

## Equipment Tiers

### Weapons (main_hand)

| Tier | Melee | Ranged | Magic | Req Level | Crafted At |
|------|-------|--------|-------|-----------|------------|
| 1 | Wooden Sword | Oak Shortbow | Oak Staff | 1 | Millbrook |
| 1+ | Copper Dagger | — | — | 3 | Millbrook |
| 2 | Tin Sword | Maple Longbow | Maple Staff | 5 | Millbrook |
| 2+ | Boar Tusk Mace | Bat Wing Crossbow | Goblin Hex Staff | 8 | Millbrook |
| 3 | Iron Longsword | Willow Warbow | Elderwood Staff | 12 | Thornwall |
| 3+ | Crawler Fang Blade | Harpy Talon Bow | Fae Crystal Staff | 16 | Thornwall |
| 4 | Dark Iron Greatsword | Bogwood Longbow | Crystal Staff | 20 | Thornwall |
| 4+ | Hydra Fang Sabre | Wraith Bow | Witch's Sceptre | 25 | Thornwall |
| 5 | Mithril Blade | Ancient Bow | Lich Staff | 30 | Thornwall |

"+" tiers require mob-family-specific materials alongside base metals/woods.

### Armour (chest slot examples — other slots follow same pattern with scaled stats)

| Tier | Heavy | Medium | Light | Req Level |
|------|-------|--------|-------|-----------|
| 1 | Copper Chainmail | Boar Leather Vest | Silk Robe | 1-5 |
| 2 | Tin Plate Cuirass | Wolf Leather Vest | Woven Tunic | 5-10 |
| 3 | Iron Breastplate | Warg Hide Coat | Fae Silk Robe | 12-18 |
| 4 | Dark Iron Platemail | Croc Scale Vest | Cursed Garb | 20-28 |
| 5 | Mithril Warplate | Naga Scale Armour | Spectral Robe | 30+ |

### Slot Unlock by Tier

| Tier | Normal Crafting Slots |
|------|---------------------|
| 1 | Head, Chest |
| 2 | Head, Chest, Legs |
| 3 | Head, Chest, Legs, Boots, Gloves |
| 4 | Head, Chest, Legs, Boots, Gloves, Belt |
| 5 | All armour slots |

---

## Advanced (Soulbound) Recipes

Advanced recipes drop from encounter site loot chests. They fill slots above the current tier's normal crafting.

### Principle

Advanced recipes give gear in slots you can't normally craft yet at that tier.

### Tier 1 Advanced Recipes (from Forest Edge sites)

| Family | Recipe | Slot | Key Stats | Materials |
|--------|--------|------|-----------|-----------|
| Vermin | Rat Hide Gloves | Gloves | Attack +2, Evasion +1 | 8x Rat Tail, 4x Rat Leather, 3x Copper Ingot |
| Spiders | Spider Silk Belt | Belt | Health +3, Dodge +2 | 6x Spider Silk, 3x Silk Cloth, 2x Oak Plank |
| Boars | Boar Hide Boots | Boots | Armor +2, Health +2 | 6x Boar Hide, 4x Boar Tusk, 2x Copper Ingot |

### Tier 2 Advanced Recipes (from Deep Forest / Cave Entrance sites)

| Family | Recipe | Slot | Key Stats | Materials |
|--------|--------|------|-----------|-----------|
| Wolves | Wolf Fang Necklace | Neck | Attack +3, CritChance +1 | 8x Wolf Fang, 4x Wolf Leather, 2x Tin Ingot |
| Bandits | Bandit's Lucky Ring | Ring | Luck +3, Evasion +2 | 6x Stolen Coin, 3x Crude Gemstone, 2x Tin Ingot |
| Treants | Ironbark Gloves | Gloves | Armor +4, MagicDef +3 | 6x Ancient Bark, 4x Maple Plank, 2x Wolf Leather |
| Bats | Bat Wing Boots | Boots | Dodge +4, Evasion +2 | 8x Bat Wing, 4x Bat Leather, 2x Maple Plank |
| Goblins | Goblin Trinket Charm | Charm | Luck +2, Health +3 | 5x Crude Gemstone, 4x Stolen Coin, 3x Tin Ingot |

### Tier 3 Advanced Recipes (from Ancient Grove / Deep Mines / Whispering Plains sites)

| Family | Recipe | Slot | Key Stats | Materials |
|--------|--------|------|-----------|-----------|
| Spirits | Sprite Dust Ring | Ring | MagicPower +4, Luck +2 | 8x Sprite Dust, 4x Fae Fabric, 2x Iron Ingot |
| Fae | Fae Crown | Charm | MagicDef +5, Dodge +3 | 6x Pixie Wing, 4x Fae Fabric, 3x Elderwood Plank |
| Treants (Grove) | Heartwood Shield | Off-hand | Armor +6, Health +4 | 10x Ancient Bark, 4x Elderwood Plank, 2x Iron Ingot |
| Golems | Crystal Core Belt | Belt | Armor +5, Health +5 | 6x Crystal Shard, 4x Iron Ingot, 3x Cut Stone |
| Crawlers | Chitin Gauntlets | Gloves | Attack +4, Armor +3 | 8x Crawler Chitin, 4x Chitin Plate, 2x Iron Ingot |
| Wolves (Plains) | Warg Rider Belt | Belt | Attack +3, Evasion +3, Health +2 | 6x Warg Hide, 4x Warg Leather, 3x Willow Plank |
| Bandits (Plains) | Warlord's Signet | Ring | Attack +3, CritDamage +0.1 | 5x Stolen Coin, 4x Crude Gemstone, 3x Iron Ingot |
| Harpies | Windcaller's Charm | Charm | Dodge +5, Evasion +3 | 8x Harpy Feather, 4x Harpy Talon, 2x Willow Plank |

### Tier 4 Advanced Recipes (from Haunted Marsh / Crystal Caverns sites)

| Family | Recipe | Slot | Key Stats | Materials |
|--------|--------|------|-----------|-----------|
| Undead | Death Knight's Ring | Ring | Attack +5, CritChance +2 | 8x Bone Fragment, 4x Wraith Essence, 3x Dark Iron Ingot |
| Swamp Beasts | Hydra Scale Shield | Off-hand | Armor +8, Health +6 | 10x Hydra Scale, 4x Scale Mail, 3x Bogwood Plank |
| Witches | Coven Amulet | Neck | MagicPower +6, CritChance +2 | 6x Bog Heart, 4x Cursed Fabric, 3x Dark Iron Ingot |
| Elementals | Storm Crystal Charm | Charm | MagicPower +5, CritDamage +0.15 | 8x Dark Crystal, 4x Crystal Plank, 3x Mithril Ingot |
| Golems (Cav) | Diamond Golem Belt | Belt | Armor +8, MagicDef +6 | 6x Dark Crystal, 4x Cut Gem, 4x Mithril Ingot |
| Goblins (Cav) | Goblin King's Crown | Head | Luck +5, Attack +4, Health +4 | 8x Goblin Gold, 6x Cut Gem, 4x Mithril Ingot |

### Tier 5 Advanced Recipes (from Sunken Ruins sites)

Reserved for future set gear / guild raid content. Placeholder families: Undead, Serpents, Abominations.

---

## Drop Tables (per mob)

### Forest Edge

**Forest Rat:** Rat Tail 60% (1-2), Rat Pelt 40% (1), Copper Ore 15% (1-2)
**Field Mouse:** Rat Tail 50% (1), Rat Pelt 30% (1)
**Giant Rat:** Rat Tail 70% (2-3), Rat Pelt 55% (1-2), Minor Health Potion 8% (1)
**Rat King:** Rat Tail 80% (3-5), Rat Pelt 60% (2-3), Copper Ore 40% (2-4), Minor Health Potion 15% (1)

**Forest Spider:** Spider Silk 60% (1-3), Forest Sage 10% (1)
**Web Spinner:** Spider Silk 55% (1-2), Forest Sage 15% (1)
**Venomous Spider:** Spider Silk 70% (2-4), Minor Health Potion 10% (1)
**Brood Mother:** Spider Silk 80% (3-6), Forest Sage 30% (1-2), Minor Health Potion 20% (1)

**Wild Boar:** Boar Hide 50% (1), Boar Tusk 45% (1-2), Oak Log 10% (1-2)
**Tusked Boar:** Boar Hide 60% (1-2), Boar Tusk 55% (2-3), Copper Ore 15% (1-2)
**Great Boar:** Boar Hide 70% (2-3), Boar Tusk 65% (3-4), Copper Ore 30% (2-3), Minor Health Potion 15% (1)

### Deep Forest

**Young Wolf:** Wolf Pelt 45% (1), Wolf Fang 30% (1)
**Forest Wolf:** Wolf Pelt 55% (1-2), Wolf Fang 35% (1-2)
**Dire Wolf:** Wolf Pelt 65% (2-3), Wolf Fang 50% (2-3), Health Potion 6% (1)
**Alpha Wolf:** Wolf Pelt 75% (3-4), Wolf Fang 65% (3-4), Health Potion 12% (1)

**Woodland Bandit:** Bandit Cloth 45% (1), Stolen Coin 40% (1-2), Copper Ore 15% (1-2)
**Bandit Scout:** Bandit Cloth 40% (1), Stolen Coin 35% (1)
**Bandit Enforcer:** Bandit Cloth 55% (2-3), Stolen Coin 50% (2-3), Crude Gemstone 10% (1)
**Bandit Captain:** Bandit Cloth 65% (3-4), Stolen Coin 60% (3-5), Crude Gemstone 20% (1), Health Potion 10% (1)

**Twig Blight:** Ancient Bark 50% (1-2), Oak Log 20% (1-2)
**Bark Golem:** Ancient Bark 55% (2-3), Maple Log 15% (1-2)
**Dark Treant:** Ancient Bark 65% (3-4), Maple Log 25% (2-3)
**Elder Treant:** Ancient Bark 75% (4-6), Maple Log 40% (3-4), Health Potion 10% (1)

### Cave Entrance

**Cave Rat:** Rat Pelt 45% (1), Rat Tail 40% (1), Copper Ore 20% (1-2)
**Cavern Beetle:** Crawler Chitin 40% (1), Copper Ore 25% (1-2)
**Giant Cave Spider:** Spider Silk 55% (2-3), Crude Gemstone 10% (1)
**Rat Matriarch:** Rat Pelt 60% (2-3), Rat Tail 55% (2-3), Crude Gemstone 15% (1), Health Potion 10% (1)

**Cave Bat:** Bat Wing 50% (1), Bat Fang 35% (1)
**Dire Bat:** Bat Wing 55% (1-2), Bat Fang 45% (1-2)
**Vampire Bat:** Bat Wing 65% (2-3), Bat Fang 55% (2-3), Health Potion 8% (1)
**Bat Swarm Lord:** Bat Wing 75% (3-5), Bat Fang 65% (3-4), Health Potion 15% (1)

**Goblin:** Goblin Rag 40% (1), Stolen Coin 35% (1-2)
**Goblin Archer:** Goblin Rag 35% (1), Stolen Coin 40% (1-2), Crude Gemstone 8% (1)
**Goblin Warrior:** Goblin Rag 50% (2-3), Stolen Coin 50% (2-4), Crude Gemstone 15% (1)
**Goblin Shaman:** Goblin Rag 55% (2-3), Stolen Coin 55% (3-5), Crude Gemstone 25% (1-2), Health Potion 12% (1)

### Deep Mines

**Goblin Miner:** Stolen Ore 50% (1-2), Rough Gem 25% (1), Iron Ore 20% (1-2)
**Goblin Sapper:** Stolen Ore 45% (1-2), Rough Gem 20% (1), Iron Ore 25% (1-3)
**Goblin Foreman:** Stolen Ore 60% (2-4), Rough Gem 35% (1-2), Iron Ore 30% (2-3)
**Goblin Chieftain:** Stolen Ore 70% (3-5), Rough Gem 50% (2-3), Iron Ore 40% (3-5), Greater Health Potion 10% (1)

**Clay Golem:** Crystal Shard 35% (1), Iron Ore 30% (1-2)
**Stone Golem:** Crystal Shard 40% (1-2), Iron Ore 35% (1-3)
**Iron Golem:** Crystal Shard 55% (2-3), Iron Ore 45% (2-4)
**Crystal Golem:** Crystal Shard 70% (3-5), Iron Ore 50% (3-5), Greater Health Potion 10% (1)

**Rock Crawler:** Crawler Chitin 55% (1-2), Iron Ore 15% (1)
**Cave Lurker:** Crawler Chitin 50% (1-2), Iron Ore 20% (1-2)
**Burrower:** Crawler Chitin 65% (2-4), Iron Ore 25% (2-3)
**Tunnel Wyrm:** Crawler Chitin 75% (3-5), Crystal Shard 40% (2-3), Greater Health Potion 12% (1)

### Whispering Plains

**Plains Wolf:** Wolf Pelt 50% (1-2), Warg Hide 15% (1)
**Coyote:** Wolf Pelt 45% (1), Wolf Fang 35% (1)
**Warg:** Warg Hide 55% (1-2), Wolf Fang 45% (2-3)
**Pack Alpha:** Warg Hide 65% (2-3), Wolf Fang 60% (3-4), Greater Health Potion 8% (1)

**Highway Bandit:** Bandit Cloth 45% (1-2), Stolen Coin 45% (2-3)
**Bandit Archer:** Bandit Cloth 40% (1), Stolen Coin 40% (1-2), Harpy Feather 10% (1)
**Bandit Lieutenant:** Bandit Cloth 55% (2-3), Stolen Coin 55% (3-5), Crude Gemstone 15% (1)
**Bandit Warlord:** Bandit Cloth 65% (3-4), Stolen Coin 60% (4-6), Crude Gemstone 25% (1-2), Greater Health Potion 10% (1)

**Harpy:** Harpy Feather 55% (1-2), Harpy Talon 35% (1)
**Harpy Scout:** Harpy Feather 50% (1), Harpy Talon 30% (1)
**Harpy Windcaller:** Harpy Feather 65% (2-3), Harpy Talon 50% (2-3), Windbloom 15% (1)
**Harpy Matriarch:** Harpy Feather 75% (3-5), Harpy Talon 60% (3-4), Windbloom 25% (1-2), Greater Health Potion 10% (1)

### Ancient Grove

**Forest Sprite:** Sprite Dust 55% (1-2), Starbloom 15% (1)
**Wisp:** Sprite Dust 45% (1), Dryad Thread 20% (1)
**Dryad:** Sprite Dust 60% (2-3), Dryad Thread 45% (1-2), Starbloom 20% (1)
**Ancient Spirit:** Sprite Dust 75% (3-5), Dryad Thread 55% (2-3), Starbloom 35% (1-2), Greater Health Potion 12% (1)

**Dark Treant (Grove):** Ancient Bark 55% (2-3), Elderwood Log 20% (1-2)
**Moss Golem:** Ancient Bark 50% (2-3), Elderwood Log 25% (1-2)
**Ancient Treant:** Ancient Bark 65% (3-5), Elderwood Log 35% (2-3)
**Treant Patriarch:** Ancient Bark 80% (4-6), Elderwood Log 50% (3-5), Greater Health Potion 10% (1)

**Pixie Swarm:** Pixie Wing 55% (1-2), Fae Silk 30% (1)
**Thorn Fairy:** Pixie Wing 45% (1), Fae Silk 40% (1-2)
**Fae Knight:** Pixie Wing 60% (2-3), Fae Silk 50% (2-3), Starbloom 15% (1)
**Fae Queen:** Pixie Wing 75% (3-5), Fae Silk 65% (3-4), Starbloom 30% (1-2), Greater Health Potion 12% (1)

### Haunted Marsh

**Skeleton:** Bone Fragment 55% (1-2), Wraith Essence 10% (1)
**Zombie:** Bone Fragment 50% (1-2), Gravemoss 15% (1)
**Wraith:** Wraith Essence 55% (1-2), Bone Fragment 40% (2-3), Resist Potion 8% (1)
**Death Knight:** Wraith Essence 70% (2-4), Bone Fragment 60% (3-5), Resist Potion 15% (1)

**Bog Toad:** Croc Hide 30% (1), Bog Heart 20% (1)
**Marsh Crawler:** Croc Hide 35% (1), Hydra Scale 15% (1)
**Swamp Hydra:** Hydra Scale 55% (1-2), Bog Heart 40% (1-2), Resist Potion 8% (1)
**Ancient Crocodile:** Croc Hide 65% (2-3), Hydra Scale 50% (2-3), Bog Heart 45% (2-3), Resist Potion 12% (1)

**Hag Servant:** Witch Cloth 45% (1), Bog Heart 15% (1)
**Cursed Villager:** Witch Cloth 40% (1), Gravemoss 20% (1)
**Bog Witch:** Witch Cloth 55% (2-3), Bog Heart 35% (1-2), Gravemoss 25% (1)
**Coven Mother:** Witch Cloth 70% (3-4), Bog Heart 55% (2-3), Gravemoss 40% (2-3), Resist Potion 15% (1)

### Crystal Caverns

**Goblin Gem Hunter:** Cut Gem 40% (1), Goblin Gold 35% (1-2), Mithril Ore 15% (1)
**Goblin Tunneler:** Cut Gem 35% (1), Goblin Gold 30% (1-2), Mithril Ore 20% (1-2)
**Goblin Artificer:** Cut Gem 55% (1-2), Goblin Gold 50% (2-4), Mithril Ore 25% (1-2)
**Goblin King:** Cut Gem 70% (2-4), Goblin Gold 65% (4-6), Mithril Ore 35% (2-3), Mana Potion 12% (1)

**Crystal Golem (Cav):** Dark Crystal 45% (1-2), Mithril Ore 25% (1-2)
**Gem Construct:** Dark Crystal 40% (1), Mithril Ore 20% (1)
**Diamond Golem:** Dark Crystal 60% (2-3), Mithril Ore 35% (2-3)
**Golem Overlord:** Dark Crystal 75% (3-5), Mithril Ore 45% (3-4), Mana Potion 10% (1)

**Shard Elemental:** Dark Crystal 50% (1-2), Crystal Wood 15% (1)
**Crystal Wisp:** Dark Crystal 45% (1), Shimmer Fern 20% (1)
**Storm Crystal:** Dark Crystal 60% (2-3), Crystal Wood 25% (1-2), Shimmer Fern 20% (1)
**Crystal Titan:** Dark Crystal 75% (3-5), Crystal Wood 35% (2-3), Shimmer Fern 30% (1-2), Mana Potion 12% (1)

### Sunken Ruins

**Drowned Sailor:** Bone Fragment 45% (1-2), Spectral Silk 25% (1)
**Skeletal Knight:** Bone Fragment 50% (2-3), Wraith Essence 30% (1), Ancient Relic 5% (1)
**Spectral Captain:** Spectral Silk 55% (2-3), Wraith Essence 45% (2-3), Ancient Relic 12% (1)
**Lich:** Lich Dust 70% (2-4), Spectral Silk 60% (3-4), Ancient Relic 25% (1-2), Elixir of Power 10% (1)

**Sea Snake:** Naga Scale 45% (1), Naga Pearl 10% (1)
**Marsh Viper:** Naga Scale 40% (1), Abyssal Kelp 20% (1)
**Naga Warrior:** Naga Scale 60% (2-3), Naga Pearl 30% (1-2), Abyssal Kelp 25% (1)
**Naga Queen:** Naga Scale 75% (3-5), Naga Pearl 50% (2-3), Ancient Relic 20% (1), Elixir of Power 10% (1)

**Ooze:** Ooze Residue 55% (1-2), Abyssal Kelp 15% (1)
**Tentacle Horror:** Ooze Residue 50% (1-2), Eldritch Fragment 20% (1)
**Flesh Golem:** Ooze Residue 60% (2-3), Eldritch Fragment 40% (1-2)
**Eldritch Abomination:** Eldritch Fragment 70% (3-5), Ooze Residue 55% (3-4), Ancient Relic 20% (1-2), Elixir of Power 12% (1)

---

## Encounter Site Chest Drop Tables

### Chest Tiers & Recipe Chances

| Site Size | Chest Rarity | Recipe Drop | Material Rolls | Consumable Rolls |
|-----------|-------------|-------------|----------------|-----------------|
| Small (2-3) | Common | 0% | 1-2 | 0-1 |
| Medium (4-6) | Uncommon | 2% | 2-4 | 1 |
| Large (7-10) | Rare | 5% | 3-6 | 1-2 |

Small chests drop only zone-generic materials. Medium and large chests include mob-family-specific materials needed for advanced recipes.

### Per-Family Chest Loot Tables

Each entry: Item, Drop Chance %, Quantity (min-max). All items in a chest are rolled independently.

#### Tier 1 Families (Forest Edge)

**Vermin Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Copper Ore | 80% (2-4) | 80% (3-6) | 90% (5-8) |
| Oak Log | 60% (1-3) | 60% (2-4) | 70% (3-6) |
| Forest Sage | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Rat Tail | — | 70% (3-5) | 80% (5-8) |
| Rat Pelt | — | 60% (2-4) | 70% (4-6) |
| Minor Health Potion | 30% (1) | 50% (1-2) | 60% (2-3) |

**Spiders Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Copper Ore | 70% (1-3) | 70% (2-4) | 80% (3-6) |
| Oak Log | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Forest Sage | 50% (1-2) | 60% (2-3) | 70% (3-5) |
| Spider Silk | — | 75% (4-8) | 85% (6-12) |
| Minor Health Potion | 30% (1) | 50% (1-2) | 60% (2-3) |

**Boars Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Copper Ore | 80% (2-4) | 80% (3-5) | 90% (4-8) |
| Oak Log | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Forest Sage | 40% (1-2) | 40% (1-3) | 50% (2-4) |
| Boar Tusk | — | 70% (3-5) | 80% (5-8) |
| Boar Hide | — | 60% (2-4) | 70% (4-6) |
| Minor Health Potion | 30% (1) | 50% (1-2) | 60% (2-3) |

#### Tier 2 Families (Deep Forest)

**Wolves Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 70% (2-4) | 70% (3-5) | 80% (4-7) |
| Maple Log | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Moonpetal | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Wolf Fang | — | 70% (3-6) | 80% (5-8) |
| Wolf Pelt | — | 60% (2-4) | 70% (4-6) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Bandits Chest (Deep Forest):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Maple Log | 50% (1-2) | 50% (2-3) | 60% (2-4) |
| Moonpetal | 40% (1-2) | 40% (1-2) | 50% (2-3) |
| Stolen Coin | — | 75% (4-8) | 85% (6-12) |
| Crude Gemstone | — | 50% (1-3) | 65% (2-4) |
| Bandit Cloth | — | 55% (2-4) | 65% (3-5) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Treants Chest (Deep Forest):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 60% (1-3) | 60% (2-3) | 70% (3-5) |
| Maple Log | 70% (2-4) | 75% (3-5) | 85% (4-8) |
| Moonpetal | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Ancient Bark | — | 70% (3-6) | 80% (5-10) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 2 Families (Cave Entrance)

**Vermin Chest (Cave):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 80% (2-4) | 80% (3-6) | 90% (5-8) |
| Copper Ore | 50% (1-3) | 50% (2-3) | 60% (2-4) |
| Cave Moss | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Rat Pelt | — | 55% (2-4) | 65% (3-5) |
| Rat Tail | — | 55% (2-4) | 65% (3-5) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Bats Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Fungal Wood | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Cave Moss | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Bat Wing | — | 70% (3-6) | 80% (5-8) |
| Bat Fang | — | 60% (2-4) | 70% (4-6) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Goblins Chest (Cave):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Tin Ore | 70% (2-3) | 70% (2-4) | 80% (3-6) |
| Fungal Wood | 40% (1-2) | 40% (1-3) | 50% (2-4) |
| Cave Moss | 40% (1-2) | 40% (1-2) | 50% (2-3) |
| Stolen Coin | — | 75% (4-8) | 85% (6-12) |
| Crude Gemstone | — | 50% (1-3) | 65% (2-4) |
| Goblin Rag | — | 50% (2-3) | 60% (3-5) |
| Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 3 Families (Ancient Grove)

**Spirits Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Elderwood Log | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Starbloom | 50% (1-2) | 60% (2-3) | 70% (3-5) |
| Sprite Dust | — | 70% (3-6) | 80% (5-10) |
| Dryad Thread | — | 50% (2-3) | 60% (3-5) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Treants Chest (Grove):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Elderwood Log | 75% (2-4) | 80% (3-6) | 90% (5-8) |
| Starbloom | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Ancient Bark | — | 75% (4-8) | 85% (6-12) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Fae Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Elderwood Log | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Starbloom | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Pixie Wing | — | 70% (3-6) | 80% (5-8) |
| Fae Silk | — | 60% (2-4) | 70% (4-6) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 3 Families (Deep Mines)

**Goblins Chest (Mines):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Iron Ore | 70% (2-4) | 75% (3-5) | 85% (5-8) |
| Glowcap Mushroom | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Stolen Ore | — | 65% (3-5) | 75% (5-8) |
| Rough Gem | — | 55% (2-3) | 65% (3-5) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Golems Chest (Mines):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Iron Ore | 80% (2-4) | 80% (3-6) | 90% (5-8) |
| Glowcap Mushroom | 30% (1) | 40% (1-2) | 50% (2-3) |
| Crystal Shard | — | 70% (3-5) | 80% (5-8) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Crawlers Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Iron Ore | 70% (2-3) | 70% (2-4) | 80% (3-6) |
| Glowcap Mushroom | 40% (1-2) | 40% (1-2) | 50% (2-3) |
| Crawler Chitin | — | 70% (3-6) | 80% (5-10) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 3 Families (Whispering Plains)

**Wolves Chest (Plains):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Sandstone | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Willow Log | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Windbloom | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Wolf Fang | — | 60% (2-4) | 70% (3-6) |
| Warg Hide | — | 55% (2-3) | 65% (3-5) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Bandits Chest (Plains):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Sandstone | 50% (1-2) | 50% (2-3) | 60% (2-4) |
| Willow Log | 50% (1-2) | 50% (2-3) | 60% (2-4) |
| Windbloom | 40% (1-2) | 40% (1-2) | 50% (2-3) |
| Stolen Coin | — | 75% (5-10) | 85% (8-15) |
| Crude Gemstone | — | 55% (2-4) | 70% (3-5) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Harpies Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Sandstone | 50% (1-2) | 50% (2-3) | 60% (2-4) |
| Willow Log | 50% (1-2) | 50% (2-3) | 60% (2-4) |
| Windbloom | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Harpy Feather | — | 70% (3-6) | 80% (5-8) |
| Harpy Talon | — | 55% (2-4) | 65% (3-5) |
| Greater Health Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 4 Families (Haunted Marsh)

**Undead Chest (Marsh):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Dark Iron Ore | 70% (2-4) | 75% (3-5) | 85% (5-8) |
| Bogwood Log | 50% (1-3) | 55% (2-4) | 65% (3-5) |
| Gravemoss | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Bone Fragment | — | 70% (3-6) | 80% (5-10) |
| Wraith Essence | — | 55% (2-3) | 65% (3-5) |
| Resist Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Swamp Beasts Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Dark Iron Ore | 60% (1-3) | 65% (2-4) | 75% (3-6) |
| Bogwood Log | 50% (1-2) | 55% (2-3) | 65% (3-5) |
| Gravemoss | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Hydra Scale | — | 65% (2-4) | 75% (4-6) |
| Bog Heart | — | 55% (2-3) | 65% (3-5) |
| Resist Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Witches Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Dark Iron Ore | 50% (1-2) | 55% (2-3) | 65% (3-5) |
| Bogwood Log | 50% (1-2) | 55% (2-3) | 65% (3-4) |
| Gravemoss | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Witch Cloth | — | 65% (3-5) | 75% (4-7) |
| Bog Heart | — | 55% (2-3) | 65% (3-5) |
| Resist Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 4 Families (Crystal Caverns)

**Goblins Chest (Caverns):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Mithril Ore | 70% (2-3) | 75% (3-5) | 85% (4-7) |
| Crystal Wood | 40% (1-2) | 45% (2-3) | 55% (3-4) |
| Shimmer Fern | 40% (1-2) | 40% (1-2) | 50% (2-3) |
| Cut Gem | — | 65% (2-4) | 75% (3-6) |
| Goblin Gold | — | 60% (3-6) | 75% (5-10) |
| Mana Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Golems Chest (Caverns):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Mithril Ore | 80% (2-4) | 80% (3-6) | 90% (5-8) |
| Crystal Wood | 40% (1-2) | 45% (2-3) | 55% (2-4) |
| Shimmer Fern | 30% (1) | 40% (1-2) | 50% (2-3) |
| Dark Crystal | — | 70% (3-5) | 80% (5-8) |
| Mana Potion | 20% (1) | 40% (1) | 50% (1-2) |

**Elementals Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Mithril Ore | 60% (1-3) | 65% (2-4) | 75% (3-6) |
| Crystal Wood | 50% (1-2) | 55% (2-3) | 65% (3-5) |
| Shimmer Fern | 50% (1-2) | 55% (2-3) | 65% (3-4) |
| Dark Crystal | — | 70% (3-6) | 80% (5-10) |
| Mana Potion | 20% (1) | 40% (1) | 50% (1-2) |

#### Tier 5 Families (Sunken Ruins)

**Undead Chest (Ruins):**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Ancient Ore | 70% (2-4) | 75% (3-5) | 85% (5-8) |
| Petrified Wood | 50% (1-3) | 55% (2-4) | 65% (3-5) |
| Abyssal Kelp | 40% (1-2) | 50% (2-3) | 60% (3-4) |
| Spectral Silk | — | 60% (2-4) | 70% (4-6) |
| Lich Dust | — | 50% (1-3) | 65% (3-5) |
| Ancient Relic | — | 20% (1) | 35% (1-2) |
| Elixir of Power | 15% (1) | 30% (1) | 45% (1-2) |

**Serpents Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Ancient Ore | 60% (1-3) | 65% (2-4) | 75% (3-6) |
| Petrified Wood | 50% (1-2) | 50% (2-3) | 60% (3-4) |
| Abyssal Kelp | 50% (1-2) | 55% (2-3) | 65% (3-5) |
| Naga Scale | — | 65% (3-5) | 75% (4-7) |
| Naga Pearl | — | 45% (1-2) | 60% (2-4) |
| Ancient Relic | — | 15% (1) | 30% (1-2) |
| Elixir of Power | 15% (1) | 30% (1) | 45% (1-2) |

**Abominations Chest:**
| Item | Small | Medium | Large |
|------|-------|--------|-------|
| Ancient Ore | 60% (1-3) | 60% (2-4) | 70% (3-5) |
| Petrified Wood | 40% (1-2) | 45% (2-3) | 55% (2-4) |
| Abyssal Kelp | 50% (1-2) | 55% (2-3) | 65% (3-4) |
| Eldritch Fragment | — | 65% (2-4) | 75% (4-7) |
| Ooze Residue | — | 55% (2-4) | 65% (4-6) |
| Ancient Relic | — | 15% (1) | 30% (1-2) |
| Elixir of Power | 15% (1) | 30% (1) | 45% (1-2) |

---

## Zone Mob Family Mapping (for seed data)

| Zone | Family | Discovery Weight | Min Size | Max Size |
|------|--------|-----------------|----------|----------|
| Forest Edge | Vermin | 110 | small | medium |
| Forest Edge | Spiders | 90 | small | medium |
| Forest Edge | Boars | 80 | small | medium |
| Deep Forest | Wolves | 100 | small | large |
| Deep Forest | Bandits | 80 | small | large |
| Deep Forest | Treants | 70 | small | medium |
| Ancient Grove | Spirits | 90 | small | large |
| Ancient Grove | Treants | 80 | medium | large |
| Ancient Grove | Fae | 70 | small | large |
| Cave Entrance | Vermin | 100 | small | medium |
| Cave Entrance | Bats | 90 | small | large |
| Cave Entrance | Goblins | 80 | small | large |
| Deep Mines | Goblins | 100 | small | large |
| Deep Mines | Golems | 80 | small | large |
| Deep Mines | Crawlers | 70 | small | large |
| Whispering Plains | Wolves | 90 | small | large |
| Whispering Plains | Bandits | 80 | small | large |
| Whispering Plains | Harpies | 70 | small | large |
| Haunted Marsh | Undead | 100 | small | large |
| Haunted Marsh | Swamp Beasts | 80 | small | large |
| Haunted Marsh | Witches | 70 | small | large |
| Crystal Caverns | Goblins | 90 | small | large |
| Crystal Caverns | Golems | 80 | medium | large |
| Crystal Caverns | Elementals | 70 | small | large |
| Sunken Ruins | Undead | 100 | medium | large |
| Sunken Ruins | Serpents | 80 | small | large |
| Sunken Ruins | Abominations | 70 | medium | large |

---

## ID Strategy

All seed IDs use `crypto.randomUUID()` at seed time instead of hardcoded strings. IDs are generated once during seeding and referenced via variable names in the seed script.

```typescript
// Instead of:
const FOREST_EDGE_ID = '11111111-1111-1111-1111-111111111111';

// Use:
const FOREST_EDGE_ID = crypto.randomUUID();
```

This produces proper random UUIDs while maintaining referential integrity within the seed script via variable references.
