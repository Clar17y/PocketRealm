import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  COMBAT_CONSTANTS,
  CHARACTER_CONSTANTS,
} from '@pocketrealm/shared';

const SCALING = COMBAT_CONSTANTS.DEFENCE_SCALING_FACTOR;

const { Var, Out, Enemy, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Damage Calculation - Pocketrealm Wiki',
  description:
    'How weapon damage, attribute bonuses, action multipliers, and defence reduction combine to produce final damage.',
};

const combatRelated = [
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
];

export default function DamagePage() {
  return (
    <WikiSection
      title="Damage Calculation"
      summary="Every attack resolves through a pipeline: total attack power determines the weapon damage range, then an action multiplier scales it, and finally the target's defence reduces the result."
      related={combatRelated}
    >
      <h2>Total Attack</h2>
      <p>
        Total attack is the sum of three components that vary by combat style.
      </p>
      <FormulaBlock>
        <Out>totalAttack</Out> <Op>=</Op> <Var>skillLevel</Var> <Op>+</Op>{' '}
        <Var>weaponPower</Var> <Op>+</Op> <Var>attributeBonus</Var>
      </FormulaBlock>

      <h3>Attribute Bonus by Style</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Style</th>
            <th>Attribute</th>
            <th>Damage per Point</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Melee</td>
            <td>Strength</td>
            <td>{CHARACTER_CONSTANTS.MELEE_DAMAGE_PER_STRENGTH}</td>
          </tr>
          <tr>
            <td>Ranged</td>
            <td>Dexterity</td>
            <td>{CHARACTER_CONSTANTS.RANGED_DAMAGE_PER_DEXTERITY}</td>
          </tr>
          <tr>
            <td>Magic</td>
            <td>Intelligence</td>
            <td>{CHARACTER_CONSTANTS.MAGIC_DAMAGE_PER_INTELLIGENCE}</td>
          </tr>
        </tbody>
      </table>

      <h2>Weapon Damage Range</h2>
      <p>
        Once total attack is known, the weapon damage range is derived:
      </p>
      <FormulaBlock>
        <Out>damageMin</Out> <Op>=</Op> <Const>1</Const> <Op>+</Op>{' '}
        <Op>floor(</Op><Var>totalAttack</Var> <Op>/</Op> <Const>5</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>damageMax</Out> <Op>=</Op> <Const>5</Const> <Op>+</Op>{' '}
        <Op>floor(</Op><Var>totalAttack</Var> <Op>/</Op> <Const>2</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        The actual roll is a uniform random integer between damageMin and
        damageMax (inclusive).
      </p>

      <h2>Action Multiplier</h2>
      <p>
        Each combat action has a <code>damageMultiplier</code> that scales the
        rolled damage. A Light Attack uses 0.6x, Normal Attack 1.0x, Heavy
        Attack 1.5x, and talent abilities range from 0.5x to 2.5x. See the{' '}
        <a href="/wiki/combat/actions">Combat Actions</a> page for the full
        table.
      </p>
      <FormulaBlock>
        <Out>scaledDamage</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>rolledDamage</Var> <Op>&times;</Op> <Var>actionMultiplier</Var>
        <Op>)</Op>
      </FormulaBlock>

      <h2>Defence Reduction</h2>
      <p>
        Defence uses a diminishing-returns curve that applies identically in all
        combat contexts: open-world, encounter sites, expeditions, raids, and
        PvP. Physical attacks check <code>defence</code>; magic attacks check{' '}
        <code>magicDefence</code>.
      </p>
      <FormulaBlock>
        <Out>reduction</Out> <Op>=</Op> <Enemy>defence</Enemy> <Op>/</Op>{' '}
        <Op>(</Op><Enemy>defence</Enemy> <Op>+</Op> <Const>{SCALING}</Const><Op>)</Op>
        <Comment> {'//'} diminishing returns</Comment>
      </FormulaBlock>
      <p>
        At {SCALING} defence, reduction is 50%. At {SCALING * 2}, it is ~67%. The curve
        approaches but never reaches 100%.
      </p>

      <h2>Final Damage</h2>
      <FormulaBlock>
        <Out>finalDamage</Out> <Op>=</Op> <Op>max(</Op>
        <Const>{COMBAT_CONSTANTS.MIN_DAMAGE}</Const><Op>,</Op>{' '}
        <Op>floor(</Op><Var>scaledDamage</Var> <Op>&times;</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op> <Out>reduction</Out><Op>)</Op>
        <Op>))</Op>
      </FormulaBlock>
      <p>
        Damage is always at least {COMBAT_CONSTANTS.MIN_DAMAGE}. If the attack
        is a critical hit, the crit multiplier is applied before defence
        reduction (see <a href="/wiki/combat/critical-hits">Critical Hits</a>).
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'MIN_DAMAGE',
            value: COMBAT_CONSTANTS.MIN_DAMAGE,
            description: 'Minimum damage any attack can deal (after all reductions)',
          },
          {
            name: 'ENCOUNTER_TURN_COST',
            value: COMBAT_CONSTANTS.ENCOUNTER_TURN_COST,
            description: 'Turn cost to initiate a single encounter',
          },
          {
            name: 'MELEE_DAMAGE_PER_STRENGTH',
            value: CHARACTER_CONSTANTS.MELEE_DAMAGE_PER_STRENGTH,
            description: 'Bonus melee damage per point of Strength',
          },
          {
            name: 'RANGED_DAMAGE_PER_DEXTERITY',
            value: CHARACTER_CONSTANTS.RANGED_DAMAGE_PER_DEXTERITY,
            description: 'Bonus ranged damage per point of Dexterity',
          },
          {
            name: 'MAGIC_DAMAGE_PER_INTELLIGENCE',
            value: CHARACTER_CONSTANTS.MAGIC_DAMAGE_PER_INTELLIGENCE,
            description: 'Bonus magic damage per point of Intelligence',
          },
          {
            name: 'EVASION_TO_SPEED_DIVISOR',
            value: CHARACTER_CONSTANTS.EVASION_TO_SPEED_DIVISOR,
            description: 'Evasion points per 1 speed (for initiative)',
          },
        ]}
      />
    </WikiSection>
  );
}
