'use client';

import { useEffect, useRef, useState } from 'react';
import { ModalOverlay } from './common/ModalOverlay';
import {
  TUTORIAL_STEPS,
  isTutorialActive,
} from '@/lib/tutorial';

interface TutorialDialogProps {
  tutorialStep: number;
  onDismiss: () => void;
  disabled?: boolean;
}

export function TutorialDialog({ tutorialStep, onDismiss, disabled = false }: TutorialDialogProps) {
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

  if (disabled || !visible || shownForStep === null) return null;

  const stepDef = TUTORIAL_STEPS[shownForStep];
  if (!stepDef?.dialog) return null;

  const handleGotIt = () => {
    setVisible(false);
    onDismiss();
  };

  return (
    <ModalOverlay opacity={60}>
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
    </ModalOverlay>
  );
}
