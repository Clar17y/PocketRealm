import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';

const { Const, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Boss Encounters - Pocketrealm Wiki',
  description:
    'Boss encounter mechanics: round resolution, tier scaling, signup, and timing.',
};

const bossRelated = [
  { label: 'Threat & Contribution', href: '/wiki/bosses/threat' },
  { label: 'Expeditions', href: '/wiki/bosses/expeditions' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
];

const tierLabels = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];

export default function BossEncountersPage() {
  return (
    <WikiSection
      title="Boss Encounters"
      summary="World bosses are multi-player encounters that resolve in asynchronous rounds. Players sign up, choose actions each round, and the server resolves everything on a timer."
      related={bossRelated}
    >
      <h2>Signup</h2>
      <p>
        When a boss spawns in a zone, any player in that zone can sign up by
        spending <Const>{WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST}</Const>{' '}
        turns. After the first signup, a{' '}
        <Const>{WORLD_EVENT_CONSTANTS.BOSS_INITIAL_WAIT_MINUTES}</Const>-minute
        waiting period begins before the first round resolves. Additional
        players can join during this window.
      </p>

      <h2>Round Resolution Flow</h2>
      <p>
        Every{' '}
        <Const>{WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES}</Const>{' '}
        minutes, the server resolves a round in this order:
      </p>
      <ol>
        <li>
          <strong>Player offensive actions:</strong> attacks and offensive
          abilities resolve first, dealing damage to the boss.
        </li>
        <li>
          <strong>Player supportive actions:</strong> heals, buffs, and
          defensive abilities resolve next, targeting allies.
        </li>
        <li>
          <strong>Boss action:</strong> the boss executes its next action from
          its rotation. Single-target attacks hit the player with highest threat;
          AoE attacks hit all participants.
        </li>
        <li>
          <strong>Tick effects:</strong> damage-over-time, heal-over-time, and
          buff/debuff durations are updated. Taunts decrement.
        </li>
      </ol>
      <p>
        If a player does not submit an action before the round timer expires,
        they automatically use a basic attack.
      </p>

      <h2>Boss Tier Scaling</h2>
      <p>
        Boss stats scale by zone tier. HP per participant, AoE damage per
        participant, and base defence all increase at higher tiers.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>HP / Player</th>
            <th>AoE / Player</th>
            <th>Defence</th>
          </tr>
        </thead>
        <tbody>
          {tierLabels.map((label, i) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[i]}</td>
              <td>{WORLD_EVENT_CONSTANTS.BOSS_AOE_PER_PLAYER_BY_TIER[i]}</td>
              <td>{WORLD_EVENT_CONSTANTS.BOSS_DEFENCE_BY_TIER[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Total boss HP equals the per-player value multiplied by the number of
        signed-up participants. More players means a tougher boss.
      </p>

      <h2>Boss Action Rotation</h2>
      <p>
        Each boss has a fixed sequence of actions (its <em>rotation</em>). The
        boss advances through the rotation one action per round, cycling back to
        the start when it reaches the end. Actions can be:
      </p>
      <ul>
        <li>
          <strong>Single-target:</strong> targets the highest-threat player
          (or a taunting player if one exists).
        </li>
        <li>
          <strong>AoE:</strong> hits all living participants. Some AoE actions
          are <em>telegraphed</em>, meaning players see a warning the round
          before and can use Defend or Ward to mitigate.
        </li>
      </ul>

      <h2>Knockout &amp; Recovery</h2>
      <p>
        If a player&rsquo;s HP reaches zero during a boss encounter, they are
        knocked out and cannot act in subsequent rounds. Knocked-out players do
        not generate threat and the boss will not target them. The encounter
        ends when the boss is defeated or all participants are knocked out.
      </p>

      <h2>Spawning</h2>
      <p>
        Boss encounters spawn on a dedicated{' '}
        <Const>{WORLD_EVENT_CONSTANTS.BOSS_SPAWN_INTERVAL_HOURS}</Const>-hour
        timer, independent of zone events. Exploration can also discover a
        world event; when that event roll succeeds, there is a{' '}
        <Const>{(WORLD_EVENT_CONSTANTS.BOSS_DISCOVERY_CHANCE * 100).toFixed(0)}%</Const>{' '}
        sub-roll to spawn a boss encounter instead of a regular world event. At
        most{' '}
        <Const>{WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS}</Const> boss
        encounter can be active at a time.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'BOSS_SIGNUP_TURN_COST',
            value: WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST,
            description: 'Turns spent to join a boss encounter',
          },
          {
            name: 'BOSS_INITIAL_WAIT_MINUTES',
            value: WORLD_EVENT_CONSTANTS.BOSS_INITIAL_WAIT_MINUTES,
            description: 'Minutes before first round after initial signup',
          },
          {
            name: 'BOSS_ROUND_INTERVAL_MINUTES',
            value: WORLD_EVENT_CONSTANTS.BOSS_ROUND_INTERVAL_MINUTES,
            description: 'Minutes between each round resolution',
          },
          {
            name: 'MAX_BOSS_ENCOUNTERS',
            value: WORLD_EVENT_CONSTANTS.MAX_BOSS_ENCOUNTERS,
            description: 'Maximum simultaneous active boss encounters',
          },
          {
            name: 'BOSS_SPAWN_INTERVAL_HOURS',
            value: WORLD_EVENT_CONSTANTS.BOSS_SPAWN_INTERVAL_HOURS,
            description: 'Scheduled boss spawn interval',
          },
          {
            name: 'BOSS_DISCOVERY_CHANCE',
            value: `${(WORLD_EVENT_CONSTANTS.BOSS_DISCOVERY_CHANCE * 100).toFixed(0)}%`,
            description: 'Boss sub-roll after an eligible world event discovery',
          },
        ]}
      />
    </WikiSection>
  );
}
