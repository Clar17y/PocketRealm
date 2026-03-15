export interface SubNavTab<T extends string = string> {
  id: T;
  label: string;
  badge?: number;
}

interface SubNavProps<T extends string = string> {
  tabs: SubNavTab<T>[];
  activeId: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
}

export function SubNav<T extends string = string>({ tabs, activeId, onSelect, ariaLabel = 'Navigation tabs' }: SubNavProps<T>) {
  return (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-2" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          aria-selected={tab.id === activeId}
          onClick={() => onSelect(tab.id)}
          className={`relative px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeId === tab.id
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          {tab.label}
          {(tab.badge ?? 0) > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-[var(--rpg-red)] text-white font-bold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
