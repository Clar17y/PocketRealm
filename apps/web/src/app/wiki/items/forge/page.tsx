import type { Metadata } from 'next';
import { ITEM_RARITY_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Forge & Upgrades',
  description:
    'Forge upgrade success rates, luck bonus, reroll costs, and turn cost discount per crafting level.',
};

const upgradeRarities = ['common', 'uncommon', 'rare', 'epic'] as const;
const rerollRarities = ['uncommon', 'rare', 'epic', 'legendary'] as const;

export default function ForgePage() {
  return (
    <WikiSection
      title="Forge & Upgrades"
      summary="The forge lets players upgrade item rarity or reroll bonus stats. Success chance depends on current rarity and equipped luck."
      related={[
        { label: 'Rarity System', href: '/wiki/items/rarity' },
        { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
        { label: 'Durability & Selling', href: '/wiki/items/durability' },
      ]}
    >
      <h2>Upgrade Success Chance</h2>
      <FormulaBlock>
        <Out>successChance</Out> <Op>=</Op> clamp<Op>(</Op>
        <Var>baseChance</Var> <Op>+</Op> min<Op>(</Op>
        <Var>luckStat</Var> <Op>*</Op>{' '}
        <Const>{ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_PER_POINT}</Const>
        <Op>,</Op> <Const>{ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_CAP}</Const>
        <Op>)</Op><Op>,</Op> <Const>0</Const><Op>,</Op> <Const>1</Const><Op>)</Op>
      </FormulaBlock>

      <table className="wiki-table">
        <thead>
          <tr>
            <th>Current Rarity</th>
            <th>Base Success</th>
            <th>Turn Cost</th>
            <th>Upgrades To</th>
          </tr>
        </thead>
        <tbody>
          {upgradeRarities.map((r) => {
            const next = r === 'common' ? 'uncommon' : r === 'uncommon' ? 'rare' : r === 'rare' ? 'epic' : 'legendary';
            return (
              <tr key={r}>
                <td className="capitalize">{r}</td>
                <td>{(ITEM_RARITY_CONSTANTS.UPGRADE_SUCCESS_BY_RARITY[r] * 100).toFixed(0)}%</td>
                <td>{ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY[r].toLocaleString()}</td>
                <td className="capitalize">{next}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConstantsTable
        rows={[
          { name: 'FORGE_LUCK_SUCCESS_BONUS_PER_POINT', value: ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_PER_POINT, description: 'Success chance bonus per point of luck' },
          { name: 'FORGE_LUCK_SUCCESS_BONUS_CAP', value: `${(ITEM_RARITY_CONSTANTS.FORGE_LUCK_SUCCESS_BONUS_CAP * 100).toFixed(0)}%`, description: 'Maximum luck bonus to success chance' },
        ]}
      />

      <h2>Reroll Costs</h2>
      <p>
        Rerolling replaces all bonus stats on an item while keeping its rarity.
        Common items have no bonus stats and cannot be rerolled.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Reroll Turn Cost</th>
          </tr>
        </thead>
        <tbody>
          {rerollRarities.map((r) => (
            <tr key={r}>
              <td className="capitalize">{r}</td>
              <td>{ITEM_RARITY_CONSTANTS.REROLL_TURN_COST_BY_RARITY[r].toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Turn Cost Discount</h2>
      <p>
        If your crafting skill level exceeds the recipe requirement, forge
        operation turn costs are discounted.
      </p>
      <FormulaBlock>
        <Out>discount</Out> <Op>=</Op> <Var>levelsAbove</Var> <Op>*</Op>{' '}
        <Const>{(ITEM_RARITY_CONSTANTS.FORGE_DISCOUNT_PER_LEVEL_ABOVE * 100).toFixed(0)}%</Const>{' '}
        <Comment>(max {ITEM_RARITY_CONSTANTS.FORGE_DISCOUNT_MAX_LEVELS} levels = free)</Comment>
      </FormulaBlock>
      <FormulaBlock>
        <Out>actualCost</Out> <Op>=</Op> floor<Op>(</Op>
        <Var>baseCost</Var> <Op>*</Op> <Op>(</Op><Const>1</Const> <Op>-</Op>{' '}
        <Var>discount</Var><Op>)</Op><Op>)</Op>
      </FormulaBlock>
    </WikiSection>
  );
}
