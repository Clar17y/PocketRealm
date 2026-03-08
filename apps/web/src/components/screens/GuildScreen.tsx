'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPlayerGuild, type PlayerGuildResponse } from '@/lib/api';
import { NoGuildView } from '@/components/guild/NoGuildView';
import { GuildOverview } from '@/components/guild/GuildOverview';
import { GuildMembers } from '@/components/guild/GuildMembers';
import { GuildActivityLog } from '@/components/guild/GuildActivityLog';
import { GuildUpgradesTab } from '@/components/guild/GuildUpgradesTab';
import { GuildContractsTab } from '@/components/guild/GuildContractsTab';
import { GuildProjectsTab } from '@/components/guild/GuildProjectsTab';
import { GuildSpecializationTab } from '@/components/guild/GuildSpecializationTab';
import { GuildSettings } from '@/components/guild/GuildSettings';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
import { ScreenContainer } from '../common/ScreenContainer';

type GuildTab = 'overview' | 'members' | 'upgrades' | 'contracts' | 'projects' | 'specialization' | 'log' | 'settings';

interface GuildScreenProps {
  playerId: string | null;
  characterLevel: number;
  onTurnsChanged: () => void;
}

export function GuildScreen({ playerId, characterLevel, onTurnsChanged }: GuildScreenProps) {
  const [guildData, setGuildData] = useState<PlayerGuildResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GuildTab>('overview');

  const loadGuild = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPlayerGuild();
      if (res.error) { setError(res.error.message); return; }
      setGuildData(res.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load guild');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGuild();
  }, [loadGuild]);

  if (loading) {
    return (
      <ScreenContainer>
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Guild</h2>
        <LoadingCard />
      </ScreenContainer>
    );
  }

  if (!guildData) {
    return (
      <NoGuildView
        playerId={playerId}
        characterLevel={characterLevel}
        error={error}
        onGuildJoined={() => { void loadGuild(); onTurnsChanged(); }}
      />
    );
  }

  return (
    <ScreenContainer>
      <FeatureTutorial storageKey="howto_guild" title="Guilds">
        <p>
          Guilds are player-run groups. Join one to access shared upgrades,
          weekly contracts, and collaborative projects.
        </p>
        <p>
          <strong>Roles:</strong> Leaders manage settings and promotions. Officers can
          accept join requests and kick members. Members contribute to projects and contracts.
        </p>
        <p>
          <strong>Tax:</strong> A percentage of your turn income goes to the guild treasury,
          funding upgrades and projects.
        </p>
        <p className="text-[var(--rpg-green-light)]">
          <strong>Tip:</strong> Check the Contracts tab for weekly bounties that reward
          the whole guild when completed.
        </p>
      </FeatureTutorial>

      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
        [{guildData.guild.tag}] {guildData.guild.name}
      </h2>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['overview', 'members', 'upgrades', 'contracts', 'projects', 'specialization', 'log', ...(guildData.role === 'leader' || guildData.role === 'officer' ? ['settings'] : [])] as GuildTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors capitalize ${
              activeTab === tab
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <GuildOverview guild={guildData.guild} members={guildData.members} />}
      {activeTab === 'members' && (
        <GuildMembers
          guild={guildData.guild}
          members={guildData.members}
          myRole={guildData.role}
          playerId={playerId}
          onRefresh={loadGuild}
          setError={setError}
        />
      )}
      {activeTab === 'upgrades' && (
        <GuildUpgradesTab guildId={guildData.guild.id} myRole={guildData.role} setError={setError} />
      )}
      {activeTab === 'contracts' && (
        <GuildContractsTab guildId={guildData.guild.id} />
      )}
      {activeTab === 'projects' && (
        <GuildProjectsTab guildId={guildData.guild.id} myRole={guildData.role} setError={setError} onTurnsChanged={onTurnsChanged} />
      )}
      {activeTab === 'specialization' && (
        <GuildSpecializationTab guildId={guildData.guild.id} guildLevel={guildData.guild.level} myRole={guildData.role} setError={setError} />
      )}
      {activeTab === 'log' && <GuildActivityLog guildId={guildData.guild.id} />}
      {activeTab === 'settings' && (
        <GuildSettings
          guild={guildData.guild}
          myRole={guildData.role}
          playerId={playerId}
          onRefresh={loadGuild}
          setError={setError}
        />
      )}
    </ScreenContainer>
  );
}
