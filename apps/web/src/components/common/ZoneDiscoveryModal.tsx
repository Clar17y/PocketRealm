'use client';

import { useState } from 'react';
import { ModalOverlay } from './ModalOverlay';

interface ZoneDiscoveryModalProps {
  zoneName: string;
  imageSrc?: string;
  onDismiss: () => void;
}

export function ZoneDiscoveryModal({ zoneName, imageSrc, onDismiss }: ZoneDiscoveryModalProps) {
  const [showImage, setShowImage] = useState(Boolean(imageSrc));

  return (
    <ModalOverlay>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
        <h2 className="text-center text-[var(--rpg-gold)] font-bold text-lg mb-4">
          New Zone Discovered
        </h2>

        <div className="space-y-4">
          {imageSrc && showImage && (
            <img
              src={imageSrc}
              alt={zoneName}
              className="w-full h-48 object-cover rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-background)]"
              onError={() => setShowImage(false)}
            />
          )}

          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-[var(--rpg-text-primary)]">{zoneName}</p>
            <p className="text-sm leading-relaxed text-[var(--rpg-text-secondary)]">
              This zone is now available for travel.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="mt-5 w-full bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
          onClick={onDismiss}
        >
          Continue
        </button>
      </div>
    </ModalOverlay>
  );
}
