'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'skillTreeTutorialSeen';

export function SkillTreeTutorial() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={60}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">Skill Tree</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            You earn <strong>skill points</strong> every time one of your skills levels up.
            Spend them here to unlock powerful combat abilities.
          </p>
          <p>
            Each tree — <strong>Melee</strong>, <strong>Ranged</strong>, <strong>Magic</strong>,
            and <strong>General</strong> — has 5 tiers of nodes. Higher tiers require investing
            points in earlier tiers first.
          </p>
          <p>
            Nodes that <strong>unlock an action</strong> let you add that ability to your combat
            template. Passive nodes boost your stats permanently.
          </p>
          <p className="text-[var(--rpg-green-light)]">
            <strong>Respec</strong> resets all allocations for 50,000 turns — choose wisely!
          </p>
        </div>
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
