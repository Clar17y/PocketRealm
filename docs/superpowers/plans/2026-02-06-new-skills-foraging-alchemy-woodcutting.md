# Plan: Add Foraging, Alchemy, and Woodcutting Skills

## Summary

Add 3 new skills (foraging, alchemy, woodcutting), 8 new item templates, 4 resource nodes, and 4 crafting recipes. The existing architecture is highly generic — minimal code changes needed, mostly extending type definitions, fixing 2 hardcoded 'mining' references, and adding sub-tab UI.

## New Content

### Skills
| Skill | Category | XP Cap | Notes |
|-------|----------|--------|-------|
| Foraging | Gathering | 30,000/day | Discover herb patches via exploration, harvest them |
| Woodcutting | Gathering | 30,000/day | Discover tree groves via exploration, harvest them |
| Alchemy | Crafting | 30,000/day | Craft potions from herbs using recipe system |

### Item Templates (8 new)
| Name | Type | Tier | Stats | Required | Stackable |
|------|------|------|-------|----------|-----------|
| Forest Sage | resource | 1 | — | — | yes |
| Moonpetal | resource | 2 | — | — | yes |
| Oak Log | resource | 1 | — | — | yes |
| Maple Log | resource | 2 | — | — | yes |
| Minor Health Potion | consumable | 1 | — | — | yes |
| Health Potion | consumable | 2 | — | — | yes |
| Oak Shortbow | weapon | 1 | rangedPower: 6 | ranged lv1 | no (80 durability) |
| Oak Staff | weapon | 1 | magicPower: 6 | magic lv1 | no (80 durability) |

### Resource Nodes (4 new)
| Node | Zone | Skill | Level | Discovery | Capacity |
|------|------|-------|-------|-----------|----------|
| Forest Sage | Forest Edge | foraging | 1 | 25% | 15-80 |
| Moonpetal | Deep Forest | foraging | 10 | 15% | 30-150 |
| Oak Log | Forest Edge | woodcutting | 1 | 25% | 15-80 |
| Maple Log | Deep Forest | woodcutting | 10 | 15% | 30-150 |

### Recipes (4 new)
| Recipe | Skill | Level | Materials | Result | XP |
|--------|-------|-------|-----------|--------|-----|
| Minor Health Potion | alchemy | 1 | 3x Forest Sage | Minor Health Potion | 20 |
| Health Potion | alchemy | 10 | 5x Moonpetal | Health Potion | 50 |
| Oak Shortbow | weaponsmithing | 5 | 8x Oak Log + 3x Copper Ore | Oak Shortbow | 35 |
| Oak Staff | weaponsmithing | 5 | 10x Oak Log | Oak Staff | 35 |

## Implementation Steps

### Step 1: Shared Types
**`packages/shared/src/types/player.types.ts`**
- Add `'foraging' | 'woodcutting' | 'alchemy'` to `SkillType` union
- Add foraging, woodcutting to `GATHERING_SKILLS` array
- Add alchemy to `CRAFTING_SKILLS` array

### Step 2: Fix API Gathering Route (bug)
**`apps/api/src/routes/gathering.ts`**
- Line 264: Change `grantSkillXp(playerId, 'mining', rawXp)` → `grantSkillXp(playerId, skillRequired, rawXp)`
- Line 269: Change `activityType: 'mining'` → `activityType: skillRequired`

### Step 3: Fix API Crafting Route Guard
**`apps/api/src/routes/crafting.ts`**
- Lines 16-27: Replace hardcoded `isSkillType()` with one that uses the imported category arrays (`COMBAT_SKILLS`, `GATHERING_SKILLS`, `CRAFTING_SKILLS`)

### Step 4: Auth Registration
**`apps/api/src/routes/auth.ts`**
- Lines 27-30: Add foraging, woodcutting, alchemy to `ALL_SKILLS` array

### Step 5: Database Migration (existing players)
**New migration file**
- `INSERT INTO player_skills` for all existing players who don't have the 3 new skills
- Schema itself doesn't change (skillType is VARCHAR(32), not an enum)

### Step 6: Seed Data
**`packages/database/prisma/seed.ts`**
- Add 8 item templates, 4 resource nodes, 4 recipes (following existing upsert pattern)

### Step 7: Frontend — SKILL_META
**`apps/web/src/app/game/page.tsx`**
- Import `Leaf`, `FlaskConical`, `Axe` from lucide-react
- Add entries to `SKILL_META`: foraging (Leaf, green), woodcutting (Axe, grey), alchemy (FlaskConical, purple)

### Step 8: Frontend — Skill Sub-tabs
**`apps/web/src/app/game/page.tsx`** + **`useGameController.ts`**
- Add `activeGatheringSkill` / `activeCraftingSkill` state to controller
- Gathering screen: Add mining/foraging/woodcutting tab row, filter nodes by `skillRequired`
- Crafting screen: Add weaponsmithing/alchemy tab row, filter recipes by `skillType`
- Fix hardcoded "Mining"/"Mined" log messages in handleMine → generic "Gathered"

### Step 9: Gathering Component Text Fix
**`apps/web/src/components/screens/Gathering.tsx`**
- Change "(travel here to mine)" → "(travel here to gather)"

### Step 10: Build & Verify
```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/game-engine
npx prisma migrate dev --create-only --name add_new_skills  # then add SQL
npx prisma migrate dev
npx prisma db seed
npm run typecheck
npm run test:engine
```

## Out of Scope
- Potion consumption route (follow-up task)
- Asset images for new items/skills
- `skillRequired` API filter for gathering nodes endpoint
