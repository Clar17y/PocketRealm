'use client';

import { SKILL_CONSTANTS } from '@pocketrealm/shared';

import { FeatureTutorial } from './FeatureTutorial';

interface XpRateTutorialProps {
  skillName: string;
  rate: number;
}

export function XpRateTutorial({ skillName, rate }: XpRateTutorialProps) {
  return (
    <FeatureTutorial storageKey="xpRateTutorialSeen" title="XP Rate" condition={rate < 100}>
      <p>
        Your {skillName} XP Rate dropped to {rate}%. As you train a skill, you earn XP slightly slower.
      </p>
      <ul className="text-[var(--rpg-text-secondary)] space-y-1">
        <li>Uses a {SKILL_CONSTANTS.XP_WINDOW_HOURS}-hour rolling window per skill</li>
        <li>Train other skills meanwhile</li>
        <li>You still earn XP, just less</li>
      </ul>
    </FeatureTutorial>
  );
}
