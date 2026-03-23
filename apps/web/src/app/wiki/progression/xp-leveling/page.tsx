import type { Metadata } from 'next';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';
import { SKILL_CONSTANTS, CHARACTER_CONSTANTS } from '@pocketrealm/shared';
import { xpForLevel } from '@pocketrealm/game-engine';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'XP & Leveling - Pocketrealm Wiki',
  description:
    'XP formula, leveling curve, character XP conversion, and an XP-per-level table from 1 to 100.',
};

const progressionRelated = [
  { label: 'Efficiency & Caps', href: '/wiki/progression/efficiency' },
  { label: 'Skill Points', href: '/wiki/progression/skill-points' },
  { label: 'Damage Calculation', href: '/wiki/combat/damage' },
];

const sampleLevels = [1, 2, 3, 5, 7, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

const xpTable = sampleLevels.map((level) => ({
  level,
  xpRequired: xpForLevel(level),
}));

export default function XpLevelingPage() {
  return (
    <WikiSection
      title="XP & Leveling"
      summary="Skills and characters level up by accumulating XP. The XP curve follows a power function, so higher levels require exponentially more XP."
      related={progressionRelated}
    >
      <h2>Skill XP Formula</h2>
      <p>
        The total XP required to reach a given skill level uses a power curve
        with a reduced base for early levels (1&ndash;9) so new players progress
        faster:
      </p>
      <FormulaBlock>
        <Var>base</Var> <Op>=</Op> <Op>min(</Op>
        <Const>{SKILL_CONSTANTS.XP_BASE}</Const><Op>,</Op>{' '}
        <Var>level</Var> <Op>&times;</Op>{' '}
        <Const>{SKILL_CONSTANTS.XP_EARLY_LEVEL_SCALE}</Const><Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>xpForLevel</Out><Op>(</Op><Var>level</Var><Op>)</Op> <Op>=</Op>{' '}
        <Op>floor(</Op><Var>base</Var> <Op>&times;</Op>{' '}
        <Var>level</Var><Op>^</Op>
        <Const>{SKILL_CONSTANTS.XP_EXPONENT}</Const><Op>)</Op>
        <Comment> {'//'} level 1 = 0 XP</Comment>
      </FormulaBlock>
      <p>
        At level 10 and above the base reaches{' '}
        <Const>{SKILL_CONSTANTS.XP_BASE}</Const> and the curve is unchanged.
      </p>
      <p>
        Level 1 requires 0 XP (starting level). The maximum skill level is{' '}
        <Const>{SKILL_CONSTANTS.MAX_LEVEL}</Const>.
      </p>

      <h2>Level-from-XP Inverse</h2>
      <p>
        To determine what level a given XP total corresponds to, the game
        iterates from level 1 upward until{' '}
        <code>xpForLevel(level + 1)</code> exceeds the player&rsquo;s total XP.
        This gives the highest level the player has fully reached.
      </p>

      <h2>Character XP</h2>
      <p>
        Skill XP also contributes to your overall character level. After
        efficiency is applied to the skill XP gain, a fraction is converted to
        character XP:
      </p>
      <FormulaBlock>
        <Out>characterXp</Out> <Op>=</Op> <Op>floor(</Op>
        <Var>skillXpAfterEfficiency</Var> <Op>&times;</Op>{' '}
        <Const>{CHARACTER_CONSTANTS.XP_RATIO}</Const><Op>)</Op>
        <Comment> {'//'} XP_RATIO</Comment>
      </FormulaBlock>
      <p>
        Character level uses the same <code>xpForLevel</code> formula with a
        max level of <Const>{CHARACTER_CONSTANTS.MAX_LEVEL}</Const>. Since
        character XP accumulates from all skill training, character level
        naturally lags behind individual skill levels.
      </p>

      <h2>XP Table</h2>
      <p>
        Total XP required to reach each level (computed from the formula):
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Level</th>
            <th>Total XP Required</th>
            <th>XP to Next Level</th>
          </tr>
        </thead>
        <tbody>
          {xpTable.map((row, i) => {
            const nextRow = xpTable[i + 1];
            const xpToNext = nextRow
              ? (nextRow.xpRequired - row.xpRequired).toLocaleString()
              : row.level >= SKILL_CONSTANTS.MAX_LEVEL
                ? 'Max'
                : '...';
            return (
              <tr key={row.level}>
                <td>{row.level}</td>
                <td>{row.xpRequired.toLocaleString()}</td>
                <td>{xpToNext}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Constants Reference</h2>
      <ConstantsTable
        rows={[
          {
            name: 'XP_BASE',
            value: SKILL_CONSTANTS.XP_BASE,
            description: 'Base multiplier for the XP curve (at level 10+)',
          },
          {
            name: 'XP_EARLY_LEVEL_SCALE',
            value: SKILL_CONSTANTS.XP_EARLY_LEVEL_SCALE,
            description:
              'Per-level base scale for levels 1-9 (effective base = min(XP_BASE, level × scale))',
          },
          {
            name: 'XP_EXPONENT',
            value: SKILL_CONSTANTS.XP_EXPONENT,
            description: 'Power exponent controlling curve steepness',
          },
          {
            name: 'MAX_LEVEL',
            value: SKILL_CONSTANTS.MAX_LEVEL,
            description: 'Maximum skill level',
          },
          {
            name: 'XP_RATIO',
            value: CHARACTER_CONSTANTS.XP_RATIO,
            description: 'Fraction of skill XP converted to character XP',
          },
          {
            name: 'CHARACTER_MAX_LEVEL',
            value: CHARACTER_CONSTANTS.MAX_LEVEL,
            description: 'Maximum character level',
          },
        ]}
      />
    </WikiSection>
  );
}
