import type { Metadata } from 'next';
import { FLEE_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Enemy, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Flee Mechanics',
  description:
    'Flee chance calculation, three flee outcomes (clean escape, wounded escape, knockout), and associated penalties.',
};

export default function FleePage() {
  return (
    <WikiSection
      title="Flee Mechanics"
      summary="When combat is going badly, players can attempt to flee. The chance of success depends on evasion level relative to the mob's level."
      related={[
        { label: 'Health', href: '/wiki/resources/health' },
        { label: 'Damage Calculation', href: '/wiki/combat/damage' },
        { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
      ]}
    >
      <h2>Flee Chance</h2>
      <FormulaBlock>
        <Out>fleeChance</Out> <Op>=</Op> clamp<Op>(</Op>
        <Const>{FLEE_CONSTANTS.BASE_FLEE_CHANCE}</Const> <Op>+</Op>{' '}
        <Op>(</Op><Var>evasionLevel</Var> <Op>-</Op>{' '}
        <Enemy>mobLevel</Enemy><Op>)</Op> <Op>*</Op>{' '}
        <Const>{FLEE_CONSTANTS.FLEE_CHANCE_PER_LEVEL_DIFF}</Const>
        <Op>,</Op> <Const>{FLEE_CONSTANTS.MIN_FLEE_CHANCE}</Const>
        <Op>,</Op> <Const>{FLEE_CONSTANTS.MAX_FLEE_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_FLEE_CHANCE', value: `${(FLEE_CONSTANTS.BASE_FLEE_CHANCE * 100).toFixed(0)}%`, description: 'Base flee chance when evasion equals mob level' },
          { name: 'FLEE_CHANCE_PER_LEVEL_DIFF', value: `${(FLEE_CONSTANTS.FLEE_CHANCE_PER_LEVEL_DIFF * 100).toFixed(0)}%`, description: 'Adjustment per level difference (evasion - mob)' },
          { name: 'MIN_FLEE_CHANCE', value: `${(FLEE_CONSTANTS.MIN_FLEE_CHANCE * 100).toFixed(0)}%`, description: 'Floor flee chance against much higher mobs' },
          { name: 'MAX_FLEE_CHANCE', value: `${(FLEE_CONSTANTS.MAX_FLEE_CHANCE * 100).toFixed(0)}%`, description: 'Ceiling flee chance against much lower mobs' },
        ]}
      />

      <h2>Flee Outcomes</h2>
      <p>
        A random roll determines the outcome. If the roll is below the flee
        chance, the escape succeeds. Within the success range, the top{' '}
        {((1 - FLEE_CONSTANTS.HIGH_SUCCESS_THRESHOLD) * 100).toFixed(0)}% of
        rolls yield a clean escape; the rest produce a wounded escape. Failing
        the roll results in a knockout.
      </p>

      <h3>Clean Escape</h3>
      <FormulaBlock>
        <Out>remainingHP</Out> <Op>=</Op> <Var>maxHP</Var> <Op>*</Op>{' '}
        <Const>{FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT}</Const>{' '}
        <Comment>({(FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT * 100).toFixed(0)}% of max HP, minimum 1)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>goldLost</Out> <Op>=</Op> <Var>currentGold</Var> <Op>*</Op>{' '}
        <Const>{FLEE_CONSTANTS.GOLD_LOSS_MINOR}</Const>{' '}
        <Comment>({(FLEE_CONSTANTS.GOLD_LOSS_MINOR * 100).toFixed(0)}% gold loss)</Comment>
      </FormulaBlock>

      <h3>Wounded Escape</h3>
      <FormulaBlock>
        <Out>remainingHP</Out> <Op>=</Op>{' '}
        <Const>{FLEE_CONSTANTS.PARTIAL_SUCCESS_HP}</Const>{' '}
        <Comment>(always 1 HP)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>goldLost</Out> <Op>=</Op> <Var>currentGold</Var> <Op>*</Op>{' '}
        <Const>{FLEE_CONSTANTS.GOLD_LOSS_MODERATE}</Const>{' '}
        <Comment>({(FLEE_CONSTANTS.GOLD_LOSS_MODERATE * 100).toFixed(0)}% gold loss)</Comment>
      </FormulaBlock>

      <h3>Knockout (Failed Flee)</h3>
      <FormulaBlock>
        <Out>remainingHP</Out> <Op>=</Op> <Const>0</Const>{' '}
        <Comment>(enters recovery state)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>goldLost</Out> <Op>=</Op> <Var>currentGold</Var> <Op>*</Op>{' '}
        <Const>{FLEE_CONSTANTS.GOLD_LOSS_SEVERE}</Const>{' '}
        <Comment>({(FLEE_CONSTANTS.GOLD_LOSS_SEVERE * 100).toFixed(0)}% gold loss)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>recoveryCost</Out> <Op>=</Op> <Var>maxHP</Var>{' '}
        <Comment>(1 turn per max HP)</Comment>
      </FormulaBlock>

      <h2>Outcome Summary</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Outcome</th>
            <th>HP Remaining</th>
            <th>Gold Loss</th>
            <th>Recovery Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Clean Escape</td>
            <td>{(FLEE_CONSTANTS.HIGH_SUCCESS_HP_PERCENT * 100).toFixed(0)}% max HP</td>
            <td>{(FLEE_CONSTANTS.GOLD_LOSS_MINOR * 100).toFixed(0)}%</td>
            <td>None</td>
          </tr>
          <tr>
            <td>Wounded Escape</td>
            <td>{FLEE_CONSTANTS.PARTIAL_SUCCESS_HP} HP</td>
            <td>{(FLEE_CONSTANTS.GOLD_LOSS_MODERATE * 100).toFixed(0)}%</td>
            <td>None</td>
          </tr>
          <tr>
            <td>Knockout</td>
            <td>0 HP</td>
            <td>{(FLEE_CONSTANTS.GOLD_LOSS_SEVERE * 100).toFixed(0)}%</td>
            <td>maxHP turns</td>
          </tr>
        </tbody>
      </table>
    </WikiSection>
  );
}
