# Vex Boss Rewards Design

**Date:** 2026-06-22
**Branch:** `codex/vex-boss-rewards-design`
**Status:** Draft

## Problem

Gold has few meaningful uses, and world boss rewards do not yet create enough
reason to organize around boss kills. The current boss trophy lane exists but is
too thin:

- Alpha Wolf drops `Alpha Wolf Fang`, used for `Wolfsbane Blade` and
  `Alpha Pelt Chest`.
- Ancient Spirit drops `Spirit Essence`, used for `Spirit Staff` and
  `Ethereal Robes`.
- `Wolfsbane Blade` and especially `Spirit Staff` are weak compared with nearby
  craftable gear.
- The starter `Wayfinder Buckler` gives valuable accuracy, but it has no real
  accuracy off-hand successor and becomes a repair annoyance as durability
  decays.
- There is no way to restore or improve an item's max durability after repeated
  repairs reduce it.

Issue #232 introduces Vex as a wandering merchant who appears in wild zones and
trades unusual goods. Vex is the right place to turn boss trophies plus gold
into permanent, limited upgrades without making boss drops a direct power skip.

## Goals

- Make boss-crafted gear feel strong enough to justify world boss participation.
- Add Vex exchanges that spend boss trophies and gold.
- Add permanent, one-time item augmentation through Vex.
- Add max durability restoration/reinforcement as a general equipment service.
- Add an accuracy off-hand progression path that starts from boss participation.
- Keep low-level players from buying or being carried directly into endgame
  power.
- Encourage high-level players to help with lower-tier bosses by making the
  higher off-hand upgrade depend on the lower off-hand.

## Approaches Considered

### 1. Gold-only Vex shop

Vex could sell rare items for gold only. This would create a gold sink, but it
would not solve boss rewards and would allow rich players to bypass the intended
boss loop.

### 2. More boss crafting recipes only

Boss trophies could feed more recipes. This keeps crafting central, but it does
not use Vex, does not help gold, and does not solve max durability.

### 3. Trophy + gold Vex exchanges

Vex exchanges boss trophies and gold for permanent services, boss-only stones,
and a chained off-hand line. This is the chosen approach because it creates
a boss-drop sink, a gold sink, and a strong merchant identity without replacing
crafting.

## Current Boss Gear Buffs

The four existing boss-crafted items will be buffed in seed data so they are
valuable before Vex augmentation. They will sit around late-tier or early next
tier strength, because they require boss trophies, recipe access, crafting
skill, turns, and supporting materials.

| Item | Current | Target |
| --- | --- | --- |
| `Wolfsbane Blade` | Level 8 melee, `attack 8`, `critChance 0.02` | `attack 13`, `accuracy 4`, `critChance 0.03`, max durability 110 |
| `Alpha Pelt Chest` | Level 8 medium chest, `armor 6`, `health 5`, `dodge 2` | `armor 7`, `health 8`, `dodge 3`, max durability 120 |
| `Spirit Staff` | Level 16 magic, `magicPower 10`, `critChance 0.03` | `magicPower 24`, `accuracy 4`, `critChance 0.04`, max durability 130 |
| `Ethereal Robes` | Level 16 light chest, `magicDefence 8`, `health 6`, `dodge 3` | `magicDefence 12`, `health 12`, `dodge 4`, `magicPower 3`, max durability 140 |

These numbers are initial balance targets. The important rule is that boss gear
must not be a sidegrade below same-level advanced gear.

## Vex Off-Hand Line

Add a boss-trophy off-hand path through Vex. It is inspired by the starter
`Wayfinder Buckler`, but it does not require the original item, because players
may have sold or lost it before learning the future upgrade path.

### Wayfarer Aegis

- Source: Vex exchange.
- Requirements: `Alpha Wolf Fang` + gold.
- Equip gate: character level 8.
- Slot/type: `off_hand` armor.
- Target stats: `accuracy 10`, `armor 4`, `health 8`.
- Max durability: 100.
- Soulbound: true.

### Spiritbound Aegis

- Source: Vex upgrade exchange.
- Requirements: existing `Wayfarer Aegis` + `Spirit Essence` + gold.
- Equip gate: character level 16.
- Slot/type: `off_hand` armor.
- Target stats: `accuracy 14`, `magicDefence 8`, `armor 5`, `health 12`.
- Max durability: 140.
- Soulbound: true.

The `Spiritbound Aegis` exchange transforms the existing `Wayfarer Aegis`
inside a transaction rather than creating an unrelated second item. This makes
the line feel like a real upgrade chain and requires higher-level players to
keep caring about Alpha Wolf kills.

## Vex Permanent Services

Vex exchanges are not normal quest-shop purchases. They spend player gold,
consume required item materials, and optionally mutate a target item.

### Max Durability Reinforcement

`Vex Temper` is a permanent one-time service for weapons and armor.

Behavior:

1. Validate the target item belongs to the player and is weapon/armor.
2. Validate the item has not already received `durability_reinforcement`.
3. Compute the template max durability.
4. Set the item's max durability to at least template max plus a reinforcement
   bonus.
5. Set current durability to the new max.
6. Record the augmentation so it cannot be repeated.

Durability bonus:

- `+20%` of template max durability, rounded up.
- If the item has decayed below template max, this both restores and reinforces
  it.

Cost model:

- Gold scales by item tier.
- Tier 1-3 reinforcement can use `Alpha Wolf Fang` as the trophy component.
- Tier 4-5 reinforcement can use `Spirit Essence` as the trophy component.

This makes max durability repair broadly useful without turning it into a
free maintenance button.

### Boss Stones

Boss stones are permanent one-time Vex services that apply only to boss-crafted
items. They add bonus stats to the target item's `bonusStats` and record a
`boss_stone` augmentation.

Initial stones:

| Stone | Trophy | Eligible target examples | Effect direction |
| --- | --- | --- | --- |
| Fangstone | `Alpha Wolf Fang` | `Wolfsbane Blade`, `Alpha Pelt Chest` | Physical pressure, accuracy, health, armor |
| Spiritstone | `Spirit Essence` | `Spirit Staff`, `Ethereal Robes` | Magic power, magic defence, accuracy, health |

This design excludes the Aegis line from boss stones. It already has its own
chained Vex progression, which avoids awkward questions about whether a stone
would carry forward during the `Wayfarer Aegis` to `Spiritbound Aegis` upgrade.

## Data Model

Add an `ItemAugment` model to track permanent one-time effects:

```prisma
model ItemAugment {
  id          String   @id @default(uuid())
  itemId      String   @map("item_id")
  augmentType String   @map("augment_type") @db.VarChar(64)
  sourceKey   String   @map("source_key") @db.VarChar(64)
  metadata    Json?
  appliedAt   DateTime @default(now()) @map("applied_at")

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([itemId, augmentType])
  @@index([sourceKey])
  @@map("item_augments")
}
```

Use these initial `augmentType` values:

- `durability_reinforcement`
- `boss_stone`

This model keeps once-per-item enforcement race-safe with a unique constraint and
avoids adding narrow boolean fields to `Item`.

## Exchange Definitions

Define Vex exchanges as typed server-side definitions rather than fitting them
into `ShopItem`, because `ShopItem` is quest-token based and applies player-wide
buffs.

Definition shape:

```ts
interface VexExchangeDefinition {
  key: string;
  name: string;
  description: string;
  goldCost: number;
  requiredItems: Array<{ itemTemplateName: string; quantity: number }>;
  targetRule?: VexTargetRule;
  effect: VexExchangeEffect;
  sortOrder: number;
}
```

The service exposes:

- `listVexExchanges(playerId, context)` for the UI.
- `purchaseVexExchange(playerId, exchangeKey, params)` for transactions.

The initial implementation does not require the full timed-spawn system from
issue #232. When that work lands, `context` will include the active Vex
encounter/zone.

## Transaction Rules

Every exchange must run in a Prisma transaction:

1. Lock or re-read the player gold balance and target item.
2. Validate ownership, item type, target template, level gate, and augment
   uniqueness.
3. Validate material quantities.
4. Decrement gold atomically.
5. Consume required materials.
6. Create, update, or transform the target item.
7. Insert `ItemAugment` rows where applicable.
8. Return state updates for gold, inventory, and equipment.

If the target item is equipped, the operation may still be allowed, but the
equipment cache must be invalidated and the response must include updated
equipment state. This is important for max durability and stat stones.

## UI

Vex presents exchanges as a barter/service list rather than a general
store:

- Show required trophies and gold.
- Show target item selector only for exchanges that mutate an item.
- Show clear once-per-item labels such as "Already tempered" or
  "Boss stone applied".
- Show before/after stats for item mutations.
- Show equip level requirements for newly created or transformed items.

When Vex is later tied to the wandering merchant encounter, this same UI can be
shown only while Vex is available.

## Testing

Unit tests cover:

- Existing boss item templates have the new stronger base stats.
- `Wayfarer Aegis` and `Spiritbound Aegis` item templates exist with correct
  stats, slot, soulbound behavior, and level gates.
- `Spiritbound Aegis` requires and transforms an existing `Wayfarer Aegis`.
- `Vex Temper` restores decayed max durability and adds the reinforcement bonus.
- `Vex Temper` cannot be applied twice to the same item.
- Boss stones only apply to eligible boss-crafted item templates.
- Boss stones cannot be applied twice to the same item.
- Exchanges fail on insufficient gold, missing trophies, invalid target item, or
  wrong owner.
- Equipped item exchanges invalidate equipment stats and return equipment state
  updates.

Focused verification:

- Run seed-data tests after item template and recipe updates.
- Run API service tests for Vex exchange behavior.
- Run typecheck after schema/type additions.

## Out of Scope

- Full wandering merchant timed spawn implementation from issue #232.
- Stat requirement systems beyond existing character-level and weapon-skill
  gates.
- Trade between players.
- Stacking multiple stones on one item.
- Letting ordinary equipment receive boss stones.
- Reworking world boss scheduling or contribution scoring.
