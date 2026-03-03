'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  updateGuildSettings, disbandGuild,
  getGuildJoinRequests, acceptJoinRequest, rejectJoinRequest,
  type GuildResponse, type GuildJoinRequestResponse,
} from '@/lib/api';
import { GUILD_CONSTANTS } from '@adventure/shared';

// ---------------------------------------------------------------------------
// Join Requests (sub-section of settings)
// ---------------------------------------------------------------------------

function JoinRequestsSection({
  guildId,
  onRefresh,
  setError,
}: {
  guildId: string;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}) {
  const [requests, setRequests] = useState<GuildJoinRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildJoinRequests(guildId);
      if (res.data) setRequests(res.data.requests);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [guildId, setError]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const handleRespond = async (requestId: string, accept: boolean) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = accept
        ? await acceptJoinRequest(guildId, requestId)
        : await rejectJoinRequest(guildId, requestId);
      if (res.error) { setError(res.error.message); return; }
      await loadRequests();
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <p className="text-sm opacity-60">Loading requests...</p>;

  if (requests.length === 0) {
    return <p className="text-sm text-[var(--rpg-text-secondary)]">No pending join requests.</p>;
  }

  return (
    <div className="space-y-2">
      {requests.map((req) => (
        <div
          key={req.id}
          className="p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)] flex justify-between items-center"
        >
          <div>
            <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{req.username}</p>
            <p className="text-xs text-[var(--rpg-text-secondary)]">Level {req.characterLevel}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleRespond(req.id, true)}
              disabled={actionLoading}
              className="text-xs px-2 py-1 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]"
            >
              Accept
            </button>
            <button
              onClick={() => handleRespond(req.id, false)}
              disabled={actionLoading}
              className="text-xs px-2 py-1 rounded bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guild Settings
// ---------------------------------------------------------------------------

interface GuildSettingsProps {
  guild: GuildResponse;
  myRole: string;
  playerId: string | null;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}

export function GuildSettings({
  guild,
  myRole,
  playerId,
  onRefresh,
  setError,
}: GuildSettingsProps) {
  const [recruitmentMode, setRecruitmentMode] = useState(guild.recruitmentMode);
  const [taxRate, setTaxRate] = useState(guild.taxRate);
  const [minLevel, setMinLevel] = useState(guild.minLevelRequirement);
  const [desc, setDesc] = useState(guild.description || '');
  const [saving, setSaving] = useState(false);
  const [disbanding, setDisbanding] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateGuildSettings(guild.id, {
        recruitmentMode,
        taxRate,
        minLevelRequirement: minLevel,
        description: desc || null,
      });
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDisband = async () => {
    if (!confirm('Are you sure you want to DISBAND this guild? This cannot be undone!')) return;
    if (!confirm('This will remove ALL members. Are you absolutely sure?')) return;
    setDisbanding(true);
    setError(null);
    try {
      const res = await disbandGuild(guild.id);
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disband');
    } finally {
      setDisbanding(false);
    }
  };

  return (
    <div className="space-y-3">
      {guild.recruitmentMode === 'request_to_join' && (myRole === 'leader' || myRole === 'officer') && (
        <PixelCard>
          <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Join Requests</h3>
          <JoinRequestsSection guildId={guild.id} onRefresh={onRefresh} setError={setError} />
        </PixelCard>
      )}
      <PixelCard>
        <h3 className="text-lg font-bold text-[var(--rpg-text-primary)] mb-3">Guild Settings</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Recruitment Mode</label>
            <select
              value={recruitmentMode}
              onChange={(e) => setRecruitmentMode(e.target.value)}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            >
              <option value="open">Open</option>
              <option value="request_to_join">Request to Join</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Tax Rate (0-{GUILD_CONSTANTS.MAX_TAX_RATE}%)</label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(Math.min(GUILD_CONSTANTS.MAX_TAX_RATE, Math.max(0, parseInt(e.target.value) || 0)))}
              min={0}
              max={GUILD_CONSTANTS.MAX_TAX_RATE}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Minimum Level Requirement</label>
            <input
              type="number"
              value={minLevel}
              onChange={(e) => setMinLevel(Math.max(0, parseInt(e.target.value) || 0))}
              min={0}
              max={100}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
            />
          </div>
          <div>
            <label className="text-sm text-[var(--rpg-text-secondary)]">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={GUILD_CONSTANTS.MAX_DESCRIPTION_LENGTH}
              rows={2}
              className="w-full mt-1 p-2 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)] resize-none"
            />
          </div>
          <PixelButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </PixelButton>
        </div>
      </PixelCard>

      {myRole === 'leader' && (
        <PixelCard>
          <h3 className="text-lg font-bold text-[var(--rpg-red)] mb-2">Danger Zone</h3>
          <PixelButton onClick={handleDisband} disabled={disbanding}>
            {disbanding ? 'Disbanding...' : 'Disband Guild'}
          </PixelButton>
        </PixelCard>
      )}
    </div>
  );
}
