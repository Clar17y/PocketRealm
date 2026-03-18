'use client';

import { useState } from 'react';
import { ModalOverlay } from './common/ModalOverlay';

interface StarterWeaponOption {
  type: 'melee' | 'ranged' | 'magic';
  name: string;
  description: string;
  stat: string;
}

const WEAPONS: StarterWeaponOption[] = [
  {
    type: 'melee',
    name: "Kessa's Training Sword",
    description: 'A sturdy blade for close combat. Scales with Strength.',
    stat: '+4 Attack',
  },
  {
    type: 'ranged',
    name: "Kessa's Training Bow",
    description: 'A reliable shortbow for ranged strikes. Scales with Dexterity.',
    stat: '+3 Ranged Power',
  },
  {
    type: 'magic',
    name: "Kessa's Training Staff",
    description: 'A channeling staff for arcane arts. Scales with Intelligence.',
    stat: '+5 Magic Power',
  },
];

interface Props {
  onSelect: (weaponType: 'melee' | 'ranged' | 'magic') => void;
}

export function StarterWeaponPopup({ onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
    onSelect(selected as 'melee' | 'ranged' | 'magic');
  };

  return (
    <ModalOverlay opacity={70}>
      <div className="w-full max-w-md rounded-xl border-2 border-[var(--rpg-gold)] bg-[var(--rpg-surface)] p-6 shadow-xl">
        <h2 className="mb-1 text-center text-xl font-bold text-[var(--rpg-gold)]">
          A Gift from the Forge
        </h2>
        <p className="mb-4 text-center text-sm text-[var(--rpg-text-secondary)]">
          &ldquo;Heading past the gate bare-handed? Not on my watch. Pick one &mdash; and try
          not to break it before you&rsquo;re out of earshot.&rdquo;
        </p>
        <p className="mb-4 text-center text-xs italic text-[var(--rpg-text-secondary)]">
          &mdash; Kessa Ironweld, Blacksmith
        </p>

        <div className="flex flex-col gap-3">
          {WEAPONS.map((w) => (
            <button
              key={w.type}
              onClick={() => setSelected(w.type)}
              className={`flex flex-col rounded-lg border p-3 text-left transition-all ${
                selected === w.type
                  ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10'
                  : 'border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]/50'
              }`}
            >
              <span className="font-semibold text-[var(--rpg-text)]">{w.name}</span>
              <span className="text-sm text-[var(--rpg-text-secondary)]">{w.description}</span>
              <span className="mt-1 text-sm font-medium text-[var(--rpg-green-light)]">
                {w.stat}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || confirming}
          className="mt-4 w-full rounded-lg bg-[var(--rpg-gold)] px-4 py-2 font-semibold text-black transition-all hover:brightness-110 disabled:opacity-50"
        >
          {confirming ? 'Claiming...' : 'Take Weapon'}
        </button>
      </div>
    </ModalOverlay>
  );
}
