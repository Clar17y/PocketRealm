import type { Metadata } from 'next';
import {
  EXPLORATION_CONSTANTS,
  EXPLORATION_TRACKING_CONSTANTS,
  PREMIUM_CONSTANTS,
  WORLD_EVENT_CONSTANTS,
} from '@pocketrealm/shared';
import { cumulativeProbability } from '@pocketrealm/game-engine';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { formatPercent } from '@/lib/format';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Probability Model',
  description:
    'Cumulative exploration probability formula, per-turn rates, tracking modifiers, world event discovery, travel ambushes, and Champion hidden cache bonuses.',
};

const turnCounts = [
  EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS,
  250,
  500,
  1000,
  EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS,
];

const rates = [
  { label: 'Ambush', rate: EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN },
  { label: 'Encounter Site', rate: EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN },
  { label: 'Resource Node', rate: EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE },
  { label: 'Hidden Cache', rate: EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE },
  { label: 'World Event', rate: WORLD_EVENT_CONSTANTS.EVENT_DISCOVERY_CHANCE_PER_TURN },
];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function ProbabilityPage() {
  return (
    <WikiSection
      title="Probability Model"
      summary="Exploration uses a cumulative probability model. Each turn has an independent chance of triggering a discovery, and spending more turns increases the overall probability. Tracking, Champion status, world events, and travel ambushes add targeted modifiers on top."
      related={[
        { label: 'Room Generation', href: '/wiki/exploration/rooms' },
        { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
        { label: 'Zone Progression', href: '/wiki/exploration/zones' },
      ]}
    >
      <h2>Cumulative Probability Formula</h2>
      <FormulaBlock>
        <Out>P(at least one)</Out> <Op>=</Op> <Const>1</Const> <Op>-</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op> <Var>p</Var><Op>)</Op>
        <sup><Var>n</Var></sup>{' '}
        <Comment>where p = per-turn chance, n = turns spent</Comment>
      </FormulaBlock>

      <h2>Per-Turn Rates</h2>
      <ConstantsTable
        rows={[
          { name: 'AMBUSH_CHANCE_PER_TURN', value: formatPercent(EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN), description: 'Chance of an ambush encounter each turn' },
          { name: 'ENCOUNTER_SITE_CHANCE_PER_TURN', value: formatPercent(EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN), description: 'Chance of discovering an encounter site each turn' },
          { name: 'RESOURCE_NODE_CHANCE', value: formatPercent(EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE), description: 'Chance of discovering a resource node each turn' },
          { name: 'HIDDEN_CACHE_CHANCE', value: formatPercent(EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE), description: 'Chance of finding a hidden cache each turn' },
          { name: 'EVENT_DISCOVERY_CHANCE_PER_TURN', value: formatPercent(WORLD_EVENT_CONSTANTS.EVENT_DISCOVERY_CHANCE_PER_TURN), description: 'Chance of discovering an eligible world event each turn' },
          { name: 'TRAVEL_AMBUSH_CHANCE_PER_TURN', value: formatPercent(EXPLORATION_CONSTANTS.TRAVEL_AMBUSH_CHANCE_PER_TURN), description: 'Chance of a travel ambush each travel turn' },
          { name: 'RESULT_RATE_MULTIPLIER', value: `${EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER}x`, description: 'Tracking multiplier applied to ambush and encounter-site rates' },
          { name: 'BONUS_MULTIPLIER', value: `${PREMIUM_CONSTANTS.BONUS_MULTIPLIER}x`, description: 'Champion multiplier applied to hidden cache chance' },
          { name: 'MIN_EXPLORATION_TURNS', value: EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS, description: 'Minimum turns per exploration' },
          { name: 'MAX_EXPLORATION_TURNS', value: EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS.toLocaleString(), description: 'Maximum turns per exploration' },
        ]}
      />

      <h2>Tracking Mode</h2>
      <p>
        Mob family tracking reduces broad exploration output in exchange for
        stronger family targeting. While tracking is active, ambush and
        encounter-site rates are multiplied by{' '}
        <strong>{EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER}x</strong>.
        Resource node, hidden cache, and zone-exit base rates stay unchanged.
      </p>
      <FormulaBlock>
        <Out>trackedAmbushRate</Out> <Op>=</Op>{' '}
        <Var>AMBUSH_CHANCE_PER_TURN</Var> <Op>&times;</Op>{' '}
        <Const>{EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER}</Const>
      </FormulaBlock>
      <FormulaBlock>
        <Out>trackedEncounterSiteRate</Out> <Op>=</Op>{' '}
        <Var>ENCOUNTER_SITE_CHANCE_PER_TURN</Var> <Op>&times;</Op>{' '}
        <Const>{EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER}</Const>
      </FormulaBlock>

      <h2>Champion Hidden Cache Bonus</h2>
      <p>
        Champion supporters multiply hidden cache chance by{' '}
        <strong>{PREMIUM_CONSTANTS.BONUS_MULTIPLIER}x</strong>. This bonus
        applies only to hidden caches, not to ambush, site, resource node, or
        zone-exit discovery rolls.
      </p>
      <FormulaBlock>
        <Out>championHiddenCacheChance</Out> <Op>=</Op>{' '}
        <Var>HIDDEN_CACHE_CHANCE</Var> <Op>&times;</Op>{' '}
        <Const>{PREMIUM_CONSTANTS.BONUS_MULTIPLIER}</Const>
      </FormulaBlock>

      <h2>World Events</h2>
      <p>
        When a world event is eligible for discovery, exploration performs a
        separate event roll at{' '}
        <strong>{formatPercent(WORLD_EVENT_CONSTANTS.EVENT_DISCOVERY_CHANCE_PER_TURN)}</strong>{' '}
        per turn. This roll is independent of ambushes, encounter sites,
        resource nodes, hidden caches, and zone exits.
      </p>

      <h2>Travel Ambushes</h2>
      <p>
        Zone travel uses its own ambush model. Each travel turn has a{' '}
        <strong>{formatPercent(EXPLORATION_CONSTANTS.TRAVEL_AMBUSH_CHANCE_PER_TURN)}</strong>{' '}
        chance to trigger a travel ambush; this is separate from the standard
        exploration ambush rate.
      </p>
      <FormulaBlock>
        <Out>travelAmbushChance</Out> <Op>=</Op> <Const>1</Const> <Op>-</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op>{' '}
        <Var>TRAVEL_AMBUSH_CHANCE_PER_TURN</Var><Op>)</Op>
        <sup><Var>travelTurns</Var></sup>
      </FormulaBlock>

      <h2>Probability Table</h2>
      <p>
        Cumulative chance of at least one discovery for each event type across
        legal exploration turn investments. Values computed from{' '}
        <code>cumulativeProbability()</code>.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Turns</th>
            {rates.map((r) => (
              <th key={r.label}>{r.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {turnCounts.map((n) => (
            <tr key={n}>
              <td>{n.toLocaleString()}</td>
              {rates.map((r) => (
                <td key={r.label}>{pct(cumulativeProbability(r.rate, n))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Expected Discoveries</h2>
      <p>
        The expected number of a given event over <Var>n</Var> turns is simply:
      </p>
      <FormulaBlock>
        <Out>expected</Out> <Op>=</Op> <Var>n</Var> <Op>*</Op> <Var>p</Var>
      </FormulaBlock>
      <p>
        For example, spending 1,000 turns yields an expected{' '}
        <strong>{(1000 * EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN).toFixed(1)}</strong>{' '}
        ambushes and{' '}
        <strong>{(1000 * EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN).toFixed(1)}</strong>{' '}
        encounter sites.
      </p>
    </WikiSection>
  );
}
