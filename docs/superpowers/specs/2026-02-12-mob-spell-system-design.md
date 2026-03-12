# Mob Spell System Design

## Goal

Implement a full spell effect system for combat. Mobs already have spell pattern data in the database (damage, heal, buff, debuff) but only damage spells work. Build the engine, fix the data model, and assign real values to every placeholder spell.

## Current Problems

1. **Field mismatch**: Seed data writes `name`, `SpellAction` type expects `action`
2. **Missing mechanics**: `buff: true` and `debuff: true` do nothing — `executeMobSpell` only handles `damage`
3. **No heal support**: `heal` field exists in seed data but engine ignores it
4. **No lifesteal**: Life Drain has both `damage` and `heal` but only damage fires

## Data Model

### SpellAction (shared type)

```typescript
interface SpellAction {
  round: number;
  name: string;             // display name (was 'action')
  damage?: number;          // direct damage (mitigated by magicDefence)
  heal?: number;            // direct heal on caster (capped at maxHp)
  effects?: SpellEffect[];  // stat modifiers applied on cast
}

interface SpellEffect {
  stat: string;    // 'attack' | 'defence' | 'accuracy' | 'dodge' | 'evasion' |
                   // 'speed' | 'magicDefence' | 'critChance' | 'damageMin' | 'damageMax'
  modifier: number; // positive = buff (on caster), negative = debuff (on opponent)
  duration: number; // rounds the effect lasts
}
```

Future effect types (DOT, HOT, shields, crowd control) will extend this same `effects` array with a `type` discriminator — no schema changes needed.

### Seed data format

```typescript
// Damage only
spell(3, 'Frenzy', { damage: 6 })

// Heal only
spell(3, 'Heal Self', { heal: 8 })

// Lifesteal (damage + heal)
spell(3, 'Life Drain', { damage: 8, heal: 8 })

// Buff (on caster)
spell(2, 'Howl', { effects: [{ stat: 'attack', modifier: 3, duration: 3 }] })

// Debuff (on opponent)
spell(3, 'Web Trap', { effects: [{ stat: 'evasion', modifier: -2, duration: 2 }] })

// Combo: damage + debuff
spell(4, 'Poison Cloud', { damage: 10, effects: [{ stat: 'defence', modifier: -2, duration: 2 }] })
```

## Combat Engine

### Active effects tracking

Combat state gains:

```typescript
interface ActiveEffect {
  name: string;              // spell name for display
  target: 'player' | 'mob';
  stat: string;
  modifier: number;
  remainingRounds: number;
}

// Added to CombatState:
activeEffects: ActiveEffect[];
```

Multiple effects can be active simultaneously on the same combatant. Effects from different spells stack additively.

### Round flow

```
each round:
  1. Tick effects — decrement remainingRounds, remove expired, log expiry
  2. Compute effective stats = base stats + sum(active modifiers per stat)
  3. Execute combat using effective stats (existing hit/damage math unchanged)
```

### executeSpell (renamed from executeMobSpell)

Takes a `caster: 'player' | 'mob'` parameter. Handles all spell types:

- **damage**: mitigated by target's effective magicDefence, reduces target HP
- **heal**: adds HP to caster, capped at maxHp
- **lifesteal**: damage first, then heal (both in one spell)
- **effects**: each SpellEffect pushed to `activeEffects` — positive modifiers target caster, negative target opponent

A single spell can combine any of these.

## Combat Log

### New CombatLogEntry fields

```typescript
spellName?: string;
healAmount?: number;
effectsApplied?: Array<{
  stat: string;
  modifier: number;
  duration: number;
  target: 'player' | 'mob';
}>;
effectsExpired?: Array<{
  name: string;
  target: 'player' | 'mob';
}>;
```

### Log entry examples

```
R3 Mob casts Web Trap! (evasion -2, 2 rds)
R5 Web Trap wore off.
R2 Mob casts Howl! (attack +3, 3 rds)
R3 Mob casts Life Drain for 5 dmg! Heals 5 HP.
R3 Mob casts Heal Self! +8 HP.
```

Effect expiry entries have `round` set but no `actor` — they're system events.

## Playback Display

### CombatLogEntry component

- Spell with damage: `R3 Mob 🔮 5 dmg`
- Spell with heal: `R3 Mob 💚 +8 HP`
- Spell with effects: `R3 Mob 🔮 Web Trap (evasion -2, 2 rds)`
- Effect expiry: `R5 ✨ Web Trap wore off`

### CombatPlayback shake triggers

- Damage to you → shake player bar (existing)
- Damage to mob → shake mob bar (existing)
- Debuff on you → shake player bar
- Buff on mob → shake mob bar
- Heal on mob → shake mob bar

Rule: any time a combatant is affected, their bar shakes.

## Seed Data Values

Modifier magnitudes scale with mob level. Duration is typically 2-3 rounds.

### Debuffs (negative modifier, target opponent)

| Spell | Mob Level | Effect |
|-------|-----------|--------|
| Screech | 8 | accuracy -2, 2 rds |
| Web Trap | 5 | evasion -2, 2 rds |
| Hex | 8 | accuracy -3, 2 rds |
| Confusion | 10 | accuracy -3, 2 rds |
| Fear | 22 | attack -4, 2 rds |
| Charm | 17 | attack -4, 2 rds |
| Curse | 18 | defence -3, 2 rds |
| Curse of Weakness | 27 | defence -4, 2 rds |
| Dirty Trick | 13 | accuracy -3, 2 rds |
| Grapple | 29 | evasion -4, 2 rds |
| Constrict | 36 | evasion -5, 3 rds |
| Crystal Prison | 28 | evasion -6, 3 rds |
| Spectral Chains | 32 | evasion -5, 2 rds |
| Madness Aura | 36 | accuracy -5, 3 rds |
| Static Field | 23 | evasion -4, 2 rds |

### Buffs (positive modifier, target caster)

| Spell | Mob Level | Effect |
|-------|-----------|--------|
| Howl | 8/16 | attack +2/+4, 3 rds |
| Rally | 8 | attack +2, 3 rds |
| War Cry | 16 | attack +4, 3 rds |
| Battle Cry | 16 | attack +4, 3 rds |
| Royal Decree | 27 | attack +5, 3 rds |
| Enchanted Blade | 14 | attack +3, 3 rds |
| Spirit Shield | 16 | defence +4, 3 rds |
| Dark Aura | 26 | attack +5, 3 rds |
| Dark Shield | 27 | defence +5, 3 rds |
| Harden | 17 | defence +5, 3 rds |
| Diamond Shell | 24 | defence +5, 3 rds |
| Scale Shield | 32 | defence +5, 3 rds |
| Bark Shield | 14 | defence +3, 3 rds |
| Resonance | 27 | attack +5, 3 rds |
| Whip Crack | 13 | attack +3, 3 rds |
| Burrow | 13 | evasion +4, 2 rds |
| Submerge | 27 | evasion +5, 2 rds |
| Raise Dead | 36 | attack +6, 3 rds |
| Gadget Shield | 23 | defence +4, 3 rds |
| Tidal Blessing | 36 | attack +6, 3 rds |
| Royal Guard | 17 | defence +4, 3 rds |

### Heals

Already have values in seed data: Heal Self (8), Regenerate (6/10/12), Life Drain (damage + heal combo).

## Future Extensions

These use the same `effects` array with a `type` discriminator:

- **DOT**: `{ type: 'dot', damage: 3, duration: 3 }` — damage each round
- **HOT**: `{ type: 'hot', heal: 3, duration: 3 }` — heal each round
- **Shield**: `{ type: 'shield', absorb: 10, duration: 2 }` — absorb damage before HP
- **Stun**: `{ type: 'stun', duration: 1 }` — skip turn
- **Root**: `{ type: 'root', duration: 2 }` — reduce evasion to 0

No schema or architecture changes needed — just implement the handler in the engine's tick/apply logic.
