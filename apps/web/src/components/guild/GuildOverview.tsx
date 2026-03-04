'use client';

import { PixelCard } from '@/components/PixelCard';
import { type GuildResponse, type GuildMemberResponse } from '@/lib/api';
import { GUILD_CONSTANTS } from '@adventure/shared';
import { formatNumber } from '@/lib/format';

interface GuildOverviewProps {
  guild: GuildResponse;
  members: GuildMemberResponse[];
}

export function GuildOverview({ guild, members }: GuildOverviewProps) {
  const activeCount = members.filter((m) => m.isActive).length;
  const xpNum = BigInt(guild.xp);
  const xpForNext = Math.floor(GUILD_CONSTANTS.XP_PER_LEVEL_BASE * guild.level ** GUILD_CONSTANTS.XP_PER_LEVEL_EXPONENT);
  const xpPercent = xpForNext > 0 ? Math.min(100, Number(xpNum * BigInt(100) / BigInt(xpForNext))) : 0;

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Level</span>
            <p className="font-bold font-pixel text-[var(--rpg-gold)]">{guild.level}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Members</span>
            <p className="font-bold font-pixel">{guild.memberCount}/{guild.maxMembers}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Treasury</span>
            <p className="font-bold font-pixel">{formatNumber(guild.treasuryTurns)}/{formatNumber(guild.treasuryCap)}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Tax Rate</span>
            <p className="font-bold font-pixel">{guild.taxRate}%</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Active Members</span>
            <p className="font-bold font-pixel text-[var(--rpg-green-light)]">{activeCount}/{guild.memberCount}</p>
          </div>
          <div>
            <span className="text-[var(--rpg-text-secondary)]">Renown</span>
            <p className="font-bold font-pixel">{formatNumber(guild.renown)}</p>
          </div>
        </div>
      </PixelCard>

      <PixelCard>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--rpg-text-secondary)]">Guild XP</span>
          <span className="text-[var(--rpg-text-secondary)]">{xpNum.toString()}/{formatNumber(xpForNext)}</span>
        </div>
        <div className="w-full h-3 bg-[var(--rpg-background)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--rpg-gold)] transition-all"
            style={{ width: `${xpPercent}%` }}
          />
        </div>
      </PixelCard>

      {guild.description && (
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)]">{guild.description}</p>
        </PixelCard>
      )}

      {guild.specialization && (
        <PixelCard>
          <span className="text-[var(--rpg-text-secondary)] text-sm">Specialization</span>
          <p className="font-bold capitalize text-[var(--rpg-purple)]">{guild.specialization}</p>
        </PixelCard>
      )}
    </div>
  );
}
