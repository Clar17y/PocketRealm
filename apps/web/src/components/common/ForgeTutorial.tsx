'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';

const STORAGE_KEY = 'forgeTutorialSeen';

export function ForgeTutorial() {
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
        <h3 className="text-lg font-bold text-[var(--rpg-gold)] mb-3">The Forge</h3>
        <div className="text-sm text-[var(--rpg-text-primary)] space-y-3 mb-5">
          <p>
            The Forge lets you <strong>upgrade</strong> item rarity or <strong>reroll</strong> bonus stats.
            Both require a sacrificial item of the same rarity.
          </p>
          <p>
            <strong>Upgrade</strong> attempts to raise your item one rarity tier.
            Success adds a new bonus stat — but failure destroys the item.
          </p>
          <p>
            <strong>Reroll</strong> re-randomises all bonus stats on an Uncommon+ item.
            The item is never destroyed.
          </p>
          <p className="text-[var(--rpg-green-light)]">
            <strong>Skill discount:</strong> If you&apos;ve learned the crafting recipe for an item,
            forge and salvage costs are reduced by 20% for each crafting level above the recipe
            requirement. At 5+ levels above, it&apos;s free!
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
