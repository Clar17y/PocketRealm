'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'templateTutorialSeen';

export function TemplateTutorial() {
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
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">Combat Templates</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            Templates define your <strong>action rotation</strong> — the sequence of abilities
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
