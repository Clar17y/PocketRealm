# Expedition Themed Encounters Design

## Problem

Guild expeditions select mobs purely by level range with no thematic filtering. A "Forest Depths" expedition can spawn Crystal Golems, Harpies, and Dwellers together. Mobs use generic action templates (trash = auto-attack x2, elite = auto-attack + earthquake) with no mechanical variety. Difficulty is too low — wild mob stats are designed for solo encounters, not group content.

## Solution

Replace the generic mob pool with a themed encounter system. Each expedition tier has multiple encounter themes, each with purpose-built mobs, custom action rotations, lethal mechanics, and a damage type profile that rewards gear/skill adaptation.

## Encounter Theme System

### Selection
When an expedition launches, the system picks a random theme from the tier's pool. The theme determines all mob spawns, the expedition display name, and the final boss.

### Data Model

```typescript
interface ExpeditionTheme {
  id: string;                    // 'spider_nest'
  name: string;                  // 'Spider Nest'
  tier: number;                  // 1
  mobFamilyIds: string[];        // MobFamily links for wild encounter crossover
  trash: string[];               // MobTemplate IDs (expedition-flagged)
  elites: string[];              // MobTemplate IDs
  miniBoss: { id: string; adds: string[]; casterAdd: string };
  finalBoss: { id: string; adds: string[]; casterAdd: string; phaseTemplates: ... };
}
```

### Schema Changes
- `GuildExpedition`: add `themeId: String` to persist chosen theme
- `MobTemplate`: add `isExpeditionMob: Boolean` flag — these mobs are authored for group content and don't appear in regular exploration (but can appear as rare spawns in wild encounter sites via MobFamily)

### MobFamily Link
Expedition themes map to MobFamilies. New expedition mobs are added to existing families (Spiders, Wolves, Bandits, Treants). The family link enables optional rare wild spawns in encounter sites.

## Tier 1 Themes

Four themes for Tier 1 (forest-themed, level 10-16 players).

### Damage Type Profiles

| Theme | Auto-attacks | Specials | Net Profile | Gear Strategy |
|---|---|---|---|---|
| Spider Nest | Physical | Venom DoTs = magic | Mixed, magic-heavy over time | Magic defence + Ward |
| Wolf Pack | Physical | Bleeds/rends = physical | Heavy physical | Defence + Counter |
| Bandit Camp | Physical | Shaman hexes = magic | True mixed | Both defences needed |
| Corrupted Grove | Magic | Blight/rot = magic | Heavy magic | Magic defence + Ward |

### HP Targets

| Role | HP | Target Rounds to Kill | Notes |
|---|---|---|---|
| Trash | 100-170 | 3-5 | Dies to focused fire |
| Elite | 280-400 | 6-10 | Requires some coordination |
| Mini-boss | 600-700 | 8-12 | ~16-24 min room |
| Final Boss | 1200-1400 | 15-20 | ~30-40 min room |
| Regular Add | 80-120 | 2-3 | Kill quickly |
| Caster Add | 60-80 | 1-2 | Glass cannon, top priority |

All stats hand-tuned for 3-5 player parties. No multipliers on existing wild mobs.

### Theme 1: Spider Nest (Spiders family)

| Role | Mob | HP | Dmg | Type | Abilities |
|---|---|---|---|---|---|
| Trash | Cavern Spider | 150 | 8-14 | Phys | Bite, Poison Bite (DoT) |
| Trash | Webweaver | 120 | 6-12 | Phys | Attack, Web Shot (root 1 turn) |
| Elite | Broodguard | 350 | 12-20 | Phys | Attack, Venom Spray (AoE DoT), Cocoon (root + damage) |
| Elite | Silk Stalker | 280 | 14-22 | Phys | Attack, Ambush (high single), Web Trap (AoE root) |
| Mini-boss | Spider Matriarch | 650 | 16-26 | Phys | Attack, Poison Spray (AoE), Summon Adds, Frenzy |
| Add | Spiderling | 100 | 6-10 | Phys | Attack, Poison Bite |
| Caster Add | Venomous Spitter | 70 | 4-8 | Magic | Attack, Venom Cloud (AoE stacking DoT) |
| Final Boss | The Broodqueen | 1300 | 20-35 | Phys | 3 phases |

**Broodqueen Phases:**
- P1 (100-50%): Poison Spray (AoE DoT), Attack, Wither (debuff -def), Attack, Summon Adds, Attack
- P2 (50-25%): Attack, Mark for Death, Impale (single lethal, no telegraph), Poison Spray, Summon Adds, Cocoon Burst (telegraphed AoE)
- P3 (<25%): Frenzy, Impale, Poison Spray, Death Throes (telegraphed wipe AoE), Impale, Summon Adds

### Theme 2: Wolf Pack (Wolves family)

| Role | Mob | HP | Dmg | Type | Abilities |
|---|---|---|---|---|---|
| Trash | Timber Wolf | 160 | 10-16 | Phys | Bite, Lunge (bonus damage) |
| Trash | Snarler | 130 | 8-14 | Phys | Attack, Howl (debuff -accuracy) |
| Elite | Dire Wolf | 380 | 14-24 | Phys | Attack, Rend (bleed DoT), Pack Howl (buff all wolves) |
| Elite | Shadow Wolf | 300 | 12-20 | Phys | Attack, Fear Howl (AoE forced defend), Shadow Bite |
| Mini-boss | Pack Alpha | 680 | 18-28 | Phys | Attack, Rally Howl (buff), Savage Rend (single lethal), Summon Wolves |
| Add | Frenzied Wolf | 100 | 8-14 | Phys | Attack, Lunge |
| Caster Add | Howling Spirit | 65 | 4-8 | Magic | Attack, Shadow Bleed (AoE stacking DoT, magic) |
| Final Boss | Fenris, the Ancient | 1400 | 22-38 | Phys | 3 phases |

**Fenris Phases:**
- P1 (100-50%): Rally Howl (buff adds), Attack, Rend (bleed), Attack, Summon Wolves, Attack
- P2 (50-25%): Mark for Death, Attack, Execution Bite (lethal to marked), Fear Howl (AoE forced defend), Summon Wolves, Rend
- P3 (<25%): Frenzy, Execution Bite, Fear Howl, Terrifying Howl (telegraphed wipe AoE), Execution Bite, Rend

### Theme 3: Bandit Camp (Bandits family)

| Role | Mob | HP | Dmg | Type | Abilities |
|---|---|---|---|---|---|
| Trash | Bandit Thug | 170 | 10-16 | Phys | Attack, Shield Bash (stun 1 turn) |
| Trash | Bandit Archer | 130 | 12-18 | Phys | Attack, Aimed Shot (high accuracy) |
| Elite | Bandit Assassin | 320 | 16-26 | Phys | Attack, Backstab (single lethal), Smoke Bomb (AoE -accuracy) |
| Elite | Bandit Shaman | 280 | 10-18 | Magic | Attack, Hex (debuff), Dark Bolt, Heal Allies |
| Mini-boss | War Chief | 640 | 18-30 | Phys | Attack, Battle Cry (buff all), Devastating Blow (single lethal), Summon Thugs |
| Add | Bandit Grunt | 90 | 8-12 | Phys | Attack, Attack |
| Caster Add | Knife Thrower | 70 | 6-10 | Phys | Attack, Throwing Knives (AoE stacking DoT, physical) |
| Final Boss | The Bandit King | 1300 | 20-36 | Phys | 3 phases |

**Bandit King Phases:**
- P1 (100-50%): Battle Cry (buff), Attack, Smoke Bomb (AoE -accuracy), Attack, Summon Adds, Shield Bash
- P2 (50-25%): Mark for Execution (debuff), Attack, Execute (lethal to marked), Summon Adds, Shield Wall (self-buff), Intimidate (telegraphed AoE -attack)
- P3 (<25%): Frenzy, Execute, Summon Adds, Desperate Fury (telegraphed wipe AoE), Execute, Shield Bash

### Theme 4: Corrupted Grove (Treants family)

| Role | Mob | HP | Dmg | Type | Abilities |
|---|---|---|---|---|---|
| Trash | Blighted Sapling | 140 | 8-14 | Phys | Attack, Thorn Shot (ranged) |
| Trash | Fungal Spore | 100 | 6-12 | Magic | Attack, Poison Cloud (AoE DoT) |
| Elite | Corrupted Treant | 400 | 14-22 | Phys | Attack, Root Slam (AoE), Bark Shield (self-buff), Regenerate |
| Elite | Blighted Dryad | 300 | 12-20 | Magic | Attack, Wither (AoE -def), Nature's Curse (combo debuff), Heal |
| Mini-boss | Grove Warden | 700 | 18-28 | Phys | Ground Slam (telegraphed AoE), Root Prison (root), Regenerate, Summon Saplings |
| Add | Thorn Vine | 80 | 6-10 | Phys | Attack, Constrict (root) |
| Caster Add | Blighted Spore | 60 | 4-8 | Magic | Attack, Blight Cloud (AoE stacking DoT, magic) |
| Final Boss | The Rot Heart | 1400 | 18-32 | Magic | 3 phases |

**Rot Heart Phases:**
- P1 (100-50%): Wither (AoE -def), Thorn Barrage, Nature's Curse (debuff), Attack, Summon Saplings, Regenerate
- P2 (50-25%): Blight Wave (telegraphed AoE), Nature's Curse, Attack, Rot Burst (lethal to cursed), Summon Corrupted Treant, Regenerate
- P3 (<25%): Frenzy, Rot Burst, Blight Wave, Death Bloom (telegraphed wipe AoE), Regenerate, Nature's Curse

## New Boss Actions

### Damage (single-target)
- `boss_impale` — 4x physical, single target, no telegraph. Tank must hold aggro + Counter.
- `boss_execution_strike` — 5x physical, single target, no telegraph. Lethal to debuffed (marked) targets.

### Damage (AoE)
- `boss_poison_spray` — 1x magic AoE + stacking poison DoT (ticks for encounter duration). Not telegraphed.
- `boss_blight_wave` — 2x magic AoE. Telegraphed.
- `boss_death_bloom` — 3x magic AoE. Telegraphed. Wipe-level.
- `boss_desperate_fury` — 3x physical AoE. Telegraphed. Wipe-level.
- `boss_cocoon_burst` — 2x physical AoE. Telegraphed.
- `boss_terrifying_howl_aoe` — 2.5x physical AoE. Telegraphed. Wipe-level.

### Debuffs
- `boss_mark_for_death` — Marks highest-threat target. Marked takes 3x from execution_strike. 2 rounds. No telegraph.
- `boss_wither` — AoE -defence 3 rounds.
- `boss_smoke_bomb` — AoE -accuracy 2 rounds.
- `boss_nature_curse` — Single target. Cursed takes 3x from magic attacks. 2 rounds.
- `boss_root` — Single target, forces Defend next round (skip action).
- `boss_fear_howl` — AoE, all players forced Defend next round.

### Buffs
- `boss_frenzy` — Self +50% attack 3 rounds. In P3 makes subsequent attacks lethal.
- `boss_bark_shield` — Self +30% defence 3 rounds.
- `boss_rally` — All alive mobs +20% attack 3 rounds.
- `boss_shield_wall` — Self +40% defence 2 rounds.

### Summon
- `boss_summon_adds` — Spawns 2-3 mobs from theme's add pool (mix of regular + caster adds).

### Healing
- `boss_regenerate` — Heals 8% max HP.

## Stacking DoT Mechanic

Caster adds (not bosses) apply stacking DoTs to the whole party. Creates soft enrage and target priority.

- Each application = +1 stack on all players
- Each stack = N damage per round (e.g. 5 damage/stack/round)
- Duration: permanent within room, clears on rest phase between rooms
- Stacks are per-player
- Different themes use different flavours and damage types:
  - Venom (magic) — Spider Nest
  - Shadow Bleed (magic) — Wolf Pack
  - Bleed (physical) — Bandit Camp
  - Blight (magic) — Corrupted Grove
- Caster adds are glass cannons (60-80 HP) — easy to kill if focused, devastating if ignored
- Boss summon abilities spawn a mix of regular and caster adds

This creates a priority mini-game: boss summons adds, one is a caster, party must decide whether to focus caster or keep DPSing boss.

## Telegraph Philosophy

- **Single-target lethal** (Impale, Execution Strike): NO telegraph. Learn the boss pattern.
- **AoE wipe mechanics** (Death Bloom, Desperate Fury, Terrifying Howl): Telegraphed in Tier 1 and 2.
- **Tier 3:** Fewer or no telegraphs. Players must know the fights.
- **Regular AoE** (Poison Spray, Rend): Not telegraphed — manageable damage, not lethal.

## Boss Phase Philosophy

- **P1 (100-50%):** Debuffs, buffs, DoTs, summon adds. Manageable damage. Players learn the rhythm.
- **P2 (50-25%):** Combos activate (Mark → Execute). Telegraphed AoEs appear. Adds keep spawning.
- **P3 (<25%):** Frenzy + lethal single-targets every other round. Wipe mechanic on short cycle. Damage race.

## Mark → Execute Combo Pattern

1. Boss uses `boss_mark_for_death` on highest-threat target (no telegraph)
2. Next round: `boss_execution_strike` — lethal if mark is still active
3. Counterplay: Ward the mark application, Counter the execution strike, or cleanse (future feature)

## Implementation Scope

### New MobTemplate Rows (per theme: 8 mobs)
- 2 trash variants
- 2 elite variants
- 1 mini-boss
- 1 regular add + 1 caster add
- 1 final boss
- **Total: 32 new mob templates across 4 themes**

### New Boss Action Definitions (~18 actions)
Added to `BOSS_ACTION_DEFINITIONS` in `bossTemplateDefinitions.ts`.

### Schema Changes
- `MobTemplate`: add `isExpeditionMob Boolean @default(false)`
- `GuildExpedition`: add `themeId String?`

### Constants Changes
- New `EXPEDITION_THEMES` in `expeditionDefinitions.ts`
- New boss action entries in `bossTemplateDefinitions.ts`

### Code Changes
- `expeditionService.ts`: Replace level-range mob query with theme-based mob selection
- `roomGenerator.ts`: Use theme roster instead of random pool
- `raidRoundResolver.ts`: Support new mechanics (stacking DoT, root/fear forced defend, mark debuff, summon adds spawning new mobs mid-fight)
- Seed migration: Insert 32 new MobTemplate rows + link to MobFamilies
