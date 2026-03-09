'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function LootOverflowTutorial() {
  return (
    <FeatureTutorial storageKey="lootOverflowTutorialSeen" title="Loot Overflow">
      <p>
        Your backpack is full! You can only carry a limited number of items.
        Select which loot to keep. <strong>Unclaimed items will be lost</strong>.
      </p>
      <p>
        You have <strong>10 minutes</strong> to claim your loot before it
        expires. Minimize the picker to free up space, then reopen to claim.
      </p>
      <p>
        Equip a better <strong>backpack</strong> to increase your carrying capacity,
        or <strong>stash</strong> items in town to free up space.
      </p>
    </FeatureTutorial>
  );
}
