'use client';

import {
  TUTORIAL_STEPS,
  isTutorialActive,
} from '@/lib/tutorial';

interface TutorialBannerProps {
  tutorialStep: number;
  onSkip: () => void;
}

export function TutorialBanner({ tutorialStep, onSkip }: TutorialBannerProps) {
  if (!isTutorialActive(tutorialStep)) return null;

  const stepDef = TUTORIAL_STEPS[tutorialStep];
  if (!stepDef) return null;

  return (
    <div className="mb-3 p-2.5 rounded-lg bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)]/40 flex items-center justify-between gap-2">
      <p className="text-sm text-[var(--rpg-gold)]">
        {stepDef.banner}
      </p>
      <button
        onClick={onSkip}
        className="shrink-0 text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text)] underline"
      >
        Skip
      </button>
    </div>
  );
}
