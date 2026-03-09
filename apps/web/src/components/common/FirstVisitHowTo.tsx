'use client';

import { FeatureTutorial } from './FeatureTutorial';

interface FirstVisitHowToProps {
  storageKey: string;
  title: string;
  sections: { heading: string; text: string }[];
}

export function FirstVisitHowTo({ storageKey, title, sections }: FirstVisitHowToProps) {
  return (
    <FeatureTutorial storageKey={storageKey} title={title}>
      {sections.map((s) => (
        <div key={s.heading}>
          <h4 className="text-xs font-semibold text-[var(--rpg-text-primary)] mb-0.5">{s.heading}</h4>
          <p className="text-xs text-[var(--rpg-text-secondary)] leading-relaxed">{s.text}</p>
        </div>
      ))}
    </FeatureTutorial>
  );
}
