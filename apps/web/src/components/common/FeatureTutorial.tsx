'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { ModalOverlay } from './ModalOverlay';
import { useOnboardingUi } from './OnboardingUiContext';

interface FeatureTutorialProps {
  storageKey: string;
  title: string;
  children: ReactNode;
  condition?: boolean;
}

export function FeatureTutorial({ storageKey, title, children, condition = true }: FeatureTutorialProps) {
  const [show, setShow] = useState(false);
  const { featureTutorialsEnabled } = useOnboardingUi();
  const canShowTutorial = condition && featureTutorialsEnabled;

  useEffect(() => {
    if (!canShowTutorial) {
      setShow(false);
      return;
    }

    setShow(localStorage.getItem(storageKey) === null);
  }, [storageKey, canShowTutorial]);

  if (!canShowTutorial || !show) return null;

  const dismiss = () => {
    if (!canShowTutorial) return;
    localStorage.setItem(storageKey, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={60}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">{title}</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          {children}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
