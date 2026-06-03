'use client';

import { useState } from 'react';
import type { StateUpdates } from '@pocketrealm/shared';
import { Shield } from 'lucide-react';
import { ScreenContainer } from '../common/ScreenContainer';
import { PlayerTab } from './admin/PlayerTab';
import { ItemsTab } from './admin/ItemsTab';
import { WorldTab } from './admin/WorldTab';
import { ZonesTab } from './admin/ZonesTab';
import { ResourcesTab } from './admin/ResourcesTab';
import { GuildTab } from './admin/GuildTab';
import { SeasonsTab } from './admin/SeasonsTab';
import { AnalyticsTab } from './admin/AnalyticsTab';
import { SupportTab } from './admin/SupportTab';

type AdminTab = 'player' | 'items' | 'world' | 'zones' | 'resources' | 'guild' | 'seasons' | 'support' | 'analytics';

const TABS: ReadonlyArray<{ id: AdminTab; label: string }> = [
  { id: 'player', label: 'Player' },
  { id: 'items', label: 'Items' },
  { id: 'world', label: 'World' },
  { id: 'zones', label: 'Zones' },
  { id: 'resources', label: 'Resources' },
  { id: 'guild', label: 'Guild' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'support', label: 'Support' },
  { id: 'analytics', label: 'Analytics' },
];

interface AdminScreenProps {
  onStateUpdates: (updates: StateUpdates) => void;
  setTurns: (turns: number) => void;
  reloadZones: () => Promise<void>;
}

export default function AdminScreen({
  onStateUpdates,
  setTurns: setGameTurns,
  reloadZones,
}: AdminScreenProps) {
  const [tab, setTab] = useState<AdminTab>('player');

  return (
    <ScreenContainer>
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-[var(--rpg-gold)]" />
        <h2 className="text-lg font-bold font-almendra text-[var(--rpg-gold)]">Admin Panel</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === entry.id
                ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'player' && <PlayerTab onStateUpdates={onStateUpdates} setTurns={setGameTurns} />}
      {tab === 'items' && <ItemsTab onStateUpdates={onStateUpdates} />}
      {tab === 'world' && <WorldTab />}
      {tab === 'zones' && <ZonesTab onStateUpdates={onStateUpdates} reloadZones={reloadZones} />}
      {tab === 'resources' && <ResourcesTab />}
      {tab === 'guild' && <GuildTab />}
      {tab === 'seasons' && <SeasonsTab />}
      {tab === 'support' && <SupportTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </ScreenContainer>
  );
}
