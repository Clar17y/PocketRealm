import type { ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  opacity?: 60 | 70;
}

export function ModalOverlay({ children, opacity = 70 }: ModalOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${opacity === 60 ? 'bg-black/60' : 'bg-black/70'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
