# Mode-Aware Hit Curves — Design

## Goal

Replace the current one-size-fits-all d20 hit check with mode-aware hit curves so:

- PvP can support true evasion builds with very high avoidance ceilings
- Open-world PvE keeps dodge/evasion meaningful without breaking onboarding
- Expedition group combat supports evasion tanking as a viable archetype
- Boss and elite encounters retain reliable pressure through higher hit floors and unavoidable mechanics

## Problem

The current hit model is a binary threshold:

```ts
roll + accuracy >= 10 + dodge + evasion
```

That creates three problems:

1. PvP and PvE are forced to share the same avoidance math even though their balance goals are different.
2. Avoidance has breakpoint behavior, so a few points of dodge/evasion can swing combat from normal to near-immunity.
3. Evasion as an attribute has weak incentives unless it produces outsized value, but giving it that value currently destabilizes PvE.

## Design Principles

- Keep `dodge` and `evasion` as separate inputs.
- Make combat mode an explicit balance axis instead of an implicit side effect.
- Let PvP evasion become a real archetype with real counters.
- Keep PvE dodge meaningful, not cosmetic.
- Use explicit counters like accuracy, anti-evasion debuffs, and unavoidable pressure instead of hiding everything in raw accuracy inflation.

## Combat Modes

The hit system should become mode-aware:

- `pvp`
- `pve_open_world`
- `pve_expedition`
- `pve_boss`

These modes are balance contracts, not presentation labels. Each mode gets its own hit-curve constants.

## Core Model

All direct attacks use the same family of formula, with mode-specific constants:

```ts
hitChance = clamp(minHit, maxHit, 1 / (1 + ((avoidScore + bias) / max(1, hitScore)) ** exponent))
```

### Inputs

```ts
hitScore =
  baseAccuracy +
  equipmentAccuracy +
  actionAccuracyModifier +
  temporaryAccuracyEffects +
  antiEvasionEffects

avoidScore =
  dodge +
  evasionAttribute +
  temporaryAvoidanceEffects -
  antiEvasionEffects
```

### Important Rules

- `dodge` remains the primary gear-driven avoidance stat.
- `evasion` remains an attribute-driven input with combat and non-combat meaning.
- Always-hit effects bypass hit chance entirely.
- DoTs, hazards, and tagged unavoidable effects bypass hit checks unless a specific skill says otherwise.
- The engine may still roll for flavor/logging, but the pass/fail decision is based on the computed chance rather than d20 threshold math.

## Target Outcomes

### PvP

- Evasion is a real archetype, not a trap stat.
- A full-evasion specialist against a same-level glass cannon with no anti-evasion tools can push into roughly `75% to 80%` avoid chance.
- Dedicated counters must matter:
  - accuracy on gear
  - naturally accurate skills
  - always-hit anti-evasion debuffs
  - DoTs and unavoidable pressure
- PvP should not collapse into a single dominant evasion build; the counter package must be real enough that players can choose to tech against it.

### Open-World PvE

- Dodge/evasion should remain noticeable against normal mobs.
- Starter and regular world combat should not become swingy or unreadable.
- PvE should not require every mob to carry inflated raw accuracy just to function.

### Expedition PvE

- Evasion tanking is viable, not mandatory.
- In favorable many-vs-many setups, a dedicated evasion tank can avoid roughly `40% to 50%` of direct incoming attacks while holding aggro.
- Armor/mitigation tanks remain competitive through consistency.
- Hybrid tanks remain lower-ceiling but more stable.

### Boss / Elite PvE

- Bosses and elites must keep reliable pressure.
- That pressure should come from a mix of:
  - higher hit floors
  - stronger hit-score tuning
  - always-hit debuffs
  - unavoidable DoTs / hazards
- Bosses should not need absurd accuracy values as the only answer to avoidance.

## Recommended Constants

These are targets, not final tuned values:

- `pvp`
  - `minHit = 0.10`
  - `maxHit = 0.95`
  - steep exponent
  - low bias
- `pve_open_world`
  - `minHit = 0.25`
  - `maxHit = 0.95`
  - flatter exponent
  - moderate bias
- `pve_expedition`
  - `minHit = 0.20`
  - `maxHit = 0.95`
  - medium exponent
  - tuned to preserve evasion-tank viability
- `pve_boss`
  - `minHit = 0.35`
  - `maxHit = 0.98`
  - flatter curve with stronger bias toward attacker reliability

## Counters And Archetypes

### Evasion Counters

- `accuracy` item affixes and baseline item budgets
- per-skill `accuracyModifier`
- always-hit debuffs that reduce `dodge`, `evasion`, or both
- unavoidable DoTs
- hazard/environment damage

### Archetype Tradeoffs

- Armor tanks:
  - lower variance
  - more reliable incoming-damage reduction
- Evasion tanks:
  - higher variance
  - lower average incoming direct damage when the build works
  - more vulnerable to unavoidable pressure
- Hybrid tanks:
  - lower ceiling
  - more stable across matchups

## Data Model And Engine Changes

### Shared Types

Add first-class combat-mode typing in shared code:

- `CombatMode = 'pvp' | 'pve_open_world' | 'pve_expedition' | 'pve_boss'`
- typed hit-curve configuration
- optional action/effect flags for unavoidable or anti-evasion behavior

### Game Engine

Replace the single `doesAttackHit()` threshold logic with:

- a mode-aware hit-chance calculator
- a resolver that returns both:
  - `hitChance`
  - `didHit`

The engine should log both values for balance review and debugging.

### PvE And PvP Entry Points

Thread combat mode from the caller:

- PvP arena/spar: `pvp`
- standard zone and combat routes: `pve_open_world`
- expedition many-vs-many flow: `pve_expedition`
- boss resolver: `pve_boss`

## Logging And Debugging

Combat logs should include:

- computed `hitChance`
- hit roll or sampled random value
- total attacker hit score
- total defender avoid score

This is necessary because polynomial curves are harder to reason about by feel than d20 thresholds.

## Migration Strategy

This should be a deliberate big-bang change before launch, not a partial compatibility layer.

Recommended rollout:

1. Introduce combat-mode-aware hit utilities and constants.
2. Switch PvP first and validate evasion/counter matchups.
3. Switch expedition and boss combat next so group-role balance is coherent.
4. Retune open-world PvE last against the new curves.

Because there are no live users yet, the goal is coherence before launch rather than temporary backward compatibility.

## Guardrails

Define explicit regression targets per mode:

- PvP unchecked evasion ceiling
- PvP counter-build recovery floor
- open-world starter hit-rate floors
- expedition evasion-tank viability band
- boss minimum reliability band

These targets should live in tests, not just in notes.

## Out Of Scope

- Final item-affix redesign beyond accuracy/evasion interaction
- Rebuilding the attribute system
- Reworking all mob skill kits in the same pass unless needed for unavoidable-pressure support
- Frontend combat-log redesign beyond exposing the extra fields needed for debugging
