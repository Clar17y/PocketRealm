import type { Metadata } from 'next';
import { GEM_CRIT_CONSTANTS, GATHERING_CONSTANTS, PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Gathering & Gems',
  description:
    'Gem crit chance formula, Champion bonuses, gathering yield scaling, turn costs, and XP per action.',
};

export default function GatheringPage() {
  return (
    <WikiSection
      title="Gathering & Gems"
      summary="Gathering actions mine resource nodes for materials. Each action has a chance to yield a bonus precious gem, scaling with skill level, luck, and Champion bonuses."
      related={[
        { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
        { label: 'Salvage', href: '/wiki/crafting/salvage' },
        { label: 'Rarity System', href: '/wiki/items/rarity' },
      ]}
    >
      <h2>Gem Crit Chance</h2>
      <FormulaBlock>
        <Var>levelsAbove</Var> <Op>=</Op> max<Op>(</Op><Const>0</Const>
        <Op>,</Op> <Var>skillLevel</Var> <Op>-</Op> <Var>nodeLevel</Var>
        <Op>)</Op>
      </FormulaBlock>
      <FormulaBlock>
        <Out>gemCritChance</Out> <Op>=</Op> min<Op>(</Op>
        <Const>{GEM_CRIT_CONSTANTS.BASE_CHANCE}</Const> <Op>+</Op>{' '}
        <Var>levelsAbove</Var> <Op>*</Op>{' '}
        <Const>{GEM_CRIT_CONSTANTS.LEVEL_BONUS}</Const> <Op>+</Op>{' '}
        <Var>luck</Var> <Op>*</Op>{' '}
        <Const>{GEM_CRIT_CONSTANTS.LUCK_BONUS}</Const>
        <Op>,</Op> <Const>{GEM_CRIT_CONSTANTS.MAX_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_CHANCE', value: `${(GEM_CRIT_CONSTANTS.BASE_CHANCE * 100).toFixed(0)}%`, description: 'Base gem crit chance' },
          { name: 'LEVEL_BONUS', value: `+${(GEM_CRIT_CONSTANTS.LEVEL_BONUS * 100).toFixed(1)}%`, description: 'Additional chance per skill level above node' },
          { name: 'LUCK_BONUS', value: `+${(GEM_CRIT_CONSTANTS.LUCK_BONUS * 100).toFixed(1)}%`, description: 'Additional chance per point of luck' },
          { name: 'MAX_CHANCE', value: `${(GEM_CRIT_CONSTANTS.MAX_CHANCE * 100).toFixed(0)}%`, description: 'Maximum gem crit chance cap' },
          { name: 'BONUS_MULTIPLIER', value: `${PREMIUM_CONSTANTS.BONUS_MULTIPLIER}x`, description: 'Champion multiplier applied to gem crit chance and final yield' },
        ]}
      />

      <h2>Gathering Yield</h2>
      <FormulaBlock>
        <Out>yield</Out> <Op>=</Op>{' '}
        <Const>{GATHERING_CONSTANTS.BASE_YIELD}</Const> <Op>*</Op>{' '}
        <Op>(</Op><Const>1</Const> <Op>+</Op> <Var>levelsAbove</Var>{' '}
        <Op>*</Op> <Const>{GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL}</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        Each gathering action produces a base yield that increases by{' '}
        <strong>{(GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL * 100).toFixed(0)}%</strong>{' '}
        per skill level above the node requirement.
      </p>

      <h2>Champion Bonus</h2>
      <p>
        Champion supporters multiply both their final gathering yield and gem
        crit chance by <strong>{PREMIUM_CONSTANTS.BONUS_MULTIPLIER}x</strong>.
        Gem crit chance still respects the normal maximum cap.
      </p>
      <FormulaBlock>
        <Out>totalYieldMultiplier</Out> <Op>=</Op> <Var>yieldMultiplier</Var>{' '}
        <Op>&times;</Op> <Op>(</Op><Const>1</Const> <Op>+</Op>{' '}
        <Var>otherYieldBonuses</Var><Op>)</Op> <Op>&times;</Op>{' '}
        <Const>{PREMIUM_CONSTANTS.BONUS_MULTIPLIER}</Const>
      </FormulaBlock>
      <FormulaBlock>
        <Out>championGemCritChance</Out> <Op>=</Op> min<Op>(</Op>
        <Var>baseGemCritChance</Var> <Op>&times;</Op>{' '}
        <Const>{PREMIUM_CONSTANTS.BONUS_MULTIPLIER}</Const><Op>,</Op>{' '}
        <Const>{GEM_CRIT_CONSTANTS.MAX_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <h2>Turn Cost &amp; XP</h2>
      <ConstantsTable
        rows={[
          { name: 'BASE_TURN_COST', value: GATHERING_CONSTANTS.BASE_TURN_COST, description: 'Turns per gathering action' },
          { name: 'XP_PER_ACTION_BASE', value: GATHERING_CONSTANTS.XP_PER_ACTION_BASE, description: 'Base XP awarded per action' },
          { name: 'XP_LEVEL_SCALING_DIVISOR', value: GATHERING_CONSTANTS.XP_LEVEL_SCALING_DIVISOR, description: 'Bonus XP = floor(nodeLevel / divisor)' },
        ]}
      />
    </WikiSection>
  );
}
