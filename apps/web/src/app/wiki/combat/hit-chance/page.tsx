import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import {
  HIT_CURVE_CONSTANTS,
  CHARACTER_CONSTANTS,
} from '@pocketrealm/shared';

const { Var, Out, Enemy, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Hit Chance - Pocketrealm Wiki',
  description:
    'Sigmoid hit-chance curves, hit and avoid scores, and how each combat mode adjusts the formula.',
};

const combatRelated = [
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
  { label: 'Critical Hits', href: '/wiki/combat/critical-hits' },
  { label: 'Combat Actions', href: '/wiki/combat/actions' },
  { label: 'Defensive Mechanics', href: '/wiki/combat/defensive-mechanics' },
  { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
];

const curveEntries = Object.entries(HIT_CURVE_CONSTANTS) as [
  string,
  (typeof HIT_CURVE_CONSTANTS)[keyof typeof HIT_CURVE_CONSTANTS],
][];

export default function HitChancePage() {
  return (
    <WikiSection
      title="Hit Chance"
      summary="Whether an attack connects is determined by a sigmoid curve that compares the attacker's hit score against the defender's avoid score. Different combat modes use different curve parameters."
      related={combatRelated}
    >
      <h2>The Sigmoid Formula</h2>
      <FormulaBlock>
        <Out>normalized</Out> <Op>=</Op> <Const>1</Const> <Op>/</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>+</Op>{' '}
        <Op>((</Op><Enemy>avoidScore</Enemy> <Op>+</Op> <Const>bias</Const>
        <Op>)</Op> <Op>/</Op> <Var>hitScore</Var><Op>)</Op>{' '}
        <Op>^</Op> <Const>exponent</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>hitChance</Out> <Op>=</Op> <Op>clamp(</Op>
        <Out>normalized</Out><Op>,</Op> <Const>minHitChance</Const><Op>,</Op>{' '}
        <Const>maxHitChance</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        A random value [0, 1) is rolled. If the roll is below hitChance the
        attack connects; otherwise it misses. The <code>bias</code> and{' '}
        <code>exponent</code> shift the curve to be more or less forgiving.
      </p>

      <h2>Hit Score</h2>
      <p>
        Hit score is built from skill level, equipment accuracy, and the
        relevant attribute, plus any per-action accuracy modifier.
      </p>
      <FormulaBlock>
        <Out>hitScore</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>skillLevel</Var> <Op>/</Op> <Const>2</Const><Op>)</Op> <Op>+</Op>{' '}
        <Var>equipmentAccuracy</Var> <Op>+</Op> <Var>attributeAccuracy</Var>{' '}
        <Op>+</Op> <Var>actionModifier</Var>
      </FormulaBlock>

      <h3>Attribute Accuracy by Style</h3>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Style</th>
            <th>Attribute</th>
            <th>Accuracy per Point</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Melee</td>
            <td>Strength</td>
            <td>{CHARACTER_CONSTANTS.ACCURACY_PER_STRENGTH}</td>
          </tr>
          <tr>
            <td>Ranged</td>
            <td>Dexterity</td>
            <td>{CHARACTER_CONSTANTS.ACCURACY_PER_DEXTERITY}</td>
          </tr>
          <tr>
            <td>Magic</td>
            <td>Intelligence</td>
            <td>{CHARACTER_CONSTANTS.ACCURACY_PER_INTELLIGENCE}</td>
          </tr>
        </tbody>
      </table>

      <h2>Avoid Score</h2>
      <FormulaBlock>
        <Out>avoidScore</Out> <Op>=</Op> <Enemy>dodge</Enemy> <Op>+</Op>{' '}
        <Enemy>evasion</Enemy>
        <Comment> {'//'} equipment dodge + attribute evasion</Comment>
      </FormulaBlock>

      <h2>Combat Mode Curves</h2>
      <p>
        Each combat context uses its own curve parameters, producing different
        hit-rate profiles:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Min Hit</th>
            <th>Max Hit</th>
            <th>Bias</th>
            <th>Exponent</th>
          </tr>
        </thead>
        <tbody>
          {curveEntries.map(([mode, curve]) => (
            <tr key={mode}>
              <td><code>{mode}</code></td>
              <td>{(curve.minHitChance * 100).toFixed(0)}%</td>
              <td>{(curve.maxHitChance * 100).toFixed(0)}%</td>
              <td>{curve.bias}</td>
              <td>{curve.exponent}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Curve Behaviour</h3>
      <ul>
        <li>
          <strong>PvP</strong> has the lowest floor ({(HIT_CURVE_CONSTANTS.pvp.minHitChance * 100).toFixed(0)}%)
          and highest exponent ({HIT_CURVE_CONSTANTS.pvp.exponent}), making
          evasion builds very effective against other players.
        </li>
        <li>
          <strong>PvE Open World</strong> is more forgiving with a {(HIT_CURVE_CONSTANTS.pve_open_world.minHitChance * 100).toFixed(0)}%
          floor so players always feel impactful.
        </li>
        <li>
          <strong>PvE Expedition</strong> sits between PvP and Open World,
          rewarding accuracy investment in longer fights.
        </li>
        <li>
          <strong>PvE Boss</strong> has the highest floor ({(HIT_CURVE_CONSTANTS.pve_boss.minHitChance * 100).toFixed(0)}%)
          and cap ({(HIT_CURVE_CONSTANTS.pve_boss.maxHitChance * 100).toFixed(0)}%) with the gentlest
          exponent ({HIT_CURVE_CONSTANTS.pve_boss.exponent}), ensuring all
          participants contribute during boss encounters.
        </li>
      </ul>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'ACCURACY_PER_STRENGTH',
            value: CHARACTER_CONSTANTS.ACCURACY_PER_STRENGTH,
            description: 'Hit score bonus per Strength point (melee)',
          },
          {
            name: 'ACCURACY_PER_DEXTERITY',
            value: CHARACTER_CONSTANTS.ACCURACY_PER_DEXTERITY,
            description: 'Hit score bonus per Dexterity point (ranged)',
          },
          {
            name: 'ACCURACY_PER_INTELLIGENCE',
            value: CHARACTER_CONSTANTS.ACCURACY_PER_INTELLIGENCE,
            description: 'Hit score bonus per Intelligence point (magic)',
          },
        ]}
      />
    </WikiSection>
  );
}
