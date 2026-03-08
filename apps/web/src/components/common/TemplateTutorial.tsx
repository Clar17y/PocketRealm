'use client';

import { FeatureTutorial } from './FeatureTutorial';

export function TemplateTutorial() {
  return (
    <FeatureTutorial storageKey="templateTutorialSeen" title="Combat Templates">
      <p>
        Templates define your <strong>action rotation</strong>, the sequence of abilities
        your character uses each combat round, repeating when it reaches the end.
      </p>
      <p>
        <strong>Basic actions</strong> like Light Attack, Defend, and Counter are always
        available. Unlock more powerful abilities in the <strong>Skill Tree</strong>.
      </p>
      <p>
        Each action costs <strong>stamina</strong> or <strong>mana</strong>. If you
        can&apos;t afford your next action, you&apos;ll automatically Defend instead.
        The resource preview shows how sustainable your rotation is.
      </p>
      <p className="text-[var(--rpg-green-light)]">
        <strong>Tip:</strong> Mix offensive and defensive actions. A rotation of all heavy
        attacks will exhaust you fast!
      </p>
    </FeatureTutorial>
  );
}
