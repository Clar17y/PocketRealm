import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  COMBAT_CONSTANTS,
  CRIT_STAT_CONSTANTS,
} from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Critical Hits - Pocketrealm Wiki',
  description:
    'Base crit chance, crit multiplier, equipment bonuses, and how crits interact with the damage pipeline.',
};

const combatRelated = [
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
];

const critRange = CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS;

export default function CriticalHitsPage() {
  return (
    <WikiSection
      title="Critical Hits"
      summary="Critical hits multiply damage before defence reduction is applied. Both the chance and the multiplier can be increased through equipment."
      related={combatRelated}
    >
      <h2>Crit Chance</h2>
      <FormulaBlock>
        <Out>totalCritChance</Out> <Op>=</Op>{' '}
        <Op>clamp(</Op><Const>{COMBAT_CONSTANTS.CRIT_CHANCE}</Const> <Op>+</Op>{' '}
        <Var>equipmentCritChance</Var><Op>,</Op> <Const>0</Const><Op>,</Op>{' '}
        <Const>1</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        Every attack rolls against the total crit chance. The base is{' '}
        {(COMBAT_CONSTANTS.CRIT_CHANCE * 100).toFixed(0)}% without any equipment.
        Equipment can add crit chance as a bonus stat.
      </p>

      <h2>Crit Multiplier</h2>
      <FormulaBlock>
        <Out>totalCritMultiplier</Out> <Op>=</Op>{' '}
        <Const>{COMBAT_CONSTANTS.CRIT_MULTIPLIER}</Const> <Op>+</Op>{' '}
        <Var>equipmentCritDamage</Var>
        <Comment> {'//'} minimum 0</Comment>
      </FormulaBlock>
      <p>
        The base crit multiplier is {COMBAT_CONSTANTS.CRIT_MULTIPLIER}x. Equipment crit
        damage bonuses add to this multiplicatively.
      </p>

      <h2>Crit in the Damage Pipeline</h2>
      <p>
        When a crit occurs, the rolled damage (after action multiplier) is
        multiplied by the total crit multiplier <em>before</em> defence
        reduction:
      </p>
      <FormulaBlock>
        <Out>critDamage</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>scaledDamage</Var> <Op>&times;</Op> <Out>totalCritMultiplier</Out>
        <Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>finalDamage</Out> <Op>=</Op> <Op>max(</Op>
        <Const>{COMBAT_CONSTANTS.MIN_DAMAGE}</Const><Op>,</Op>{' '}
        <Op>floor(</Op><Out>critDamage</Out> <Op>&times;</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op> <Var>defenceReduction</Var><Op>)</Op>
        <Op>))</Op>
      </FormulaBlock>

      <h2>Equipment Crit Stat Ranges</h2>
      <p>
        When an item rolls crit chance or crit damage as a bonus stat, the
        value is drawn uniformly from a fixed range:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Stat</th>
            <th>Min</th>
            <th>Max</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Crit Chance</td>
            <td>{(critRange.critChance.min * 100).toFixed(0)}%</td>
            <td>{(critRange.critChance.max * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>Crit Damage</td>
            <td>+{(critRange.critDamage.min * 100).toFixed(0)}%</td>
            <td>+{(critRange.critDamage.max * 100).toFixed(0)}%</td>
          </tr>
        </tbody>
      </table>
      <p>
        Crit stats can appear on main-hand weapons, gloves, rings, and charms.
        Stacking crit from multiple slots is the primary way to build a
        crit-focused character.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'CRIT_CHANCE',
            value: `${(COMBAT_CONSTANTS.CRIT_CHANCE * 100).toFixed(0)}%`,
            description: 'Base critical hit chance (no equipment)',
          },
          {
            name: 'CRIT_MULTIPLIER',
            value: `${COMBAT_CONSTANTS.CRIT_MULTIPLIER}x`,
            description: 'Base critical hit damage multiplier',
          },
          {
            name: 'MIN_DAMAGE',
            value: COMBAT_CONSTANTS.MIN_DAMAGE,
            description: 'Floor on final damage (even on crit vs high defence)',
          },
          {
            name: 'critChance range',
            value: `${(critRange.critChance.min * 100).toFixed(0)}% - ${(critRange.critChance.max * 100).toFixed(0)}%`,
            description: 'Equipment crit chance bonus stat roll range',
          },
          {
            name: 'critDamage range',
            value: `+${(critRange.critDamage.min * 100).toFixed(0)}% - +${(critRange.critDamage.max * 100).toFixed(0)}%`,
            description: 'Equipment crit damage bonus stat roll range',
          },
        ]}
      />
    </WikiSection>
  );
}
