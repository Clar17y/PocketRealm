import type { Metadata } from 'next';
import { TIER_BLEED_CONSTANTS, ZONE_EXPLORATION_CONSTANTS, TIER_NAME_CONSTANTS } from '@pocketrealm/shared';
import { WikiSection } from '@/components/wiki/WikiSection';
import { FormulaBlock } from '@/components/wiki/FormulaBlock';
import { ConstantsTable } from '@/components/wiki/ConstantsTable';

const { Var, Out, Const, Op, Comment } = FormulaBlock;

export const metadata: Metadata = {
  title: 'Mob Tier Filtering',
  description:
    'Zone mob tier unlocking by exploration percentage, newest tier weight multiplier, and tier bleedthrough probabilities.',
};

const defaultTiers = ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

export default function MobTiersPage() {
  return (
    <WikiSection
      title="Mob Tier Filtering"
      summary="Each zone contains mobs across multiple tiers. Which tiers are available depends on how much of the zone you have explored."
      related={[
        { label: 'Zone Progression', href: '/wiki/exploration/zones' },
        { label: 'Probability Model', href: '/wiki/exploration/probability' },
        { label: 'Mob Prefixes', href: '/wiki/combat/mob-prefixes' },
      ]}
    >
      <h2>Tier Unlocks by Exploration</h2>
      <p>
        Mobs are assigned to exploration tiers within each zone. Higher tiers
        unlock as your zone exploration percentage increases.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Tier</th>
            <th>Name</th>
            <th>Unlock At</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(defaultTiers).map(([tier, threshold]) => (
            <tr key={tier}>
              <td>{tier}</td>
              <td>{TIER_NAME_CONSTANTS.NAMES[Number(tier)] ?? `Tier ${tier}`}</td>
              <td>{threshold}% exploration</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Newest Tier Weight Multiplier</h2>
      <p>
        When multiple tiers are unlocked, mobs in the highest unlocked tier
        have their encounter weight multiplied by{' '}
        <strong>{ZONE_EXPLORATION_CONSTANTS.NEWEST_TIER_WEIGHT_MULTIPLIER}x</strong>,
        making them more likely to appear. This encourages exploration of newly
        unlocked content.
      </p>

      <h2>Tier Bleedthrough</h2>
      <p>
        When a tier is selected for combat (e.g., in encounter sites), the
        actual tier of mobs encountered may bleed into adjacent tiers. This
        adds variety while keeping the encounter roughly on-level.
      </p>
      <table className="wiki-table">
        <thead>
          <tr>
            <th>Offset</th>
            <th>Probability</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Two Below</td>
            <td>{(TIER_BLEED_CONSTANTS.TWO_BELOW * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>One Below</td>
            <td>{(TIER_BLEED_CONSTANTS.ONE_BELOW * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>Selected Tier</td>
            <td>{(TIER_BLEED_CONSTANTS.SELECTED * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>One Above</td>
            <td>{(TIER_BLEED_CONSTANTS.ONE_ABOVE * 100).toFixed(0)}%</td>
          </tr>
          <tr>
            <td>Two Above</td>
            <td>{((1 - TIER_BLEED_CONSTANTS.TWO_BELOW - TIER_BLEED_CONSTANTS.ONE_BELOW - TIER_BLEED_CONSTANTS.SELECTED - TIER_BLEED_CONSTANTS.ONE_ABOVE) * 100).toFixed(0)}%</td>
          </tr>
        </tbody>
      </table>
      <p>
        If the bleedthrough roll targets a tier below the zone minimum, the
        selected tier is used instead. If it targets above the zone maximum,
        the highest available tier is used.
      </p>
    </WikiSection>
  );
}
