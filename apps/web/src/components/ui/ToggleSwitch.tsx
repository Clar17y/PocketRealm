'use client';

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, disabled = false, ariaLabel, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-[var(--rpg-green-light)]' : 'bg-[var(--rpg-border)]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-0.5 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}
