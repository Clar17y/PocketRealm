import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { ENCOUNTER_SITE_ROLE_CONSTANTS, DURABILITY_CONSTANTS } from '@pocketrealm/shared';

const ROLE = ENCOUNTER_SITE_ROLE_CONSTANTS;
const STATS = ROLE.ROLE_STAT_MULTIPLIERS;
const ACTIONS = ROLE.ROLE_ACTION_MULTIPLIERS;
const REWARDS = ROLE.ROLE_REWARD_BONUSES;
const DEGRADE = DURABILITY_CONSTANTS.DEGRADATION_MULTIPLIER;

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const bonusPct = (value: number) => `+${pct(value)}`;
const mult = (value: number) => `${value}x`;

export const metadata: Metadata = {
  title: 'Elites & Mini-Bosses - Pocketrealm Wiki',
  description:
    'How promoted mob roles work: where Elites and Mini-Bosses appear, how they are labelled, their stat and reward scaling, combat rotations, and how they relate to the Bestiary.',
};

const related = [
  { label: 'Encounter Sites', href: '/wiki/exploration/encounter-sites' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
  { label: 'Durability & Selling', href: '/wiki/items/durability' },
  { label: 'XP & Leveling', href: '/wiki/progression/xp-leveling' },
];

export default function MobRolesPage() {
  return (
    <WikiSection
      title="Elites & Mini-Bosses"
      summary="Any mob you fight can be promoted to a tougher role. Elites and Mini-Bosses keep their base creature identity but gain scaled stats, larger rewards, and a unique combat rotation. They are marked everywhere they appear with a coloured role pill so you can spot them at a glance."
      related={related}
    >
      <h2>Roles</h2>
      <p>There are three instance-level mob roles:</p>
      <ul>
        <li>
          <strong>Normal</strong> — the baseline mob. No pill is shown.
        </li>
        <li>
          <strong>Elite</strong> — a tougher variant marked with a blue{' '}
          <strong>Elite</strong> pill. Hits harder, survives longer, and rewards more XP.
        </li>
        <li>
          <strong>Mini-Boss</strong> — the toughest variant, marked with a gold{' '}
          <strong>Mini-Boss</strong> pill. It has the largest stat scaling and a
          telegraphed finisher in its rotation.
        </li>
      </ul>
      <p>
        Roles are applied to a specific encounter, not baked into the creature.
        The same family member can show up as Normal in one fight and Elite in
        another. The pill appears next to the mob&apos;s name in encounter-site
        rooms, single-mob combat playback, and your combat history, so a promoted
        mob is always obvious before and during the fight.
      </p>

      <h2>Where They Appear</h2>
      <p>
        Promoted roles can show up during ordinary exploration as well as inside
        encounter sites:
      </p>
      <ul>
        <li>
          <strong>Normal exploration &amp; travel ambushes</strong> — each
          ambushing mob has a{' '}
          <strong>{pct(ROLE.NORMAL_EXPLORATION_ELITE_CHANCE)}</strong> chance to be
          an Elite. Single-mob ambushes are never Mini-Bosses.
        </li>
        <li>
          <strong>Encounter sites</strong> — each mob slot has a{' '}
          <strong>{pct(ROLE.ENCOUNTER_SITE_ELITE_CHANCE)}</strong> chance to roll
          Elite. Sites with{' '}
          <strong>{ROLE.MIN_ROOMS_FOR_PROMOTED_ROLES}+ rooms</strong> are
          guaranteed at least one Elite in the final room, and the final room has
          a <strong>{pct(ROLE.MINI_BOSS_CHANCE)}</strong> chance to add a
          Mini-Boss when there is still room for that guaranteed Elite. Larger
          sites guarantee additional Elite pressure in the closing rooms.
        </li>
      </ul>

      <h2>Stat Scaling</h2>
      <p>
        Role multipliers are applied <em>after</em> any prefix and active world or
        zone event modifiers, so a promoted mob stacks all three. The multipliers
        are:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Stat</th>
            <th>Elite</th>
            <th>Mini-Boss</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Max HP</td><td>{mult(STATS.elite.hp)}</td><td>{mult(STATS.mini_boss.hp)}</td></tr>
          <tr><td>Damage</td><td>{mult(STATS.elite.damageMax)}</td><td>{mult(STATS.mini_boss.damageMax)}</td></tr>
          <tr><td>Accuracy</td><td>{mult(STATS.elite.accuracy)}</td><td>{mult(STATS.mini_boss.accuracy)}</td></tr>
          <tr><td>Defence</td><td>{mult(STATS.elite.defence)}</td><td>{mult(STATS.mini_boss.defence)}</td></tr>
          <tr><td>Magic Defence</td><td>{mult(STATS.elite.magicDefence)}</td><td>{mult(STATS.mini_boss.magicDefence)}</td></tr>
          <tr><td>Evasion</td><td>{mult(STATS.elite.evasion)}</td><td>{mult(STATS.mini_boss.evasion)}</td></tr>
          <tr><td>XP reward</td><td>{mult(STATS.elite.xp)}</td><td>{mult(STATS.mini_boss.xp)}</td></tr>
        </tbody>
      </table>

      <h2>Combat Rotations</h2>
      <p>
        In encounter sites, promoted mobs do not just have bigger numbers — they
        fight differently. Encounter-site Elites and Mini-Bosses run a
        family-themed rotation (spider, wolf, bandit, treant, spirit, undead, or
        caster) with a setup move, a damage spike, and, for Mini-Bosses, a
        telegraphed finisher. Their special and spike actions are amplified
        relative to a normal mob:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Elite</th>
            <th>Mini-Boss</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Special damage</td><td>{mult(ACTIONS.elite.specialDamage)}</td><td>{mult(ACTIONS.mini_boss.specialDamage)}</td></tr>
          <tr><td>Spike damage</td><td>{mult(ACTIONS.elite.spikeDamage)}</td><td>{mult(ACTIONS.mini_boss.spikeDamage)}</td></tr>
          <tr><td>Debuff strength</td><td>{mult(ACTIONS.elite.debuffModifier)}</td><td>{mult(ACTIONS.mini_boss.debuffModifier)}</td></tr>
        </tbody>
      </table>
      <p>
        A Mini-Boss telegraphs its finisher a round in advance, giving you a
        window to defend, heal, or burst it down before the hit lands.
        Exploration and travel Elites use the same base combat pattern as their
        underlying mob, with only the role stat, XP, durability, and display
        changes applied.
      </p>

      <h2>Rewards &amp; Costs</h2>
      <p>
        Elites and Mini-Bosses award more combat XP ({mult(STATS.elite.xp)} and{' '}
        {mult(STATS.mini_boss.xp)} respectively) on top of any prefix XP bonus.
        They also wear your gear down faster: durability degradation is multiplied
        by <strong>{mult(DEGRADE.elite)}</strong> against Elites and{' '}
        <strong>{mult(DEGRADE.mini_boss)}</strong> against Mini-Bosses, versus{' '}
        {mult(DEGRADE.default)} for a normal mob.
      </p>
      <p>
        In completed encounter sites, defeated promoted mobs also improve the
        final chest. Each defeated Elite adds a{' '}
        <strong>{bonusPct(REWARDS.elite.materialRollMultiplier)}</strong>{' '}
        material-roll bonus and{' '}
        <strong>{REWARDS.elite.signatureRolls}</strong> extra signature material
        roll. Each defeated Mini-Boss adds a{' '}
        <strong>{bonusPct(REWARDS.mini_boss.materialRollMultiplier)}</strong>{' '}
        material-roll bonus and{' '}
        <strong>{REWARDS.mini_boss.signatureRolls}</strong> extra signature
        material rolls. These promoted-role bonuses improve site materials, not
        potion rewards or ordinary open-world mob drops.
      </p>

      <h2>Bestiary</h2>
      <p>
        Roles are an encounter-time property, so the Bestiary tracks them by base
        creature, not as separate entries. Defeating an Elite Cave Bat counts
        toward the same Cave Bat kill total as a normal one, and the Bestiary
        shows the creature&apos;s base (un-promoted) stats. Unlike{' '}
        <a href="/wiki/combat/mob-prefixes">prefixes</a>, which are recorded
        per-creature, Elite and Mini-Boss variants are not catalogued separately —
        the role pill in combat and combat history is where you see them.
      </p>

      <h2>Key Constants</h2>
      <ConstantsTable
        rows={[
          {
            name: 'NORMAL_EXPLORATION_ELITE_CHANCE',
            value: pct(ROLE.NORMAL_EXPLORATION_ELITE_CHANCE),
            description: 'Chance an exploration/travel ambush mob is an Elite',
          },
          {
            name: 'ENCOUNTER_SITE_ELITE_CHANCE',
            value: pct(ROLE.ENCOUNTER_SITE_ELITE_CHANCE),
            description: 'Per-slot chance an encounter-site mob rolls Elite',
          },
          {
            name: 'MINI_BOSS_CHANCE',
            value: pct(ROLE.MINI_BOSS_CHANCE),
            description: 'Chance the final room of a 3+ room site is led by a Mini-Boss',
          },
          {
            name: 'MIN_ROOMS_FOR_PROMOTED_ROLES',
            value: ROLE.MIN_ROOMS_FOR_PROMOTED_ROLES,
            description: 'Minimum site room count before guaranteed Elite / Mini-Boss placement applies',
          },
          {
            name: 'ROLE_REWARD_BONUSES.elite.materialRollMultiplier',
            value: bonusPct(REWARDS.elite.materialRollMultiplier),
            description: 'Final chest material-roll bonus per defeated encounter-site Elite',
          },
          {
            name: 'ROLE_REWARD_BONUSES.elite.signatureRolls',
            value: REWARDS.elite.signatureRolls,
            description: 'Extra final chest signature material rolls per defeated encounter-site Elite',
          },
          {
            name: 'ROLE_REWARD_BONUSES.mini_boss.materialRollMultiplier',
            value: bonusPct(REWARDS.mini_boss.materialRollMultiplier),
            description: 'Final chest material-roll bonus per defeated encounter-site Mini-Boss',
          },
          {
            name: 'ROLE_REWARD_BONUSES.mini_boss.signatureRolls',
            value: REWARDS.mini_boss.signatureRolls,
            description: 'Extra final chest signature material rolls per defeated encounter-site Mini-Boss',
          },
          {
            name: 'DEGRADATION_MULTIPLIER.elite',
            value: mult(DEGRADE.elite),
            description: 'Durability degradation multiplier when fighting an Elite',
          },
          {
            name: 'DEGRADATION_MULTIPLIER.mini_boss',
            value: mult(DEGRADE.mini_boss),
            description: 'Durability degradation multiplier when fighting a Mini-Boss',
          },
        ]}
      />
    </WikiSection>
  );
}
