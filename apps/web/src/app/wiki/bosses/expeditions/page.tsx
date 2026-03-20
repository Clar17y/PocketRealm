import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  EXPEDITION_CONSTANTS,
  EXPEDITION_ROOM_COMPOSITIONS,
} from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Expeditions - Pocketrealm Wiki',
  description:
    'Guild expedition mechanics: room progression, multi-mob encounters, AoE behavior, and reward tokens.',
};

const bossRelated = [
  { label: 'Boss Encounters', href: '/wiki/bosses/encounters' },
  { label: 'Threat & Contribution', href: '/wiki/bosses/threat' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
];

const tierLabels = ['Tier 0', 'Tier 1', 'Tier 2'];

export default function ExpeditionsPage() {
  return (
    <WikiSection
      title="Expeditions"
      summary="Expeditions are guild-organized multi-room raids. Unlike single boss encounters, expeditions feature a sequence of rooms with escalating difficulty, rest stops, and a multi-phase final boss."
      related={bossRelated}
    >
      <h2>How Expeditions Differ from Boss Encounters</h2>
      <ul>
        <li>
          <strong>Multi-room progression</strong> — instead of a single boss,
          expeditions have a sequence of rooms: trash, elite, mini-boss, event,
          and a final boss.
        </li>
        <li>
          <strong>Multiple mobs per room</strong> — each room contains several
          enemies that fight simultaneously, not just one boss.
        </li>
        <li>
          <strong>Rest between rooms</strong> — after clearing a room, the party
          rests for{' '}
          {EXPEDITION_CONSTANTS.REST_DURATION_MS / 60_000} minutes,
          recovering{' '}
          {(EXPEDITION_CONSTANTS.REST_HP_REGEN * 100).toFixed(0)}% HP,{' '}
          {(EXPEDITION_CONSTANTS.REST_STAMINA_REGEN * 100).toFixed(0)}% stamina,
          and {(EXPEDITION_CONSTANTS.REST_MANA_REGEN * 100).toFixed(0)}% mana.
        </li>
        <li>
          <strong>Guild cost</strong> — launching an expedition costs guild
          treasury gold and requires minimum participants.
        </li>
        <li>
          <strong>Expedition hit curve</strong> — expeditions use the{' '}
          <code>pve_expedition</code> hit curve, which is stricter than open
          world PvE but more forgiving than PvP.
        </li>
      </ul>

      <h2>Tier Requirements</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Treasury Cost</th>
            <th>Min Level</th>
            <th>Min Participants</th>
            <th>Rooms</th>
          </tr>
        </thead>
        <tbody>
          {tierLabels.map((label, i) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[i].toLocaleString()}</td>
              <td>{EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER[i]}</td>
              <td>{EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[i]}</td>
              <td>{EXPEDITION_CONSTANTS.ROOMS_BY_TIER[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Signup costs <Const>{EXPEDITION_CONSTANTS.SIGNUP_TURN_COST}</Const>{' '}
        turns per player. The signup window lasts{' '}
        {EXPEDITION_CONSTANTS.SIGNUP_WINDOW_MS / 60_000} minutes.
      </p>

      <h2>Room Compositions</h2>
      <p>
        Each tier has a fixed room layout. Higher tiers add more elites,
        mini-bosses, and event rooms.
      </p>
      {tierLabels.map((label, i) => (
        <div key={label}>
          <h3>{label}</h3>
          <ul>
            {EXPEDITION_ROOM_COMPOSITIONS[i]?.map((room) => (
              <li key={room.type}>
                {room.count}x <strong>{room.type.replace('_', ' ')}</strong>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Multi-Mob Round Resolution</h2>
      <p>
        Unlike boss encounters where there is a single enemy, expedition rooms
        contain multiple mobs. Each round resolves as follows:
      </p>
      <ol>
        <li>
          <strong>Player offensive actions</strong> — each player&rsquo;s chosen
          action resolves against their targeted mob (or all mobs for AoE).
        </li>
        <li>
          <strong>Player supportive actions</strong> — heals and buffs apply to
          allies.
        </li>
        <li>
          <strong>Each mob acts</strong> — every living mob executes the next
          action in its rotation, cycling through its action template.
        </li>
        <li>
          <strong>Tick effects</strong> — DoTs, HoTs, and buff durations update.
        </li>
      </ol>
      <p>
        Dead mobs are removed. The room is cleared when all mobs reach zero HP.
      </p>

      <h2>Mob Counts per Room</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Room Type</th>
            <th>Mob Count</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Trash</td>
            <td>{EXPEDITION_CONSTANTS.MOB_COUNTS.trash.join('–')}</td>
          </tr>
          <tr>
            <td>Elite</td>
            <td>{EXPEDITION_CONSTANTS.MOB_COUNTS.elite.join('–')}</td>
          </tr>
          <tr>
            <td>Mini-boss adds</td>
            <td>{EXPEDITION_CONSTANTS.MOB_COUNTS.mini_boss_adds.join('–')}</td>
          </tr>
          <tr>
            <td>Event</td>
            <td>{EXPEDITION_CONSTANTS.MOB_COUNTS.event.join('–')}</td>
          </tr>
        </tbody>
      </table>

      <h2>AoE Action Behavior</h2>
      <p>
        When a player uses an AoE ability, it hits all living mobs in the room.
        When a mob uses an AoE action, it hits all living players. Telegraphed
        AoE attacks show a warning the previous round so players can Defend or
        Ward.
      </p>

      <h2>Equipment Lock</h2>
      <p>
        When a room begins, each party member&rsquo;s equipment stats are{' '}
        <strong>locked for the duration of the room</strong>. Changing your
        equipped gear between rounds has no effect until the next room starts.
      </p>
      <ul>
        <li>
          <strong>Swapping gear between rooms</strong> — during the rest phase
          between rooms, you can freely change equipment. Your new stats will
          take effect when the next room begins.
        </li>
        <li>
          <strong>Durability</strong> — equipment durability continues to degrade
          during the room, but stat contributions are based on the snapshot taken
          at room start. Even if a weapon reaches 0 durability mid-room, it
          retains its full stats until the room ends.
        </li>
        <li>
          <strong>Why?</strong> — this ensures consistent combat calculations
          throughout each room and prevents mid-fight gear swapping.
        </li>
      </ul>

      <h2>Mob Threat-Based Targeting</h2>
      <p>
        Each mob maintains its own threat table. When a mob uses a single-target
        attack, it targets the player with the highest threat on that
        specific mob&rsquo;s table. This means different mobs in the same room
        may attack different players based on who has been hitting them.
      </p>
      <p>
        Taunt affects all mobs in the room, forcing every mob to target the
        taunter for the taunt duration.
      </p>

      <h2>Final Boss Phases</h2>
      <p>
        The final boss of each expedition has three phases, transitioning at{' '}
        {EXPEDITION_CONSTANTS.BOSS_PHASE_THRESHOLDS.map(
          (t) => `${(t * 100).toFixed(0)}%`
        ).join(' and ')}{' '}
        HP. Each phase uses a different action rotation with increasingly
        dangerous abilities. The boss may also summon adds during later phases
        (up to {EXPEDITION_CONSTANTS.MAX_TOTAL_SUMMONS} total summons).
      </p>

      <h2>Rewards: Expedition Tokens</h2>
      <p>
        Each cleared room awards expedition tokens. Token amounts scale with
        room difficulty and expedition tier.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Room Type</th>
            <th>Base Tokens</th>
            <th>Loot Multiplier</th>
          </tr>
        </thead>
        <tbody>
          {(['trash', 'elite', 'mini_boss', 'event', 'final_boss'] as const).map(
            (type) => (
              <tr key={type}>
                <td>{type.replace('_', ' ')}</td>
                <td>{EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[type]}</td>
                <td>{EXPEDITION_CONSTANTS.LOOT_MULTIPLIER[type]}x</td>
              </tr>
            )
          )}
        </tbody>
      </table>
      <FormulaBlock>
        <Out>tokens</Out> <Op>=</Op> <Var>baseTokens</Var> <Op>&times;</Op>{' '}
        <Var>tierMultiplier</Var>
        <Comment>
          {' '}
          {'//'} tier multipliers:{' '}
          {EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER.join(', ')}
        </Comment>
      </FormulaBlock>
      <p>
        Clearing the entire expedition grants a completion bonus of{' '}
        {EXPEDITION_CONSTANTS.COMPLETION_BONUS_MULTIPLIER}x the total tokens
        earned. Each room also awards{' '}
        {EXPEDITION_CONSTANTS.GUILD_XP_PER_ROOM} guild XP, with a{' '}
        {EXPEDITION_CONSTANTS.GUILD_XP_COMPLETION_BONUS} guild XP completion
        bonus.
      </p>

      <h2>Cooldowns &amp; Limits</h2>
      <ConstantsTable
        rows={[
          {
            name: 'SIGNUP_TURN_COST',
            value: EXPEDITION_CONSTANTS.SIGNUP_TURN_COST,
            description: 'Turns spent per player to join',
          },
          {
            name: 'WEEKLY_COOLDOWN',
            value: `${EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS / (24 * 60 * 60 * 1000)}d`,
            description: 'Cooldown before same expedition can be run again',
          },
          {
            name: 'BETWEEN_EXPEDITION_COOLDOWN',
            value: `${EXPEDITION_CONSTANTS.BETWEEN_EXPEDITION_COOLDOWN_MS / (60 * 60 * 1000)}h`,
            description: 'Minimum wait between any two expeditions',
          },
          {
            name: 'MAX_ATTEMPTS',
            value: EXPEDITION_CONSTANTS.MAX_ATTEMPTS,
            description: 'Maximum attempts per expedition instance',
          },
          {
            name: 'KO_RECOVERY_TURN_COST',
            value: EXPEDITION_CONSTANTS.KO_RECOVERY_TURN_COST,
            description: 'Turn cost to recover from knockout during expedition',
          },
        ]}
      />
    </WikiSection>
  );
}
