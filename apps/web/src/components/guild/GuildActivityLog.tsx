'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { Pagination } from '@/components/common/Pagination';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { getGuildLog, type GuildLogResponse } from '@/lib/api';
import { GUILD_CONSTANTS } from '@pocketrealm/shared';

interface GuildActivityLogProps {
  guildId: string;
}

export function GuildActivityLog({ guildId }: GuildActivityLogProps) {
  const [logData, setLogData] = useState<GuildLogResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadLog = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await getGuildLog(guildId, p);
      if (res.data) { setLogData(res.data); setPage(p); }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void loadLog(1);
  }, [loadLog]);

  if (loading && !logData) {
    return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;
  }

  return (
    <div className="space-y-2">
      {logData?.entries.map((entry) => (
        <div key={entry.id} className="p-2 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
          <p className="text-sm text-[var(--rpg-text-primary)]">{entry.message}</p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
      ))}

      {logData && logData.total > GUILD_CONSTANTS.LOG_PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={Math.ceil(logData.total / GUILD_CONSTANTS.LOG_PAGE_SIZE)}
          onPageChange={(p) => loadLog(p)}
        />
      )}

      {logData?.entries.length === 0 && (
        <PixelCard><p className="text-sm text-[var(--rpg-text-secondary)]">No activity yet.</p></PixelCard>
      )}
    </div>
  );
}
