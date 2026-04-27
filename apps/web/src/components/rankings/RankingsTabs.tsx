'use client';

export type PublicRankingsTab = 'leaderboards' | 'weekly' | 'crowns' | 'hallOfFame';

const TABS: Array<{ id: PublicRankingsTab; label: string }> = [
  { id: 'crowns', label: 'Crowns' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'leaderboards', label: 'Leaderboards' },
  { id: 'hallOfFame', label: 'Hall of Fame' },
];

interface RankingsTabsProps {
  activeTab: PublicRankingsTab;
  onChange: (tab: PublicRankingsTab) => void;
}

export function RankingsTabs({ activeTab, onChange }: RankingsTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Ranking views">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rpg-gold)] ${
            activeTab === tab.id
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
