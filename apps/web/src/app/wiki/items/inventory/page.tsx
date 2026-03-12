import type { Metadata } from 'next';
import { INVENTORY_CONSTANTS, ITEM_RARITY_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Inventory',
  description:
    'Inventory capacity formula: base slots, backpack tier and rarity bonuses, belt bonus, and champion bonus.',
};

export default function InventoryPage() {
  return (
    <WikiSection
      title="Inventory"
      summary="Inventory capacity determines how many items a player can carry. It grows with backpack quality, belt equipment, and champion status."
      related={[
        { label: 'Rarity System', href: '/wiki/items/rarity' },
        { label: 'Durability & Selling', href: '/wiki/items/durability' },
        { label: 'Salvage', href: '/wiki/crafting/salvage' },
      ]}
    >
      <h2>Total Capacity</h2>
      <FormulaBlock>
        <Out>capacity</Out> <Op>=</Op>{' '}
        <Const>{INVENTORY_CONSTANTS.BASE_CAPACITY}</Const> <Op>+</Op>{' '}
        <Var>backpackSlots</Var> <Op>+</Op> <Var>beltSlotBonus</Var>{' '}
        <Op>+</Op> <Var>championBonus</Var>
      </FormulaBlock>

      <h2>Backpack Slots</h2>
      <FormulaBlock>
        <Out>backpackSlots</Out> <Op>=</Op> <Var>backpackTier</Var> <Op>*</Op>{' '}
        <Const>{INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_TIER}</Const> <Op>+</Op>{' '}
        <Var>rarityIndex</Var> <Op>*</Op>{' '}
        <Const>{INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_RARITY}</Const>
      </FormulaBlock>
      <p>
        The rarity index is the position of the backpack&apos;s rarity in the
        order: {ITEM_RARITY_CONSTANTS.ORDER.map((r, i) => `${r} (${i})`).join(', ')}.
      </p>

      <h2>Belt Bonus</h2>
      <p>
        Belts can roll an <code>inventorySlots</code> stat between{' '}
        <strong>{INVENTORY_CONSTANTS.BELT_INVENTORY_SLOTS_MIN}</strong> and{' '}
        <strong>{INVENTORY_CONSTANTS.BELT_INVENTORY_SLOTS_MAX}</strong> slots.
      </p>

      <h2>Champion Bonus</h2>
      <p>
        Players with champion status receive an additional{' '}
        <strong>{INVENTORY_CONSTANTS.CHAMPION_BONUS_SLOTS}</strong> slots.
      </p>

      <h2>All Constants</h2>
      <ConstantsTable
        rows={[
          { name: 'BASE_CAPACITY', value: INVENTORY_CONSTANTS.BASE_CAPACITY, description: 'Starting inventory slots for all players' },
          { name: 'BACKPACK_SLOTS_PER_TIER', value: INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_TIER, description: 'Additional slots per backpack tier' },
          { name: 'BACKPACK_SLOTS_PER_RARITY', value: INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_RARITY, description: 'Additional slots per rarity index' },
          { name: 'BELT_INVENTORY_SLOTS_MIN', value: INVENTORY_CONSTANTS.BELT_INVENTORY_SLOTS_MIN, description: 'Minimum belt inventory slot bonus' },
          { name: 'BELT_INVENTORY_SLOTS_MAX', value: INVENTORY_CONSTANTS.BELT_INVENTORY_SLOTS_MAX, description: 'Maximum belt inventory slot bonus' },
          { name: 'CHAMPION_BONUS_SLOTS', value: INVENTORY_CONSTANTS.CHAMPION_BONUS_SLOTS, description: 'Extra slots for champion players' },
          { name: 'PENDING_LOOT_TTL_SECONDS', value: INVENTORY_CONSTANTS.PENDING_LOOT_TTL_SECONDS, description: 'Time before unclaimed loot expires' },
        ]}
      />
    </WikiSection>
  );
}
