'use client';

import { ModalOverlay } from './ModalOverlay';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger: {
    border: 'border-[var(--rpg-red)]',
    title: 'text-[var(--rpg-red)]',
    button: 'bg-[var(--rpg-red)] hover:bg-[#c44]',
  },
  warning: {
    border: 'border-[var(--rpg-gold)]',
    title: 'text-[var(--rpg-gold)]',
    button: 'bg-[var(--rpg-gold)] hover:bg-[#e4b85b]',
  },
} as const;

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <ModalOverlay>
      <div className={`bg-[var(--rpg-surface)] border ${styles.border} rounded-lg p-6 max-w-sm w-full mx-4`}>
        <h2 className={`${styles.title} font-bold text-lg mb-3`}>{title}</h2>
        <p className="text-sm text-[var(--rpg-text-primary)] mb-5 leading-relaxed">{message}</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            className="w-full bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] rounded-lg font-semibold py-2 transition-all"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`w-full ${styles.button} text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
