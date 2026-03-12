import type { Metadata } from 'next';
import { ITEM_RARITY_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Enemy, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Drop Tables',
  description:
    'Item drop rarity weights, weight shift per mob level, shift distribution, and zone event multiplier.',
};

const baseWeights = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_BY_RARITY;
const shiftDist = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_SHIFT_DISTRIBUTION;
const shiftTotal = shiftDist.uncommon + shiftDist.rare + shiftDist.epic + shiftDist.legendary;

export default function DropsPage() {
  return (
    <WikiSection
      title="Drop Tables"
      summary="When a mob drops an item, its rarity is determined by weighted random selection. Weights shift toward rarer items as mob level increases."
      related={[
        { label: 'Rarity System', href: '/wiki/items/rarity' },
        { label: 'Mob Tier Filtering', href: '/wiki/exploration/mob-tiers' },
        { label: 'Forge & Upgrades', href: '/wiki/items/forge' },
      ]}
    >
      <h2>Base Drop Weights</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Base Weight</th>
            <th>Base Probability</th>
          </tr>
        </thead>
        <tbody>
          {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => {
            const total = baseWeights.common + baseWeights.uncommon + baseWeights.rare + baseWeights.epic + baseWeights.legendary;
            return (
              <tr key={r}>
                <td className="capitalize">{r}</td>
                <td>{baseWeights[r]}</td>
                <td>{((baseWeights[r] / total) * 100).toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Weight Shift per Mob Level</h2>
      <p>
        For each mob level above 1, <strong>{ITEM_RARITY_CONSTANTS.DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE}</strong>{' '}
        weight is shifted from Common to higher rarities.
      </p>
      <FormulaBlock>
        <Out>totalShift</Out> <Op>=</Op> min<Op>(</Op>
        <Enemy>commonWeight</Enemy><Op>,</Op>{' '}
        <Op>(</Op><Enemy>mobLevel</Enemy> <Op>-</Op> <Const>1</Const><Op>)</Op>{' '}
        <Op>*</Op> <Const>{ITEM_RARITY_CONSTANTS.DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE}</Const>
        <Op>)</Op>
      </FormulaBlock>

      <h2>Shift Distribution</h2>
      <p>
        The total shift is distributed among higher rarities according to these
        ratios:
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Ratio</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {(['uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
            <tr key={r}>
              <td className="capitalize">{r}</td>
              <td>{shiftDist[r]}</td>
              <td>{((shiftDist[r] / shiftTotal) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Zone Event Multiplier</h2>
      <p>
        World events can apply a <code>dropChanceMultiplier</code> to the
        non-common weights. A multiplier of 2 doubles the effective weight of
        uncommon through legendary drops, while common weight remains reduced
        by the level-based shift only.
      </p>
      <FormulaBlock>
        <Out>adjustedWeight</Out> <Op>=</Op>{' '}
        <Op>(</Op><Var>baseWeight</Var> <Op>+</Op> <Var>levelShift</Var><Op>)</Op>{' '}
        <Op>*</Op> <Var>dropChanceMultiplier</Var>{' '}
        <Comment>(uncommon through legendary only)</Comment>
      </FormulaBlock>
    </WikiSection>
  );
}
