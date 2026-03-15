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
import { GuildExpeditionsTab } from '@/components/guild/GuildExpeditionsTab';
import { ExpeditionShopTab } from '@/components/guild/ExpeditionShopTab';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
import { ScreenContainer } from '../common/ScreenContainer';

type GuildTab = 'overview' | 'members' | 'upgrades' | 'contracts' | 'projects' | 'expeditions' | 'shop' | 'specialization' | 'log' | 'settings';

import type { ExpeditionContext } from '@/lib/assets';

interface GuildScreenProps {
  playerId: string | null;
  characterLevel: number;
  onTurnsChanged: () => void;
  onExpeditionContextChange?: (ctx: ExpeditionContext | null) => void;
}

export function GuildScreen({ playerId, characterLevel, onTurnsChanged, onExpeditionContextChange }: GuildScreenProps) {
  const [guildData, setGuildData] = useState<PlayerGuildResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GuildTab>('overview');

  const loadGuild = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await getPlayerGuild();
      if (res.error) { setError(res.error.message); return; }
      setGuildData(res.data ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load guild');
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const refreshGuild = useCallback(() => { void loadGuild(true); }, [loadGuild]);

  useEffect(() => {
    void loadGuild();
  }, [loadGuild]);

  if (loading && !guildData) {
    return (
      <ScreenContainer>
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Guild</h2>
        <LoadingCard />
      </ScreenContainer>
    );
  }

  if (!guildData) {
    return (
      <>
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
        <NoGuildView
          playerId={playerId}
          characterLevel={characterLevel}
          error={error}
          onGuildJoined={() => { refreshGuild(); onTurnsChanged(); }}
        />
      </>
    );
  }

  return (
    <ScreenContainer>

      <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">
        [{guildData.guild.tag}] {guildData.guild.name}
      </h2>

      {error && <ErrorBanner message={error} />}
      {refreshing && <div className="text-xs text-[var(--rpg-text-secondary)] animate-pulse">Refreshing...</div>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['overview', 'members', 'upgrades', 'contracts', 'projects', 'expeditions', 'shop', 'specialization', 'log', ...(guildData.role === 'leader' || guildData.role === 'officer' ? ['settings'] : [])] as GuildTab[]).map((tab) => (
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
          onRefresh={refreshGuild}
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
      {activeTab === 'expeditions' && (
        <GuildExpeditionsTab
          guildId={guildData.guild.id}
          playerId={playerId}
          myRole={guildData.role as 'leader' | 'officer' | 'member'}
          characterLevel={characterLevel}
          setError={setError}
          onTurnsChanged={onTurnsChanged}
          onRefresh={refreshGuild}
          onExpeditionContextChange={onExpeditionContextChange}
        />
      )}
      {activeTab === 'shop' && (
        <ExpeditionShopTab setError={setError} onRefresh={refreshGuild} />
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
          onRefresh={refreshGuild}
          setError={setError}
        />
      )}
    </ScreenContainer>
  );
}
