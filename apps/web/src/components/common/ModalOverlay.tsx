import type { ReactNode } from 'react';

interface ModalOverlayProps {
  children: ReactNode;
  opacity?: 60 | 70 | 80 | 90;
  onClose?: () => void;
}

const opacityClass = {
  60: 'bg-black/60',
  70: 'bg-black/70',
  80: 'bg-black/80',
  90: 'bg-black/90',
} as const;

export function ModalOverlay({ children, opacity = 70, onClose }: ModalOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${opacityClass[opacity]}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      {children}
    </div>
  );
}
