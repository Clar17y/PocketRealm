'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  kickGuildMember, promoteGuildMember, demoteGuildMember,
  transferGuildLeadership, leaveGuild,
  type GuildResponse, type GuildMemberResponse,
} from '@/lib/api';
import { formatNumber } from '@/lib/format';

interface GuildMembersProps {
  guild: GuildResponse;
  members: GuildMemberResponse[];
  myRole: string;
  playerId: string | null;
  onRefresh: () => void;
  setError: (err: string | null) => void;
}

export function GuildMembers({
  guild,
  members,
  myRole,
  playerId,
  onRefresh,
  setError,
}: GuildMembersProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const isLeader = myRole === 'leader';
  const isOfficer = myRole === 'officer' || isLeader;

  const handleAction = async (action: string, targetId: string) => {
    setActionLoading(true);
    setError(null);
    try {
      let res: { error?: { message: string } } = {};
      switch (action) {
        case 'kick': res = await kickGuildMember(guild.id, targetId); break;
        case 'promote': res = await promoteGuildMember(guild.id, targetId); break;
        case 'demote': res = await demoteGuildMember(guild.id, targetId); break;
        case 'transfer': res = await transferGuildLeadership(guild.id, targetId); break;
      }
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this guild?')) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await leaveGuild(guild.id);
      if (res.error) { setError(res.error.message); return; }
      onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to leave');
    } finally {
      setActionLoading(false);
    }
  };

  const roleColor = (role: string) => {
    switch (role) {
      case 'leader': return 'text-[var(--rpg-gold)]';
      case 'officer': return 'text-[var(--rpg-blue-light)]';
      default: return 'text-[var(--rpg-text-secondary)]';
    }
  };

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <PixelCard key={member.playerId}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                {member.username}
                <span className={`ml-2 text-xs capitalize ${roleColor(member.role)}`}>{member.role}</span>
                {member.isActive && <span className="ml-2 w-2 h-2 inline-block rounded-full bg-[var(--rpg-green-light)]" />}
              </p>
              <p className="text-xs text-[var(--rpg-text-secondary)]">
                Level {member.characterLevel} &middot; Contributed {formatNumber(member.totalTurnsContributed)} turns
              </p>
            </div>
            {member.playerId !== playerId && isOfficer && member.role !== 'leader' && (
              <div className="flex gap-1 flex-shrink-0">
                {isLeader && member.role === 'member' && (
                  <button
                    onClick={() => handleAction('promote', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]"
                  >
                    Promote
                  </button>
                )}
                {isLeader && member.role === 'officer' && (
                  <button
                    onClick={() => handleAction('demote', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-text-secondary)]/20 text-[var(--rpg-text-secondary)]"
                  >
                    Demote
                  </button>
                )}
                {(isLeader || (myRole === 'officer' && member.role === 'member')) && (
                  <button
                    onClick={() => handleAction('kick', member.playerId)}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]"
                  >
                    Kick
                  </button>
                )}
                {isLeader && (
                  <button
                    onClick={() => {
                      if (confirm(`Transfer leadership to ${member.username}?`)) {
                        void handleAction('transfer', member.playerId);
                      }
                    }}
                    disabled={actionLoading}
                    className="text-xs px-2 py-1 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]"
                  >
                    Transfer
                  </button>
                )}
              </div>
            )}
          </div>
        </PixelCard>
      ))}

      {myRole !== 'leader' && (
        <div className="pt-2">
          <PixelButton onClick={handleLeave} disabled={actionLoading}>
            Leave Guild
          </PixelButton>
        </div>
      )}
    </div>
  );
}
