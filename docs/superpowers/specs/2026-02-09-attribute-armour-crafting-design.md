# Attribute System, Skill Rework & Armour Crafting Ecosystem

## Overview

Rework the character progression system by splitting the flat "skills" list into **character attributes** (passive stats allocated on level-up) and **trainable skills** (things you actively do). Simultaneously introduce three armour weight classes with dedicated crafting skills and a material processing layer.

## Character Level & Attributes

### Character XP

- Separate XP pool from individual skills
- `character XP gained = skill XP earned × 0.3`
- Inherits diminishing returns from the source skill XP (already factored in before the ratio)
- At 0.3 ratio, reaching character level 99 requires roughly 3-4 skills maxed to 99
- Future expandable: daily quests, achievements, etc. can also grant character XP

### Attributes (6 total, 1 point per level-up)

| Attribute | Effect |
|-----------|--------|
| Vitality | Max HP, HP regen rate |
| Strength | Melee damage scaling |
| Dexterity | Ranged damage, accuracy |
| Intelligence | Magic power scaling |
| Luck | Crit chance, drop rates, crafting crit chance |
| Evasion | Dodge chance |

- Defence and Magic Defence are **not** attributes — they come entirely from equipped armour
- Exact scaling ratios (e.g. +X damage per Strength point) are tuning values in `gameConstants.ts`

### Data Model

- Player model gains: `characterXp`, `characterLevel`, `attributePoints` (unspent)
- New field for allocated attributes: `{ vitality, strength, dexterity, intelligence, luck, evasion }`
- Constant: `CHARACTER_XP_RATIO = 0.3`

## Revised Skill System (14 skills)

### Removed as skills → now attributes
- ~~Defence~~ → armour from gear
- ~~Vitality~~ → character attribute
- ~~Evasion~~ → character attribute

### Weapon Proficiencies (trained by combat, hard daily XP cap)

| Skill | Purpose |
|-------|---------|
| Melee | Melee weapon requirements, damage scaling (with Strength) |
| Ranged | Bow/crossbow requirements, damage scaling (with Dexterity) |
| Magic | Staff/wand requirements, spell scaling (with Intelligence) |

### Gathering Skills (trained by gathering, diminishing returns)

| Skill | Resources |
|-------|-----------|
| Mining | Ore, gems, stone |
| Foraging | Herbs, flowers, roots |
| Woodcutting | Logs, bark, sap |

### Processing Skills (trained by processing, diminishing returns)

| Skill | Converts |
|-------|----------|
| Refining | Ore → ingots, logs → planks, gems → cut gems |
| Tanning | Hides/pelts → leather |
| Weaving | Silk/fibers → cloth/thread |

### Crafting Skills (trained by crafting, diminishing returns)

| Skill | Creates | Armour Weight |
|-------|---------|---------------|
| Weaponsmithing | Swords, axes, maces | — |
| Armorsmithing | Plate armour, shields | Heavy |
| Leatherworking | Leather armour, bags | Medium |
| Tailoring | Cloth/silk armour, capes | Light |
| Alchemy | Potions, consumables | — |

### Skill Categories (for constants)

```
combat: ['melee', 'ranged', 'magic']
gathering: ['mining', 'foraging', 'woodcutting']
processing: ['refining', 'tanning', 'weaving']
crafting: ['weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy']
```

### Future Additions
- Bowcraft (bows, crossbows, arrows)
- Jewelcrafting (rings, amulets, charms)
- Enchanting (staves, wands, imbuing)

## Armour Weight Classes

### Heavy Armour (Armorsmithing)

- **Materials:** Ingots (from Refining ore)
- **Stat identity:** High physical defence (armor), low magic defence, health bonus
- **Penalty:** Evasion penalty — plate is bulky, harder to dodge in
- **Best for:** Tank builds, fighting physical mobs/melee players

### Medium Armour (Leatherworking)

- **Materials:** Leather (from Tanning hides)
- **Stat identity:** Balanced physical and magic defence
- **Advantage:** Highest total stat budget — more total stat points per tier than heavy or light
- **No penalties**
- **Best for:** Generalist builds, PvE convenience, hybrid playstyles

### Light Armour (Tailoring)

- **Materials:** Cloth (from Weaving silk/fibers)
- **Stat identity:** High magic defence, low physical defence
- **Advantage:** High dodge bonus — light and nimble
- **Best for:** Mage builds, fighting casters, evasion builds

### Mixing

- Players freely equip any weight class in any armour slot
- No set bonuses, no restrictions
- Total stats are the sum of individual pieces
- Going full leather maximises raw stat efficiency; specialising in heavy or light trades total stats for extreme strength in one defence type

### Data Model

- ItemTemplate gains: `weightClass: 'heavy' | 'medium' | 'light' | null` (null for non-armour)
- ItemStats gains: `magicDefence` field
- Existing `armor` field becomes specifically physical defence

## Material Supply Chains

```
HEAVY ARMOUR CHAIN:
  Mining → Ore → Refining → Ingots → Armorsmithing → Plate armour

MEDIUM ARMOUR CHAIN:
  Combat (mob drops) → Hides/Pelts → Tanning → Leather → Leatherworking → Leather armour

LIGHT ARMOUR CHAIN:
  Combat (mob drops) → Silk/Fibers → Weaving → Cloth → Tailoring → Cloth armour

WEAPON CHAINS:
  Refining → Ingots → Weaponsmithing → Metal weapons
  Refining → Planks → Used in weapon/shield recipes as a material

CONSUMABLES:
  Foraging → Herbs → Alchemy → Potions
```

### Cross-Skill Material Sharing

Processing skills are separate from crafting because processed materials are shared:
- Ingots feed both Weaponsmithing and Armorsmithing
- Planks are a material in weapon, shield, and future Bowcraft recipes
- Leather can appear in weapon grip or bag recipes
- Cloth can appear in alchemy recipes (bandages, herb pouches)

### Existing Resources That Slot In

| Raw Material | Source | Processing | Output |
|-------------|--------|------------|--------|
| Copper Ore, Iron Ore | Mining | Refining | Copper Ingots, Iron Ingots |
| Oak Log, Maple Log | Woodcutting | Refining | Oak Planks, Maple Planks |
| Wolf Pelt, Bear Hide | Mob drops | Tanning | Wolf Leather, Bear Leather |
| Spider Silk | Mob drops | Weaving | Silk Cloth |
| Forest Sage, Moonpetal | Foraging | None (direct) | Used in Alchemy |

## Migration

No migration needed — clean DB wipe is acceptable. Update schema, seed data, and reseed.

### Seed Data Changes

- Spider Silk Robe: move from weaponsmithing → tailoring, add `weightClass: 'light'`
- Bear Hide Vest: move from weaponsmithing → leatherworking, add `weightClass: 'medium'`
- Leather Cap: add `weightClass: 'medium'`
- Add magicDefence values to armour templates based on weight class
- Add processing recipes (ore → ingots, hides → leather, silk → cloth, logs → planks)
- Add new armour crafting recipes under correct skills

## Future Hooks

- **Mana & Stamina:** Combat resource system for spell/attack costs (separate future design)
- **Class Specialization:** Different base stat growth per class, affecting attribute scaling
- **Mixed Damage Skills:** Melee skills dealing magic damage, spells with physical component (PvP balance)
- **Set Bonuses:** Weight class matching bonuses if desired later (weightClass tag enables this)
- **Additional Crafting Skills:** Bowcraft, Jewelcrafting, Enchanting
