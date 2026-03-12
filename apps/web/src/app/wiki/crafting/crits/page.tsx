import type { Metadata } from 'next';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Crafting Crits',
  description:
    'Crafting critical hit chance, rare and epic craft probabilities, crit rarity tiers, and bonus stat ranges.',
};

export default function CraftingCritsPage() {
  return (
    <WikiSection
      title="Crafting Crits"
      summary="Crafting an item has a chance to produce a higher-rarity result. The crit chance scales with skill level above recipe requirement and equipped luck."
      related={[
        { label: 'Rarity System', href: '/wiki/items/rarity' },
        { label: 'Gathering & Gems', href: '/wiki/crafting/gathering' },
        { label: 'Salvage', href: '/wiki/crafting/salvage' },
      ]}
    >
      <h2>Crit Chance</h2>
      <FormulaBlock>
        <Var>levelDelta</Var> <Op>=</Op> <Var>skillLevel</Var> <Op>-</Op>{' '}
        <Var>requiredLevel</Var>
      </FormulaBlock>
      <FormulaBlock>
        <Out>critChance</Out> <Op>=</Op> clamp<Op>(</Op>
        <Const>{CRAFTING_CONSTANTS.BASE_CRIT_CHANCE}</Const> <Op>+</Op>{' '}
        <Var>levelDelta</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.CRIT_CHANCE_PER_LEVEL}</Const> <Op>+</Op>{' '}
        <Var>luck</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT}</Const>
        <Op>,</Op> <Const>{CRAFTING_CONSTANTS.MIN_CRIT_CHANCE}</Const>
        <Op>,</Op> <Const>{CRAFTING_CONSTANTS.MAX_CRIT_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <ConstantsTable
        rows={[
          { name: 'BASE_CRIT_CHANCE', value: `${(CRAFTING_CONSTANTS.BASE_CRIT_CHANCE * 100).toFixed(0)}%`, description: 'Crit chance when skill level matches recipe requirement' },
          { name: 'CRIT_CHANCE_PER_LEVEL', value: `+${(CRAFTING_CONSTANTS.CRIT_CHANCE_PER_LEVEL * 100).toFixed(0)}%`, description: 'Additional crit chance per level above requirement' },
          { name: 'LUCK_CRIT_BONUS_PER_POINT', value: `+${(CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT * 100).toFixed(1)}%`, description: 'Additional crit chance per point of luck' },
          { name: 'MIN_CRIT_CHANCE', value: `${(CRAFTING_CONSTANTS.MIN_CRIT_CHANCE * 100).toFixed(0)}%`, description: 'Floor crit chance' },
          { name: 'MAX_CRIT_CHANCE', value: `${(CRAFTING_CONSTANTS.MAX_CRIT_CHANCE * 100).toFixed(0)}%`, description: 'Ceiling crit chance' },
        ]}
      />

      <h2>Rare Craft Chance</h2>
      <p>
        When a crit succeeds, there is a separate chance the result is rare
        instead of uncommon.
      </p>
      <FormulaBlock>
        <Out>rareCraftChance</Out> <Op>=</Op> clamp<Op>(</Op>
        <Const>{CRAFTING_CONSTANTS.RARE_CRAFT_BASE_CHANCE}</Const> <Op>+</Op>{' '}
        <Var>levelDelta</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.RARE_CRAFT_CHANCE_PER_LEVEL}</Const> <Op>+</Op>{' '}
        <Var>luck</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.RARE_CRAFT_LUCK_BONUS_PER_POINT}</Const>
        <Op>,</Op> <Const>0</Const>
        <Op>,</Op> <Const>{CRAFTING_CONSTANTS.RARE_CRAFT_MAX_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <h2>Epic Craft Chance</h2>
      <p>
        An even smaller chance exists for the crit to produce an epic item.
      </p>
      <FormulaBlock>
        <Out>epicCraftChance</Out> <Op>=</Op> clamp<Op>(</Op>
        <Const>{CRAFTING_CONSTANTS.EPIC_CRAFT_BASE_CHANCE}</Const> <Op>+</Op>{' '}
        <Var>levelDelta</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.EPIC_CRAFT_CHANCE_PER_LEVEL}</Const> <Op>+</Op>{' '}
        <Var>luck</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.EPIC_CRAFT_LUCK_BONUS_PER_POINT}</Const>
        <Op>,</Op> <Const>0</Const>
        <Op>,</Op> <Const>{CRAFTING_CONSTANTS.EPIC_CRAFT_MAX_CHANCE}</Const><Op>)</Op>
      </FormulaBlock>

      <h2>Crit Rarity Resolution</h2>
      <p>
        When the crit roll succeeds, the resulting rarity is determined by
        comparing the roll against the epic and rare thresholds:
      </p>
      <ol>
        <li>If roll {'<'} epicCraftChance: <strong>Epic</strong></li>
        <li>Else if roll {'<'} rareCraftChance: <strong>Rare</strong></li>
        <li>Otherwise: <strong>Uncommon</strong></li>
      </ol>

      <h2>Bonus Stat Ranges</h2>
      <p>
        A crit adds a random bonus stat to the item. The bonus value is a
        percentage of the item&apos;s base stat.
      </p>
      <ConstantsTable
        rows={[
          { name: 'MIN_BONUS_PERCENT', value: `${(CRAFTING_CONSTANTS.MIN_BONUS_PERCENT * 100).toFixed(0)}%`, description: 'Minimum crit bonus as percent of base stat' },
          { name: 'MAX_BONUS_PERCENT', value: `${(CRAFTING_CONSTANTS.MAX_BONUS_PERCENT * 100).toFixed(0)}%`, description: 'Maximum crit bonus as percent of base stat' },
          { name: 'MIN_BONUS_MAGNITUDE', value: CRAFTING_CONSTANTS.MIN_BONUS_MAGNITUDE, description: 'Minimum guaranteed bonus value' },
          { name: 'BASE_TURN_COST', value: CRAFTING_CONSTANTS.BASE_TURN_COST, description: 'Base turns per crafting action' },
        ]}
      />
    </WikiSection>
  );
}
