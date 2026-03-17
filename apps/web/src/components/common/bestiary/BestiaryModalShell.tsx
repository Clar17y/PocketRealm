import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { ModalOverlay } from '@/components/common/ModalOverlay';

interface BestiaryModalShellProps {
  /** Image element rendered in the header (allows custom wrappers) */
  imageSlot: ReactNode;
  /** Content rendered next to the image (name, subtitle, etc.) */
  headerInfo: ReactNode;
  onClose: () => void;
  /** Gap between header and body — main modal uses mb-4, others use mb-3 */
  headerGap?: 'mb-3' | 'mb-4';
  children: ReactNode;
}

export function BestiaryModalShell({
  imageSlot,
  headerInfo,
  onClose,
  headerGap = 'mb-3',
  children,
}: BestiaryModalShellProps) {
  return (
    <ModalOverlay opacity={80} onClose={onClose}>
      <div className="max-w-sm w-full max-h-[80vh] overflow-y-auto">
        <PixelCard>
          <div className={`flex justify-between items-start ${headerGap}`}>
            <div className="flex items-center gap-3">
              {imageSlot}
              <div>{headerInfo}</div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          {children}

          <PixelButton variant="secondary" className="w-full" onClick={onClose}>
            Close
          </PixelButton>
        </PixelCard>
      </div>
    </ModalOverlay>
  );
}
