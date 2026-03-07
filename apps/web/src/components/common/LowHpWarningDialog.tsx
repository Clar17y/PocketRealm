import { ModalOverlay } from './ModalOverlay';

interface LowHpWarningDialogProps {
  currentHp: number;
  maxHp: number;
  onProceed: () => void;
  onCancel: () => void;
}

export function LowHpWarningDialog({ currentHp, maxHp, onProceed, onCancel }: LowHpWarningDialogProps) {
  return (
    <ModalOverlay>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-1">Low HP Warning</h3>
        <p className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mb-4">
          Your health is low ({Math.floor(currentHp)} / {maxHp} HP). Exploring or fighting in this state is risky.
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
            onClick={onProceed}
          >
            Proceed Anyway
          </button>
          <button
            className="flex-1 bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] rounded-lg font-semibold py-2 transition-all"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
