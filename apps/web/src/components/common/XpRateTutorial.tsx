'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'xpRateTutorialSeen';

interface XpRateTutorialProps {
  skillName: string;
  rate: number;
}

export function XpRateTutorial({ skillName, rate }: XpRateTutorialProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (rate < 100 && !localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, [rate]);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={60}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">XP Rate</h3>
        <p className="text-sm text-[var(--rpg-text-primary)] mb-4">
          Your {skillName} XP Rate dropped to {rate}%. As you train a skill, you earn XP slightly slower.
        </p>
        <ul className="text-sm text-[var(--rpg-text-secondary)] space-y-1 mb-5">
          <li>Resets every 6 hours</li>
          <li>Train other skills meanwhile</li>
          <li>You still earn XP, just less</li>
        </ul>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full py-2 rounded-lg bg-[var(--rpg-gold)] text-[var(--rpg-background)] font-semibold hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
