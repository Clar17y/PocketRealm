'use client';

import { useEffect, useRef, useState } from 'react';
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_DONE,
  isTutorialActive,
} from '@/lib/tutorial';

interface TutorialDialogProps {
  tutorialStep: number;
  onDismiss: () => void;
}

export function TutorialDialog({ tutorialStep, onDismiss }: TutorialDialogProps) {
  const [shownForStep, setShownForStep] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const prevStepRef = useRef<number | null>(null);

  useEffect(() => {
    // Show dialog when step changes (and tutorial is active)
    if (
      isTutorialActive(tutorialStep) &&
      tutorialStep !== prevStepRef.current
    ) {
      setShownForStep(tutorialStep);
      setVisible(true);
    }
    prevStepRef.current = tutorialStep;
  }, [tutorialStep]);

  if (!visible || shownForStep === null) return null;

  const stepDef = TUTORIAL_STEPS[shownForStep];
  if (!stepDef) return null;

  const handleGotIt = () => {
    setVisible(false);
    // For welcome and done steps, dismissing the dialog IS the completion trigger
    if (shownForStep === TUTORIAL_STEP_WELCOME || shownForStep === TUTORIAL_STEP_DONE) {
      onDismiss();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-[var(--rpg-surface)] border border-[var(--rpg-border)] p-5 shadow-xl">
        <h2 className="text-lg font-bold text-[var(--rpg-gold)] mb-2">
          {stepDef.dialog.title}
        </h2>
        <p className="text-sm text-[var(--rpg-text)] leading-relaxed mb-4">
          {stepDef.dialog.body}
        </p>
        <button
          onClick={handleGotIt}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold text-sm hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
