import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { BOSS_ENCOUNTER_CONSTANTS } from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Threat & Contribution - Pocketrealm Wiki',
  description:
    'How threat accumulation, taunt mechanics, and contribution scoring work in boss encounters.',
};

const bossRelated = [
  { label: 'Boss Encounters', href: '/wiki/bosses/encounters' },
  { label: 'Expeditions', href: '/wiki/bosses/expeditions' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
];

export default function ThreatPage() {
  return (
    <WikiSection
      title="Threat & Contribution"
      summary="Threat determines which player the boss targets with single-target attacks. Contribution determines how loot rewards are distributed after the boss is defeated."
      related={bossRelated}
    >
      <h2>Threat Accumulation</h2>
      <p>
        Every player starts at zero threat. Dealing damage and healing allies
        both generate threat:
      </p>
      <FormulaBlock>
        <Out>damageThreat</Out> <Op>=</Op> <Var>damage</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_DAMAGE}</Const>
        <Comment> {'//'} THREAT_PER_DAMAGE</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>healThreat</Out> <Op>=</Op> <Var>healAmount</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_HEAL}</Const>
        <Comment> {'//'} THREAT_PER_HEAL</Comment>
      </FormulaBlock>
      <p>
        Threat is cumulative across all rounds. The player with the highest
        threat is the boss&rsquo;s single-target focus.
      </p>

      <h2>Taunt Mechanics</h2>
      <p>
        The <strong>Taunt</strong> ability (from the General talent tree) forces
        the boss to target the taunting player for{' '}
        {BOSS_ENCOUNTER_CONSTANTS.TAUNT_DEFAULT_DURATION} rounds. Taunt also
        adds a flat{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.TAUNT_THREAT_BONUS}</Const> threat
        bonus on activation.
      </p>
      <FormulaBlock>
        <Out>threat after taunt</Out> <Op>=</Op> <Var>currentThreat</Var>{' '}
        <Op>+</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.TAUNT_THREAT_BONUS}</Const>
        <Comment> {'//'} TAUNT_THREAT_BONUS</Comment>
      </FormulaBlock>
      <p>
        While a taunt is active, the boss always targets the taunting player
        for single-target actions, regardless of other players&rsquo; threat
        values. If multiple players taunt simultaneously, the one with the
        highest threat among taunters is targeted. Taunt duration decrements by
        1 at the end of each round.
      </p>

      <h2>Target Selection</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Action Type</th>
            <th>Target Selection</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Single-target</td>
            <td>
              Highest-threat alive player. If a taunt is active, the taunting
              player takes priority.
            </td>
          </tr>
          <tr>
            <td>AoE</td>
            <td>Hits all living participants (ignores threat).</td>
          </tr>
        </tbody>
      </table>

      <h2>Contribution Scoring</h2>
      <p>
        When a boss is defeated, each participant receives a contribution score
        that determines their share of the loot:
      </p>
      <FormulaBlock>
        <Out>score</Out> <Op>=</Op> <Var>damage</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_DAMAGE_WEIGHT}</Const>{' '}
        <Op>+</Op> <Var>healing</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_HEALING_WEIGHT}</Const>{' '}
        <Op>+</Op> <Var>absorbed</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_ABSORB_WEIGHT}</Const>{' '}
        <Op>+</Op> <Var>roundsSurvived</Var> <Op>&times;</Op>{' '}
        <Const>{BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_SURVIVAL_FLAT_BONUS}</Const>
      </FormulaBlock>
      <p>
        All four components reward different playstyles: pure damage dealers,
        healers, tanks absorbing hits, and simply staying alive. The survival
        bonus ensures that even players who focus on support and defense receive
        meaningful contribution.
      </p>

      <h2>Loot Distribution</h2>
      <p>
        Each player&rsquo;s loot share is proportional to their contribution
        score relative to the total. Higher contribution means better chances
        at rare drops and more materials.
      </p>
      <FormulaBlock>
        <Out>lootShare</Out> <Op>=</Op> <Var>playerScore</Var> <Op>/</Op>{' '}
        <Var>totalScore</Var>
      </FormulaBlock>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'THREAT_PER_DAMAGE',
            value: BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_DAMAGE,
            description: 'Threat generated per point of damage dealt',
          },
          {
            name: 'THREAT_PER_HEAL',
            value: BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_HEAL,
            description: 'Threat generated per point of healing done',
          },
          {
            name: 'TAUNT_THREAT_BONUS',
            value: BOSS_ENCOUNTER_CONSTANTS.TAUNT_THREAT_BONUS,
            description: 'Flat threat added when Taunt is activated',
          },
          {
            name: 'TAUNT_DEFAULT_DURATION',
            value: BOSS_ENCOUNTER_CONSTANTS.TAUNT_DEFAULT_DURATION,
            description: 'Rounds the boss is forced to target the taunter',
          },
          {
            name: 'CONTRIBUTION_DAMAGE_WEIGHT',
            value: BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_DAMAGE_WEIGHT,
            description: 'Weight of total damage in contribution score',
          },
          {
            name: 'CONTRIBUTION_HEALING_WEIGHT',
            value: BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_HEALING_WEIGHT,
            description: 'Weight of total healing in contribution score',
          },
          {
            name: 'CONTRIBUTION_ABSORB_WEIGHT',
            value: BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_ABSORB_WEIGHT,
            description: 'Weight of damage absorbed in contribution score',
          },
          {
            name: 'CONTRIBUTION_SURVIVAL_FLAT_BONUS',
            value: BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_SURVIVAL_FLAT_BONUS,
            description: 'Flat contribution points per round survived',
          },
        ]}
      />
    </WikiSection>
  );
}
