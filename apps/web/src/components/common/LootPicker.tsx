'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { LootOverflowTutorial } from '@/components/common/LootOverflowTutorial';
import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { RARITY_COLORS, type Rarity } from '@/lib/rarity';

interface LootPickerProps {
  sessionId: string;
  items: Array<{
    templateName: string;
    rarity: string;
    quantity: number;
  }>;
  availableSlots: number;
  onClaim: (sessionId: string, selectedIndices: number[]) => void;
  onDismiss: () => void;
}

export function LootPicker({ sessionId, items, availableSlots, onClaim, onDismiss }: LootPickerProps) {
  const [selected, setSelected] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (let i = 0; i < Math.min(items.length, availableSlots); i++) {
      initial.add(i);
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const noSpace = availableSlots <= 0;

  const toggleItem = (index: number) => {
    if (noSpace) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < availableSlots) {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <ModalOverlay opacity={80} onClose={onDismiss}>
      <PixelCard className="max-w-sm w-full">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">Loot Overflow</h3>
            <div className="text-xs text-[var(--rpg-text-secondary)]">
              {noSpace
                ? 'Your backpack is full! Free up space to claim these items.'
                : 'Your backpack was full! Select items to claim.'}
            </div>
            <div className="text-xs text-[var(--rpg-red)] mt-0.5">
              Unclaimed loot expires after 10 minutes.
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
          >
            <X size={20} />
          </button>
        </div>

        {noSpace && (
          <div className="mb-3 p-2 rounded-lg bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)] text-[var(--rpg-gold)] text-xs text-center">
            Sell, salvage, stash, or drop items from your backpack, then reopen this to claim.
          </div>
        )}

        <div className="text-sm text-[var(--rpg-text-secondary)] mb-3">
          {noSpace
            ? <span className="text-[var(--rpg-red)] font-pixel text-[12px]">0</span>
            : <>Selected: <span className="font-pixel text-[12px] text-[var(--rpg-gold)]">{selected.size}</span></>
          }
          {' '}/ {availableSlots} slots available
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
          {items.map((item, index) => {
            const isSelected = selected.has(index);
            const rarityColor = RARITY_COLORS[item.rarity as Rarity] ?? 'var(--rpg-border)';
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleItem(index)}
                disabled={noSpace}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-colors text-left ${
                  noSpace
                    ? 'bg-[var(--rpg-background)] border-[var(--rpg-border)] opacity-50 cursor-not-allowed'
                    : isSelected
                      ? 'bg-[var(--rpg-surface)] border-[var(--rpg-gold)]'
                      : 'bg-[var(--rpg-background)] border-[var(--rpg-border)] opacity-60'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected
                      ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]'
                      : 'border-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)]'
                  }`}
                >
                  {isSelected && <span className="text-[var(--rpg-background)] text-xs font-bold">&#10003;</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--rpg-text-primary)] truncate">
                    {item.templateName}
                    {item.quantity > 1 && <span className="text-[var(--rpg-text-secondary)]"> x{item.quantity}</span>}
                  </div>
                  <div className="text-xs capitalize" style={{ color: rarityColor }}>{item.rarity}</div>
                </div>
              </button>
            );
          })}
        </div>

        {!noSpace && selected.size < items.length && (
          <div className="text-xs text-[var(--rpg-text-secondary)] mb-2 text-center">
            Unclaimed items will be lost.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <PixelButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={noSpace ? onDismiss : () => setShowDiscardConfirm(true)}
          >
            {noSpace ? 'Make Space' : 'Discard All'}
          </PixelButton>
          <PixelButton
            variant="primary"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={async () => {
              setBusy(true);
              try {
                onClaim(sessionId, [...selected]);
              } finally {
                setBusy(false);
              }
            }}
          >
            {selected.size === items.length ? 'Claim All' : `Claim ${selected.size} / Discard ${items.length - selected.size}`}
          </PixelButton>
        </div>
      </PixelCard>

      <LootOverflowTutorial />

      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard All Loot?"
          message="All unclaimed overflow items will be lost forever."
          variant="danger"
          confirmLabel="Discard All"
          onConfirm={onDismiss}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </ModalOverlay>
  );
}
