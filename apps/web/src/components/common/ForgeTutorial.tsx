'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function ForgeTutorial() {
  return (
    <FeatureTutorial storageKey="forgeTutorialSeen" title="The Forge">
      <p>
        The Forge lets you <strong>upgrade</strong> item rarity or <strong>reroll</strong> bonus stats.
        Both require a sacrificial item of the same rarity.
      </p>
      <p>
        <strong>Upgrade</strong> attempts to raise your item one rarity tier.
        Success adds a new bonus stat, but failure destroys the item.
      </p>
      <p>
        <strong>Reroll</strong> re-randomises all bonus stats on an Uncommon+ item.
        The item is never destroyed.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Skill discount:</strong> If you&apos;ve learned the crafting recipe for an item,
        forge upgrade and salvage costs are reduced by 20% for each crafting level above the recipe
        requirement. At 5+ levels above, it&apos;s free!
      </p>
    </FeatureTutorial>
  );
}
