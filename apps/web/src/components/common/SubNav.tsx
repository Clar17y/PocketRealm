export interface SubNavTab {
  id: string;
  label: string;
  badge?: number;
}

interface SubNavProps {
  tabs: SubNavTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function SubNav({ tabs, activeId, onSelect }: SubNavProps) {
  return (
    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
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
