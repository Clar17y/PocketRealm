# Screen-Specific Backgrounds Design

## Goal

Expand zone art backgrounds to include screen-specific pixel art for Arena, Forge, Guild, Inventory, and per-crafting-skill screens. Home/Dashboard also gets zone art.

## Decisions

- **Priority:** Screen-specific art > zone art > no background
- **Opacity/transition:** Same as zone backgrounds (15%, 500ms crossfade)
- **Art style:** Portrait-oriented pixel art (768x1024 or 1024x1536), tall composition
- **Per-crafting-skill:** Each of the 9 crafting skills gets its own background

## Background Mapping

| Screen | Background | Type |
|--------|-----------|------|
| Home/Dashboard | Current zone art | Zone |
| Explore | Current zone art | Zone |
| Combat | Current zone art | Zone |
| Gathering | Current zone art | Zone |
| Rest | Current zone art | Zone |
| Arena | Gladiator arena | Screen |
| Forge | Dwarven furnace/smithy | Screen |
| Guild | Adventurer's guild hall | Screen |
| Inventory | Adventurer's camp | Screen |
| Crafting (per skill) | Skill-specific workshop | Screen |
| Equipment, Skills, Bestiary, Zones, etc. | No background | — |

## Code Changes

1. `ZoneBackground` — remove hardcoded `CONTEXT_SCREENS`, show background whenever any `imageSrc` is provided
2. `AppShell` — replace `zoneImageSrc` + `activeScreen` with single `backgroundSrc` prop
3. `page.tsx` — compute the right image based on screen + crafting skill, falling back to zone art
4. `assets.ts` — new `screenBackgroundSrc(screen, craftingSkill?)` helper
5. Images at `public/assets/screens/screen_<name>.png`

## Art Generation Prompts (Portrait)

```
Arena:          pixel art scene of a grand stone gladiator arena with sand floor and tiered seating rising upward, fantasy RPG environment, atmospheric, tall composition, portrait orientation, torchlight and golden hour, intense and competitive

Forge:          pixel art scene of a dwarven forge workshop with massive furnaces and chimney rising upward and glowing molten metal, fantasy RPG environment, atmospheric, tall composition, portrait orientation, orange firelight, industrious and warm

Guild:          pixel art scene of a cozy adventurer's guild hall with tall wooden beams and trophy wall, fantasy RPG environment, atmospheric, tall composition, portrait orientation, warm candlelight, welcoming and communal

Inventory:      pixel art scene of an adventurer's campsite with gear laid out by a crackling fire under tall trees, fantasy RPG environment, atmospheric, tall composition, portrait orientation, twilight, peaceful and organized

Weaponsmithing: pixel art scene of a medieval blacksmith workshop with anvils and swords hanging from tall walls, fantasy RPG environment, atmospheric, tall composition, portrait orientation, orange forge light, focused and hot

Armorsmithing:  pixel art scene of an armorer's forge with plate armor on stands and tall shield racks, fantasy RPG environment, atmospheric, tall composition, portrait orientation, warm firelight, sturdy and methodical

Leatherworking: pixel art scene of a rustic tanner's workshop with hides stretched on tall wooden frames, fantasy RPG environment, atmospheric, tall composition, portrait orientation, afternoon light, earthy and craftsman

Tailoring:      pixel art scene of an elegant weaver's workshop with tall looms and colorful hanging fabrics, fantasy RPG environment, atmospheric, tall composition, portrait orientation, soft natural light, delicate and artistic

Alchemy:        pixel art scene of a mystical alchemist's laboratory with tall shelves of potions and bubbling cauldrons, fantasy RPG environment, atmospheric, tall composition, portrait orientation, eerie green and purple glow, mysterious and arcane

Refining:       pixel art scene of a stone smelting room with tall ore crucibles and molten metal flowing downward, fantasy RPG environment, atmospheric, tall composition, portrait orientation, intense orange glow, industrial and raw

Tanning:        pixel art scene of an open-air tanning yard with tall drying racks and leather vats, fantasy RPG environment, atmospheric, tall composition, portrait orientation, warm midday sun, rustic and practical

Weaving:        pixel art scene of a medieval textile mill with tall spinning wheels and hanging yarn, fantasy RPG environment, atmospheric, tall composition, portrait orientation, gentle morning light, rhythmic and calm

Jewelcrafting:  pixel art scene of a gem cutter's workshop with tall shelves of crystals and sparkling workbenches, fantasy RPG environment, atmospheric, tall composition, portrait orientation, prismatic light, precise and elegant
```

Resolution: 768x1024 or 1024x1536 (portrait). `object-fit: cover` handles ratio mismatches.
