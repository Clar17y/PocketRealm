import type { ConfirmRarity } from '@/lib/rarity';

interface RaritySelectorProps {
  label: string;
  description: string;
  value: ConfirmRarity;
  onChange: (value: ConfirmRarity) => void;
}

const RARITY_OPTIONS = ['none', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export function RaritySelector({ label, description, value, onChange }: RaritySelectorProps) {
  return (
    <div>
      <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{label}</p>
      <p className="text-xs text-[var(--rpg-text-secondary)] opacity-60 mb-2">{description}</p>
      <div className="flex gap-2">
        {RARITY_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors capitalize ${
              value === r
                ? 'bg-[var(--rpg-gold)] text-black'
                : 'bg-[var(--rpg-background)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
            }`}
          >
            {r === 'none' ? 'Off' : r}
          </button>
        ))}
      </div>
    </div>
  );
}
