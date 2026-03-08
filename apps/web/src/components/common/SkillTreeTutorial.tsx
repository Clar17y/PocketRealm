'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function SkillTreeTutorial() {
  return (
    <FeatureTutorial storageKey="skillTreeTutorialSeen" title="Skill Tree">
      <p>
        You earn <strong>skill points</strong> every time one of your skills levels up.
        Spend them here to unlock powerful combat abilities.
      </p>
      <p>
        Each tree has 5 tiers of nodes: <strong>Melee</strong>, <strong>Ranged</strong>,
        <strong>Magic</strong>, and <strong>General</strong>. Higher tiers require investing
        points in earlier tiers first.
      </p>
      <p>
        Nodes that <strong>unlock an action</strong> let you add that ability to your combat
        template. Passive nodes boost your stats permanently.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Respec</strong> resets all allocations for 50,000 turns. Choose wisely!
      </p>
    </FeatureTutorial>
  );
}
