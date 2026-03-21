'use client';

import type { CombatTemplateData } from '@pocketrealm/shared';

export interface TemplateQuickSwitchProps {
  templates: CombatTemplateData[];
  activeTemplateId: string | null;
  onActivate: (templateId: string) => void;
  disabled?: boolean;
}

export function TemplateQuickSwitch({ templates, activeTemplateId, onActivate, disabled }: TemplateQuickSwitchProps) {
  if (templates.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="combat-template-select" className="text-xs text-[var(--rpg-text-secondary)] whitespace-nowrap">Template</label>
      <select
        id="combat-template-select"
        className="flex-1 text-xs px-2 py-1.5 rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] outline-none"
        value={activeTemplateId ?? ''}
        onChange={(e) => onActivate(e.target.value)}
        disabled={disabled}
      >
        {templates.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
