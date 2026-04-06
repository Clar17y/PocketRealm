import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  HIT_CURVE_CONSTANTS,
  PVP_CONSTANTS,
  COMBAT_CONSTANTS,
} from '@pocketrealm/shared';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'PvP Combat - Pocketrealm Wiki',
  description:
    'How PvP combat differs from PvE: hit curves, ghost defenders, template engine, scouting, and challenge costs.',
};

const pvpRelated = [
  { label: 'ELO & Matchmaking', href: '/wiki/pvp/elo' },
  { label: 'Hit Chance', href: '/wiki/combat/hit-chance' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
];

const hitCurveKeys = Object.keys(HIT_CURVE_CONSTANTS) as (keyof typeof HIT_CURVE_CONSTANTS)[];

export default function PvpCombatPage() {
  return (
    <WikiSection
      title="PvP Combat"
      summary="Player vs player arena fights use the same core damage and action systems as PvE, but with key differences: a stricter hit curve, ghost defenders, and template-driven combat."
      related={pvpRelated}
    >
      <h2>Key Differences from PvE</h2>
      <ul>
        <li>
          <strong>Hit curve</strong> — PvP uses a much tighter hit curve with
          lower minimum hit chance and higher exponent, making accuracy vs
          evasion matter more.
        </li>
        <li>
          <strong>Ghost defender</strong> — the defender does not need to be
          online. A &ldquo;ghost&rdquo; copy fights using their saved combat
          template, current equipment, and maximum resources (full HP, stamina,
          and mana).
        </li>
        <li>
          <strong>Template combat engine</strong> — both attacker and defender
          fight using their active combat template. Each template slot defines
          an action and optional conditions (e.g., &ldquo;use heal when HP
          below 50%&rdquo;).
        </li>
        <li>
          <strong>No flee</strong> — PvP fights resolve to completion. There is
          no flee option.
        </li>
      </ul>

      <h2>Hit Curve Comparison</h2>
      <p>
        The hit curve formula is the same across all combat modes, but the
        parameters differ significantly:
      </p>
      <FormulaBlock>
        <Out>normalized</Out> <Op>=</Op> <Const>1</Const> <Op>/</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>+</Op>{' '}
        <Op>((</Op><Var>defenderEvasion</Var> <Op>+</Op> <Const>bias</Const>
        <Op>)</Op> <Op>/</Op> <Var>attackerAcc</Var><Op>)</Op>{' '}
        <Op>^</Op> <Const>exponent</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>hitChance</Out> <Op>=</Op> <Op>clamp(</Op>
        <Out>normalized</Out><Op>,</Op> <Const>min</Const><Op>,</Op>{' '}
        <Const>max</Const><Op>)</Op>
      </FormulaBlock>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Min Hit%</th>
            <th>Max Hit%</th>
            <th>Bias</th>
            <th>Exponent</th>
          </tr>
        </thead>
        <tbody>
          {hitCurveKeys.map((key) => {
            const curve = HIT_CURVE_CONSTANTS[key];
            return (
              <tr key={key}>
                <td><code>{key}</code></td>
                <td>{(curve.minHitChance * 100).toFixed(0)}%</td>
                <td>{(curve.maxHitChance * 100).toFixed(0)}%</td>
                <td>{curve.bias}</td>
                <td>{curve.exponent}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        PvP&rsquo;s low minimum ({(HIT_CURVE_CONSTANTS.pvp.minHitChance * 100).toFixed(0)}%)
        and high exponent ({HIT_CURVE_CONSTANTS.pvp.exponent}) mean that a
        player with poor accuracy against a high-evasion opponent will miss
        frequently. In contrast, open-world PvE floors hit chance at{' '}
        {(HIT_CURVE_CONSTANTS.pve_open_world.minHitChance * 100).toFixed(0)}%
        so players always have a baseline chance.
      </p>

      <h2>Template Combat Engine</h2>
      <p>
        PvP fights are fully automated using combat templates. Each player has
        up to {10} template slots that are evaluated in order
        each round. The first slot whose conditions are met determines the
        action for that round. If no conditions match, the player uses a basic
        attack.
      </p>
      <p>
        Template conditions can check: current HP percentage, current stamina
        or mana, active buffs or debuffs, round number, and opponent HP
        percentage. This allows for sophisticated strategies like opening with
        a buff, switching to heavy attacks, and healing at low HP.
      </p>

      <h2>Scouting</h2>
      <p>
        Before challenging an opponent, you can scout them for{' '}
        <Const>{PVP_CONSTANTS.SCOUT_TURN_COST}</Const> turns. Scouting reveals
        the opponent&rsquo;s combat stats, equipment, and skill levels, helping
        you decide whether to fight and how to configure your template.
      </p>

      <h2>Challenge Cost</h2>
      <p>
        Initiating a PvP challenge costs{' '}
        <Const>{PVP_CONSTANTS.CHALLENGE_TURN_COST}</Const> turns. Revenge
        matches (rematching someone who defeated you) cost only{' '}
        <Const>{PVP_CONSTANTS.REVENGE_TURN_COST}</Const> turns. After a fight,
        there is a <Const>{PVP_CONSTANTS.COOLDOWN_HOURS}</Const>-hour cooldown
        before you can challenge the same opponent again.
      </p>

      <h2>Requirements</h2>
      <p>
        Players must be at least character level{' '}
        <Const>{PVP_CONSTANTS.MIN_CHARACTER_LEVEL}</Const> to enter the arena.
      </p>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'CHALLENGE_TURN_COST',
            value: PVP_CONSTANTS.CHALLENGE_TURN_COST,
            description: 'Turns spent to initiate a PvP challenge',
          },
          {
            name: 'SCOUT_TURN_COST',
            value: PVP_CONSTANTS.SCOUT_TURN_COST,
            description: 'Turns spent to scout an opponent',
          },
          {
            name: 'REVENGE_TURN_COST',
            value: PVP_CONSTANTS.REVENGE_TURN_COST,
            description: 'Turns spent for a revenge challenge',
          },
          {
            name: 'COOLDOWN_HOURS',
            value: PVP_CONSTANTS.COOLDOWN_HOURS,
            description: 'Hours before re-challenging the same opponent',
          },
          {
            name: 'MIN_CHARACTER_LEVEL',
            value: PVP_CONSTANTS.MIN_CHARACTER_LEVEL,
            description: 'Minimum character level to access the arena',
          },
        ]}
      />
    </WikiSection>
  );
}
