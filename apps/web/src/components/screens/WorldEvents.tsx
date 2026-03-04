'use client';

import { useState, useEffect, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  getActiveEvents,
  getActiveBossEncounters,
  type WorldEventResponse,
  type BossEncounterResponse,
} from '@/lib/api';
import { BossEncounterPanel } from '@/components/BossEncounterPanel';
import { formatTimeRemaining } from '@/lib/format';

function effectLabel(effectType: string, effectValue: number): string {
  const sign = effectType.endsWith('_down') ? '-' : '+';
  const labels: Record<string, string> = {
    damage_up: 'Mob Damage',
    damage_down: 'Mob Damage',
    hp_up: 'Mob HP',
    hp_down: 'Mob HP',
    spawn_rate_up: 'Mob Spawns',
    spawn_rate_down: 'Mob Spawns',
    drop_rate_up: 'Drop Rate',
    drop_rate_down: 'Drop Rate',
    yield_up: 'Yield',
    yield_down: 'Yield',
  };
  return `${labels[effectType] ?? effectType} ${sign}${Math.round(effectValue * 100)}%`;
}

function eventTypeColor(type: string): string {
  if (type === 'resource') return 'var(--rpg-green-light)';
  if (type === 'boss') return 'var(--rpg-red)';
  return 'var(--rpg-gold)';
}

function EventCard({ event }: { event: WorldEventResponse }) {
  const isWorld = event.scope === 'world';
  return (
    <PixelCard className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold" style={{ color: eventTypeColor(event.type) }}>
          {event.title}
        </span>
        <div className="flex items-center gap-2">
          {isWorld && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(147, 130, 255, 0.2)', color: 'var(--rpg-blue-light)' }}
            >
              GLOBAL
            </span>
          )}
          <span className="text-xs" style={{ color: eventTypeColor(event.type) }}>
            {event.type.toUpperCase()}
          </span>
        </div>
      </div>
      {event.zoneName && (
        <p className="text-xs opacity-60 mb-1">{event.zoneName}</p>
      )}
      <p className="text-xs opacity-80 mb-2">{event.description}</p>
      <div className="flex justify-between text-xs">
        <span>{effectLabel(event.effectType, event.effectValue)}</span>
        <span className="opacity-70">
          {formatTimeRemaining(event.expiresAt)}
        </span>
      </div>
    </PixelCard>
  );
}

interface WorldEventsProps {
  currentZoneId: string | null;
  currentZoneName: string | null;
  playerId?: string | null;
  onNavigate: (screen: string) => void;
}

export function WorldEvents({ currentZoneId, currentZoneName, playerId, onNavigate }: WorldEventsProps) {
  const [events, setEvents] = useState<WorldEventResponse[]>([]);
  const [bosses, setBosses] = useState<BossEncounterResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBossId, setSelectedBossId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [eventsRes, bossRes] = await Promise.all([
      getActiveEvents(),
      getActiveBossEncounters(),
    ]);
    if (eventsRes.data) setEvents(eventsRes.data.events);
    if (bossRes.data) setBosses(bossRes.data.encounters);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const worldEvents = events.filter((e) => e.scope === 'world');
  const localEvents = currentZoneId
    ? events.filter((e) => e.scope === 'zone' && e.zoneId === currentZoneId)
    : [];
  const otherZoneEvents = currentZoneId
    ? events.filter((e) => e.scope === 'zone' && e.zoneId !== currentZoneId)
    : events.filter((e) => e.scope === 'zone');

  return (
    <div className="rpg-screen-enter space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display" style={{ color: 'var(--rpg-gold)' }}>
          World Events
        </h2>
        <PixelButton onClick={refresh} disabled={loading} size="sm">
          {loading ? 'Loading...' : 'Refresh'}
        </PixelButton>
      </div>

      {/* Boss Encounter Detail Panel */}
      {selectedBossId && (
        <BossEncounterPanel
          encounterId={selectedBossId}
          playerId={playerId ?? undefined}
          onClose={() => setSelectedBossId(null)}
          onNavigate={onNavigate}
        />
      )}

      {/* Boss Encounters */}
      {bosses.length > 0 && !selectedBossId && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--rpg-red)' }}>
            Active Boss Encounters
          </h3>
          {bosses.map((boss) => {
            const hpPercent = boss.maxHp > 0 ? Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100)) : 0;
            return (
              <PixelCard
                key={boss.id}
                className="p-3 cursor-pointer hover:brightness-110 transition-all"
                onClick={() => setSelectedBossId(boss.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold" style={{ color: 'var(--rpg-red)' }}>
                    {boss.mobName} (Lv.{boss.mobLevel})
                  </span>
                  <span className="text-xs opacity-70">
                    {boss.zoneName ?? 'Unknown Zone'}
                  </span>
                </div>
                <div className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>HP</span>
                    <span>{Math.round(hpPercent)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${hpPercent}%`,
                        background: 'var(--rpg-red)',
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Round {boss.roundNumber} — {boss.status}</span>
                  {boss.nextRoundAt && (
                    <span>Next round: {formatTimeRemaining(boss.nextRoundAt)}</span>
                  )}
                </div>
              </PixelCard>
            );
          })}
        </div>
      )}

      {/* No events */}
      {events.length === 0 && bosses.length === 0 && !loading && (
        <PixelCard className="p-4 text-center opacity-70">
          No active world events right now. Explore to discover them!
        </PixelCard>
      )}

      {/* World-wide events */}
      {worldEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--rpg-blue-light)' }}>
            Global Events
          </h3>
          {worldEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Events in current zone */}
      {localEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--rpg-green-light)' }}>
            Active in {currentZoneName ?? 'Your Zone'}
          </h3>
          {localEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Events in other zones */}
      {otherZoneEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold opacity-70">
            Other Zones
          </h3>
          {otherZoneEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
