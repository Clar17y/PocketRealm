'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'stashTutorialSeen';

export function StashTutorial() {
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
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">Town Stash</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            The <strong>Stash</strong> lets you store items safely while you adventure.
            Stashed items don&apos;t count toward your backpack capacity.
          </p>
          <p>
            You can deposit and withdraw items from any town.
            Use it to keep valuable gear, materials, and potions safe.
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
