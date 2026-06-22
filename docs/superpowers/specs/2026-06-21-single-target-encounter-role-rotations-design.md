# Single-Target Encounter Role Rotations Design

## Goal

Encounter-site elites and mini-bosses should be meaningfully harder than trash mobs without relying on fake AoE pressure. Encounter sites are solo-player fights, so role-generated encounter-site action templates must use single-target actions only.

## Scope

This design applies to encounter-site role templates only:

- `trash`
- `elite`
- `mini_boss`

Normal exploration elites stay scoped to the existing role stat/XP/display scaling in this PR. They do not receive encounter-site action rotations until the normal exploration combat path is intentionally upgraded.

## Current Problem

The current role resolver gives elites a short `basic -> special -> basic` pattern and some specials are AoE. Mini-bosses can also receive AoE specials or AoE finishers. That does not fit encounter sites because the player is solo, and a single weak debuff or simple mob buff is not enough to make an elite feel like a real challenge.

## Design

Encounter-site role templates become explicit single-target rotations:

- `trash`: simple basic attack pressure.
- `elite`: a 4-action rotation that combines setup/control, base pressure, and spike damage.
- `mini_boss`: a longer single-target rotation with stronger specials and a telegraphed single-target spike.

Every role-generated action must use `targetMode: 'single_target'`. AoE remains available for expeditions, raids, and world bosses through their own templates, but the encounter-site role resolver must not emit AoE.

## Role Action Tuning

Add role-level action tuning constants separate from base stat multipliers. This gives balancing two independent levers:

- Base role stats: HP, damage, accuracy, defences, XP.
- Role action strength: special damage, spike damage, debuff/control intensity.

Proposed constant shape:

```ts
ROLE_ACTION_MULTIPLIERS: {
  trash: {
    specialDamage: 1,
    spikeDamage: 1,
    debuffModifier: 1,
  },
  elite: {
    specialDamage: 1.25,
    spikeDamage: 1.5,
    debuffModifier: 1,
  },
  mini_boss: {
    specialDamage: 1.45,
    spikeDamage: 1.9,
    debuffModifier: 1.25,
  },
}
```

These values are starting points. The important requirement is that role action strength is tunable without changing the base mob template or the role stat multipliers.

## Elite Rotations

Elites use hybrid rotations: reuse existing single-target control/debuff/buff actions where they fit, and add small role-specific spike actions where existing actions are too generic.

Default elite pattern:

1. Setup/control action
2. Basic attack
3. Spike action
4. Basic attack or follow-up

Theme examples:

- Spider/Web/Venom: root or poison setup, basic attack, venom strike spike, basic attack.
- Wolf/Warg/Coyote: frenzy setup, basic attack, maul spike, basic attack.
- Bandit/Goblin: smoke or accuracy disruption, basic attack, backstab spike, basic attack.
- Treant/Golem/Bark: root setup, basic attack, crushing blow spike, basic attack.
- Spirit/Fae/Wisp/Witch: weaken setup, magic attack, arcane lance spike, magic attack.
- Undead/Skeleton/Wraith/Lich: wither setup, attack, draining strike spike, attack.
- Physical fallback: enrage/setup, physical attack, heavy strike spike, physical attack.
- Magic fallback: weaken/setup, magic attack, arcane spike, magic attack.

## Mini-Boss Rotations

Mini-bosses stay encounter-site-only and final-room-only, but their templates also become single-target.

Default mini-boss pattern:

1. Strong setup/control action
2. Basic attack
3. Role-special action
4. Basic attack
5. Telegraphed single-target spike

Mini-bosses should feel more dangerous than elites through action multipliers, longer rotations, and a telegraphed spike, not through AoE.

## Action Definitions

Reuse existing actions where their mechanics fit a single-target encounter:

- `boss_root`
- `boss_wither`
- `boss_weaken`, changed to single-target when used by encounter-site role templates
- `boss_smoke_bomb`, changed to single-target when used by encounter-site role templates
- `boss_frenzy`
- `boss_enrage`

Add only the missing role-specific spike actions needed for strong elite/mini-boss pressure. Candidate names:

- `elite_venom_strike`
- `elite_maul`
- `elite_backstab`
- `elite_crushing_blow`
- `elite_arcane_lance`
- `elite_draining_strike`
- `mini_boss_execution_strike`

These actions should use existing action-definition mechanics and include multipliers that can be scaled by role action tuning.

## Data Flow

`resolveEncounterRoleActionTemplate` remains the central resolver for role-generated encounter-site templates. It should:

1. Infer the family theme from family name, mob name, and damage type.
2. Select a role rotation for `trash`, `elite`, or `mini_boss`.
3. Apply single-target-only template entries.
4. Apply role action tuning to generated actions or referenced action definitions through a clear helper.

Encounter-site combat loading continues to apply prefix, event, and role stat modifiers before building the raid mob. The generated action template changes only the actions that role-promoted encounter-site mobs take during combat.

## Testing

Add tests that verify:

- Elite role templates never emit `targetMode: 'aoe'`.
- Mini-boss role templates never emit `targetMode: 'aoe'`.
- Themed elite rotations contain more than one meaningful non-basic action when appropriate.
- Elite rotations include a spike action.
- Mini-boss rotations include a telegraphed single-target spike.
- Role action tuning constants are applied to generated spike/special actions.
- Existing encounter-site combat still loads role-scaled mobs with generated templates.

## Non-Goals

- Do not change expedition, raid, or world-boss templates.
- Do not add AoE simulation to encounter sites.
- Do not give normal exploration elites encounter-site action rotations in this change.
- Do not create unique elite monster templates per mob. Role promotion should still work on any eligible base mob template.
