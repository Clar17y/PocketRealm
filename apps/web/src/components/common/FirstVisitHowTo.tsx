'use client';

import { useState, useEffect } from 'react';
import { ModalOverlay } from './ModalOverlay';
import { PixelButton } from '@/components/PixelButton';

interface FirstVisitHowToProps {
  storageKey: string;
  title: string;
  sections: { heading: string; text: string }[];
}

export function FirstVisitHowTo({ storageKey, title, sections }: FirstVisitHowToProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) setShow(true);
  }, [storageKey]);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(storageKey, '1');
    setShow(false);
  };

  return (
    <ModalOverlay opacity={70}>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-5 max-w-sm mx-4 space-y-3">
        <h2 className="text-lg font-bold text-[var(--rpg-gold)] text-center">{title}</h2>
        {sections.map((s) => (
          <div key={s.heading}>
            <h3 className="text-xs font-semibold text-[var(--rpg-text-primary)] mb-0.5">{s.heading}</h3>
            <p className="text-xs text-[var(--rpg-text-secondary)] leading-relaxed">{s.text}</p>
          </div>
        ))}
        <PixelButton variant="gold" size="sm" className="w-full mt-2" onClick={dismiss}>
          Got it!
        </PixelButton>
      </div>
    </ModalOverlay>
  );
}
