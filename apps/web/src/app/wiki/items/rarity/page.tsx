import type { Metadata } from 'next';
import { ITEM_RARITY_CONSTANTS, CRIT_STAT_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

export const metadata: Metadata = {
  title: 'Rarity System',
  description:
    'Item rarity tiers, bonus stat slots per rarity, and crit stat ranges for equipment.',
};

const rarities = ITEM_RARITY_CONSTANTS.ORDER;

export default function RarityPage() {
  return (
    <WikiSection
      title="Rarity System"
      summary="Items come in five rarity tiers. Higher rarity grants additional bonus stat slots on equipment."
      related={[
        { label: 'Drop Tables', href: '/wiki/items/drops' },
        { label: 'Forge & Upgrades', href: '/wiki/items/forge' },
        { label: 'Crafting Crits', href: '/wiki/crafting/crits' },
      ]}
    >
      <h2>Rarity Tiers</h2>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Rarity</th>
            <th>Bonus Stat Slots</th>
          </tr>
        </thead>
        <tbody>
          {rarities.map((r) => (
            <tr key={r}>
              <td className="capitalize">{r}</td>
              <td>{ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY[r as keyof typeof ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        Each bonus slot rolls a stat from the equipment slot&apos;s stat pool.
        Multiple rolls can stack on the same stat.
      </p>

      <h2>Crit Stat Ranges</h2>
      <p>
        When a bonus slot rolls <code>critChance</code> or{' '}
        <code>critDamage</code>, the value is drawn from a fixed range rather
        than being percentage-based on the item&apos;s base stats.
      </p>

      <ConstantsTable
        rows={[
          {
            name: 'critChance',
            value: `${(CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critChance.min * 100).toFixed(0)}% - ${(CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critChance.max * 100).toFixed(0)}%`,
            description: 'Flat crit chance bonus range per slot',
          },
          {
            name: 'critDamage',
            value: `+${(CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critDamage.min * 100).toFixed(0)}% - +${(CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critDamage.max * 100).toFixed(0)}%`,
            description: 'Flat crit damage multiplier bonus range per slot',
          },
        ]}
      />
    </WikiSection>
  );
}
