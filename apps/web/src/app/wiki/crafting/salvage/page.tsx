import type { Metadata } from 'next';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Salvage',
  description:
    'Salvage material return rates, minimum returns, batch salvage limits, and turn costs.',
};

export default function SalvagePage() {
  return (
    <WikiSection
      title="Salvage"
      summary="Salvaging breaks down crafted equipment into raw materials. The amount returned is based on the original recipe cost."
      related={[
        { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
        { label: 'Gathering & Gems', href: '/wiki/crafting/gathering' },
        { label: 'Inventory', href: '/wiki/items/inventory' },
      ]}
    >
      <h2>Material Returns</h2>
      <FormulaBlock>
        <Out>returnQty</Out> <Op>=</Op> floor<Op>(</Op>
        <Var>originalQty</Var> <Op>*</Op>{' '}
        <Const>{CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE}</Const><Op>)</Op>
      </FormulaBlock>
      <p>
        Each material from the original recipe is returned at{' '}
        <strong>{(CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE * 100).toFixed(0)}%</strong>{' '}
        of the original quantity (rounded down). At least one unit of the
        primary material is always returned.
      </p>

      <ConstantsTable
        rows={[
          { name: 'SALVAGE_BASE_REFUND_RATE', value: `${(CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE * 100).toFixed(0)}%`, description: 'Percentage of original materials returned' },
          { name: 'SALVAGE_MIN_PRIMARY_RETURN', value: CRAFTING_CONSTANTS.SALVAGE_MIN_PRIMARY_RETURN, description: 'Minimum quantity returned for the primary material' },
        ]}
      />

      <h2>Turn Cost</h2>
      <p>
        Each salvage operation costs{' '}
        <strong>{CRAFTING_CONSTANTS.SALVAGE_TURN_COST}</strong> turns.
      </p>

      <h2>Batch Salvage</h2>
      <p>
        Multiple items can be salvaged in a single request, up to a maximum of{' '}
        <strong>{CRAFTING_CONSTANTS.SALVAGE_BATCH_LIMIT}</strong> items per
        batch. Turn cost is charged per item.
      </p>

      <ConstantsTable
        rows={[
          { name: 'SALVAGE_TURN_COST', value: CRAFTING_CONSTANTS.SALVAGE_TURN_COST, description: 'Turns per item salvaged' },
          { name: 'SALVAGE_BATCH_LIMIT', value: CRAFTING_CONSTANTS.SALVAGE_BATCH_LIMIT, description: 'Maximum items per batch salvage request' },
        ]}
      />
    </WikiSection>
  );
}
