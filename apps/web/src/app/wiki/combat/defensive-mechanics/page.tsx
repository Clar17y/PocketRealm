import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { COMBAT_ACTION_CONSTANTS } from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Defensive Mechanics - Pocketrealm Wiki',
  description:
    'Counter, Ward, Defend, channeling vulnerability, and the rock-paper-scissors dynamic of combat defence.',
};

const combatRelated = [
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Buffs & Debuffs', href: '/wiki/combat/buffs-debuffs' },
  { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
];

export default function DefensiveMechanicsPage() {
  return (
    <WikiSection
      title="Defensive Mechanics"
      summary="Combat offers three defensive stances that form a rock-paper-scissors triangle, plus a universal fallback. Choosing the right defence against the right attack type is essential."
      related={combatRelated}
    >
      <h2>Defend</h2>
      <p>
        The universal fallback action. Defend reduces all incoming damage by a
        flat percentage and costs no resources. When a combatant runs out of
        stamina and mana, they automatically use Defend (action exhaustion
        fallback).
      </p>
      <FormulaBlock>
        <Out>damageTaken</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>incomingDamage</Var> <Op>&times;</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>-</Op>{' '}
        <Const>{COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION}</Const><Op>)</Op>
        <Op>)</Op>
        <Comment>
          {' '}
          {'//'} {(COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION * 100).toFixed(0)}% reduction
        </Comment>
      </FormulaBlock>

      <h2>Counter</h2>
      <p>
        Counter anticipates a <strong>physical</strong> attack and avoids it
        entirely. If the opponent uses a magic attack or spell instead, the
        Counter is wasted and the defender takes full damage.
      </p>
      <ul>
        <li>Cost: {COMBAT_ACTION_CONSTANTS.COUNTER_STAMINA_COST} stamina</li>
        <li>Avoids: physical offensive actions (light/normal/heavy attack, physical skill attacks)</li>
        <li>Wasted against: magic spells, DoTs, debuffs</li>
      </ul>

      <h2>Ward</h2>
      <p>
        Ward raises a magical barrier that <strong>resists magic</strong>{' '}
        attacks. If the opponent uses a physical attack, the Ward is wasted.
      </p>
      <ul>
        <li>Cost: {COMBAT_ACTION_CONSTANTS.WARD_MANA_COST} mana</li>
        <li>Resists: magic damage spells, magic DoT applications</li>
        <li>Wasted against: physical attacks, physical skill attacks</li>
      </ul>

      <h2>Rock-Paper-Scissors Summary</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Attacker Uses</th>
            <th>Counter</th>
            <th>Ward</th>
            <th>Defend</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Physical Attack</td>
            <td><strong>Avoided</strong></td>
            <td>Full damage</td>
            <td>{(COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION * 100).toFixed(0)}% reduced</td>
          </tr>
          <tr>
            <td>Magic Spell</td>
            <td>Full damage</td>
            <td><strong>Resisted</strong></td>
            <td>{(COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION * 100).toFixed(0)}% reduced</td>
          </tr>
          <tr>
            <td>Buff / Debuff</td>
            <td>No effect</td>
            <td>No effect</td>
            <td>No damage to reduce</td>
          </tr>
        </tbody>
      </table>
      <p>
        Defend is always safe but offers less protection than a correct Counter
        or Ward. Skilled players read their opponent&apos;s patterns to choose
        Counter or Ward at the right time.
      </p>

      <h2>Channeling Vulnerability</h2>
      <p>
        Certain actions (Heavy Attack, Devastating Blow, Titan&apos;s Wrath,
        Meteor Strike, potion use, heals) mark the user as{' '}
        <strong>channeling</strong>. If an opponent hits a channeling target,
        they deal bonus damage:
      </p>
      <FormulaBlock>
        <Out>bonusDamage</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>normalDamage</Var> <Op>&times;</Op>{' '}
        <Const>{COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE}</Const>
        <Op>)</Op>
        <Comment>
          {' '}
          {'//'} {COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE}x multiplier
        </Comment>
      </FormulaBlock>
      <p>
        This makes high-damage channeled abilities a calculated risk -- they
        deal more damage but leave you vulnerable if the opponent attacks on the
        same round.
      </p>

      <h2>Action Exhaustion</h2>
      <p>
        When a combatant has insufficient stamina and mana for any action in
        their template, they automatically fall back to <strong>Defend</strong>.
        Defend is free (0 stamina, 0 mana) and always available, ensuring
        combat never stalls.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'DEFEND_DAMAGE_REDUCTION',
            value: `${(COMBAT_ACTION_CONSTANTS.DEFEND_DAMAGE_REDUCTION * 100).toFixed(0)}%`,
            description: 'Percentage of incoming damage negated by Defend',
          },
          {
            name: 'COUNTER_STAMINA_COST',
            value: COMBAT_ACTION_CONSTANTS.COUNTER_STAMINA_COST,
            description: 'Stamina cost to use Counter',
          },
          {
            name: 'WARD_MANA_COST',
            value: COMBAT_ACTION_CONSTANTS.WARD_MANA_COST,
            description: 'Mana cost to use Ward',
          },
          {
            name: 'CHANNELING_BONUS_DAMAGE',
            value: `${COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE}x`,
            description: 'Damage multiplier applied when hitting a channeling target',
          },
          {
            name: 'MAX_ACTIVE_BUFFS',
            value: COMBAT_ACTION_CONSTANTS.MAX_ACTIVE_BUFFS,
            description: 'Maximum simultaneous buffs (oldest replaced when exceeded)',
          },
        ]}
      />
    </WikiSection>
  );
}
