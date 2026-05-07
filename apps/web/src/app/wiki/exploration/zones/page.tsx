import type { Metadata } from 'next';
import { EXPLORATION_CONSTANTS, ZONE_CONSTANTS, ZONE_EXPLORATION_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Zone Progression',
  description:
    'Zone exit scaling formula, travel costs, terrain multipliers, and zone exploration progress system.',
};

export default function ZonesPage() {
  return (
    <WikiSection
      title="Zone Progression"
      summary="Zones form a connected graph. Exploration unlocks zone exits to adjacent zones, with exit discovery scaling as you explore more."
      related={[
        { label: 'Probability Model', href: '/wiki/exploration/probability' },
        { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
        { label: 'Room Generation', href: '/wiki/exploration/rooms' },
      ]}
    >
      <h2>Zone Exit Scaling</h2>
      <p>
        Zone exits become easier to discover as exploration percentage
        increases. Below{' '}
        <strong>{EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_START}%</strong>,
        the base exit chance is used unchanged. Above that threshold, a
        quadratic multiplier applies.
      </p>
      <FormulaBlock>
        <Var>progress</Var> <Op>=</Op> min<Op>(</Op>
        <Op>(</Op><Var>explorationPercent</Var> <Op>-</Op>{' '}
        <Const>{EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_START}</Const><Op>)</Op>{' '}
        <Op>/</Op> <Op>(</Op><Const>100</Const> <Op>-</Op>{' '}
        <Const>{EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_START}</Const><Op>)</Op>
        <Op>,</Op> <Const>1</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>multiplier</Out> <Op>=</Op> <Const>1</Const> <Op>+</Op>{' '}
        <Op>(</Op><Const>{EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_MAX_MULTIPLIER}</Const>{' '}
        <Op>-</Op> <Const>1</Const><Op>)</Op> <Op>*</Op>{' '}
        <Var>progress</Var><sup>2</sup>{' '}
        <Comment>(quadratic scaling)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>scaledExitChance</Out> <Op>=</Op> <Var>baseExitChance</Var>{' '}
        <Op>*</Op> <Var>multiplier</Var>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'ZONE_EXIT_SCALING_START', value: `${EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_START}%`, description: 'Exploration % below which no scaling applies' },
          { name: 'ZONE_EXIT_SCALING_MAX_MULTIPLIER', value: `${EXPLORATION_CONSTANTS.ZONE_EXIT_SCALING_MAX_MULTIPLIER}x`, description: 'Maximum exit chance multiplier at 100% exploration' },
        ]}
      />

      <h2>Travel Costs</h2>
      <p>
        Moving between zones costs turns. Difficult terrain doubles the cost.
        Returning along a previously traveled path (breadcrumb) is free.
      </p>
      <ConstantsTable
        rows={[
          { name: 'BASE_TRAVEL_COST', value: `${ZONE_CONSTANTS.BASE_TRAVEL_COST} turns`, description: 'Base turn cost to travel between zones' },
          { name: 'DIFFICULT_TERRAIN_MULTIPLIER', value: `${ZONE_CONSTANTS.DIFFICULT_TERRAIN_MULTIPLIER}x`, description: 'Cost multiplier for difficult terrain' },
        ]}
      />

      <h2>Zone Exploration Progress</h2>
      <p>
        Exploration progress within a zone determines which mob tiers are
        available and how zone exit chances scale. Each zone uses configurable
        tier thresholds; the defaults are:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Unlocks At</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS).map(([tier, threshold]) => (
            <tr key={tier}>
              <td>Tier {tier}</td>
              <td>{threshold}% exploration</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Encounter Decay</h2>
      <p>
        Discovered encounter sites and resource nodes decay over time if not
        engaged. Encounter site decay removes whole mobs after enough elapsed
        hours have accumulated; resource node decay removes whole units of
        remaining capacity.
      </p>
      <ConstantsTable
        rows={[
          { name: 'ENCOUNTER_SITE_DECAY_RATE_PER_HOUR', value: `${EXPLORATION_CONSTANTS.ENCOUNTER_SITE_DECAY_RATE_PER_HOUR} mobs/hr`, description: 'Whole mobs decayed after flooring elapsed hours × rate' },
          { name: 'RESOURCE_NODE_DECAY_RATE_PER_HOUR', value: `${EXPLORATION_CONSTANTS.RESOURCE_NODE_DECAY_RATE_PER_HOUR} capacity/hr`, description: 'Whole node capacity decayed after flooring elapsed hours × rate' },
        ]}
      />

      <h2>Encounter Site Sizes</h2>
      <p>
        When an encounter site is discovered, its size determines the number
        of rooms and mobs within.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Size</th>
            <th>Mob Count Range</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Small</td>
            <td>{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL.min}&#8211;{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_SMALL.max}</td>
          </tr>
          <tr>
            <td>Medium</td>
            <td>{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM.min}&#8211;{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_MEDIUM.max}</td>
          </tr>
          <tr>
            <td>Large</td>
            <td>{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE.min}&#8211;{EXPLORATION_CONSTANTS.ENCOUNTER_SIZE_LARGE.max}</td>
          </tr>
        </tbody>
      </table>
    </WikiSection>
  );
}
