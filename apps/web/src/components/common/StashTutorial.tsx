'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function StashTutorial() {
  return (
    <FeatureTutorial storageKey="stashTutorialSeen" title="Town Stash">
      <p>
        The <strong>Stash</strong> lets you store items safely while you adventure.
        Stashed items don&apos;t count toward your backpack capacity.
      </p>
      <p>
        You can deposit and withdraw items from any town.
        Use it to keep valuable gear, materials, and potions safe.
      </p>
    </FeatureTutorial>
  );
}
