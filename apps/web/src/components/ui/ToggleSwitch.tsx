'use client';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-[var(--rpg-green-light)]' : 'bg-[var(--rpg-border)]'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}
