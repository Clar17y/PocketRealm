'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'lootOverflowTutorialSeen';

export function LootOverflowTutorial() {
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
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">Loot Overflow</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            Your backpack is full! You can only carry a limited number of items.
            Select which loot to keep — <strong>unclaimed items will be lost</strong>.
          </p>
          <p>
            Equip a better <strong>backpack</strong> to increase your carrying capacity,
            or <strong>stash</strong> items in town to free up space.
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
