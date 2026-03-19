'use client';

import { useMemo } from 'react';
import { Shield } from 'lucide-react';

export interface ThreatEntry {
  id: string;
  label: string;
  threatValue: number;
}

export interface ThreatMeterProps {
  entries: ThreatEntry[];
}

export function ThreatMeter({ entries }: ThreatMeterProps) {
  const standings = useMemo(() => {
    const active = entries.filter(e => e.threatValue > 0);
    if (active.length === 0) return [];
    const maxThreat = Math.max(...active.map(e => e.threatValue), 1);
    return active
      .map(e => ({
        ...e,
        percent: (e.threatValue / maxThreat) * 100,
      }))
      .sort((a, b) => b.threatValue - a.threatValue);
  }, [entries]);

  if (standings.length === 0) return null;

  const aggroId = standings[0].threatValue > 0 ? standings[0].id : null;

  return (
    <div className="mb-2 pb-2 border-b border-[var(--rpg-border)]">
      <p className="text-[10px] font-bold text-[var(--rpg-text-secondary)] mb-1 flex items-center gap-1">
        <Shield size={10} className="text-[var(--rpg-red)]" />
        THREAT
        {aggroId && (
          <span className="font-normal ml-1">
            — <span className="text-[var(--rpg-red)]">{standings[0].label}</span> has aggro
          </span>
        )}
      </p>
      <div className="space-y-0.5">
        {standings.map((t) => {
          const isAggro = t.id === aggroId;
          return (
            <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
              <span
                className="w-16 truncate"
                style={{ color: isAggro ? 'var(--rpg-red)' : 'var(--rpg-text-secondary)' }}
              >
                {t.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(t.percent, t.threatValue > 0 ? 2 : 0)}%`,
                    background: isAggro ? 'var(--rpg-red)' : 'rgba(255,255,255,0.25)',
                  }}
                />
              </div>
              <span
                className="w-6 text-right tabular-nums"
                style={{ color: isAggro ? 'var(--rpg-red)' : 'var(--rpg-text-secondary)' }}
              >
                {t.threatValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
