'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { PixelButton } from '@/components/PixelButton';
import { ActivityLog } from '@/components/ActivityLog';
import { TurnPlayback } from '@/components/playback/TurnPlayback';
import type { ActivityLogEntry } from '@/app/game/useGameController';
import { MapPin, Star, Hourglass, Lock } from 'lucide-react';

function getMilestoneHint(percent: number): ReactNode {
  if (percent >= 75) return <p className="text-xs text-amber-400 mt-1 italic">The apex predator stirs...</p>;
  if (percent >= 50) return <p className="text-xs text-red-400 mt-1 italic">Dangerous creatures lurk ahead...</p>;
  if (percent >= 25) return <p className="text-xs text-yellow-400 mt-1 italic">Larger creatures roam deeper in...</p>;
  return <p className="text-xs text-[var(--rpg-text-secondary)] mt-1 italic">Only small creatures roam the outskirts.</p>;
}

interface ZoneMapProps {
  zones: Array<{
    id: string;
    name: string;
    description: string | null;
    difficulty: number;
    travelCost: number;
    discovered: boolean;
    zoneType: string;
    imageSrc?: string;
    exploration: {
      turnsExplored: number;
      turnsToExplore: number | null;
      percent: number;
      tiers: Record<string, number> | null;
    } | null;
  }>;
  connections: Array<{ fromId: string; toId: string; explorationThreshold: number }>;
  currentZoneId: string;
  availableTurns: number;
  isRecovering: boolean;
  playbackActive?: boolean;
  travelPlaybackData?: {
    totalTurns: number;
    destinationName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBefore: number;
    playerMaxHp: number;
  } | null;
  onTravelPlaybackComplete?: () => void;
  onTravelPlaybackSkip?: () => void;
  onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
  activityLog?: ActivityLogEntry[];
  combatSpeedMs?: number;
  explorationSpeedMs?: number;
  onTravel: (zoneId: string) => void;
  onExploreCurrentZone: () => void;
}

/** BFS from the starter zone to compute shortest-path tier for each zone. */
function computeTiers(
  zones: ZoneMapProps['zones'],
  connections: ZoneMapProps['connections'],
): Map<string, number> {
  const starterZone = zones.find(
    (z) => z.discovered && z.travelCost === 0 && z.zoneType === 'town',
  );
  if (!starterZone) return new Map();

  // Build adjacency as undirected so BFS can traverse both directions
  const graph = new Map<string, string[]>();
  for (const conn of connections) {
    if (!graph.has(conn.fromId)) graph.set(conn.fromId, []);
    graph.get(conn.fromId)!.push(conn.toId);
    if (!graph.has(conn.toId)) graph.set(conn.toId, []);
    graph.get(conn.toId)!.push(conn.fromId);
  }

  const tiers = new Map<string, number>();
  const queue = [starterZone.id];
  tiers.set(starterZone.id, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentTier = tiers.get(current)!;
    for (const neighbor of graph.get(current) ?? []) {
      if (!tiers.has(neighbor)) {
        tiers.set(neighbor, currentTier + 1);
        queue.push(neighbor);
      }
    }
  }
  return tiers;
}

// Fixed grid dimensions for line drawing
const NODE_W = 168;
const NODE_H = 220;
const ROW_GAP = 44;
const COL_GAP = 16;

export function ZoneMap({
  zones,
  connections,
  currentZoneId,
  availableTurns,
  isRecovering,
  playbackActive,
  travelPlaybackData,
  onTravelPlaybackComplete,
  onTravelPlaybackSkip,
  onPushLog,
  activityLog,
  combatSpeedMs,
  explorationSpeedMs,
  onTravel,
  onExploreCurrentZone,
}: ZoneMapProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // After travel playback finishes, auto-select the zone the player ended up in
  useEffect(() => {
    if (!travelPlaybackData && currentZoneId) {
      setSelectedZoneId(currentZoneId);
    }
  }, [travelPlaybackData, currentZoneId]);

  const tiers = useMemo(() => computeTiers(zones, connections), [zones, connections]);

  // Group zones by tier
  const tierRows = useMemo(() => {
    const rows = new Map<number, typeof zones>();
    for (const zone of zones) {
      const tier = tiers.get(zone.id) ?? -1;
      if (tier < 0) continue; // unreachable zone
      if (!rows.has(tier)) rows.set(tier, []);
      rows.get(tier)!.push(zone);
    }
    // Sort by tier ascending
    return Array.from(rows.entries()).sort(([a], [b]) => a - b);
  }, [zones, tiers]);

  // Compute center positions for each zone node (for SVG lines)
  const zonePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    let maxRowWidth = 0;

    for (const [, rowZones] of tierRows) {
      const rowWidth = rowZones.length * NODE_W + (rowZones.length - 1) * COL_GAP;
      if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
    }

    for (let rowIdx = 0; rowIdx < tierRows.length; rowIdx++) {
      const [, rowZones] = tierRows[rowIdx];
      const rowWidth = rowZones.length * NODE_W + (rowZones.length - 1) * COL_GAP;
      const offsetX = (maxRowWidth - rowWidth) / 2;
      const y = rowIdx * (NODE_H + ROW_GAP) + NODE_H / 2;

      for (let colIdx = 0; colIdx < rowZones.length; colIdx++) {
        const x = offsetX + colIdx * (NODE_W + COL_GAP) + NODE_W / 2;
        positions.set(rowZones[colIdx].id, { x, y });
      }
    }

    return positions;
  }, [tierRows]);

  // Total SVG size
  const svgSize = useMemo(() => {
    let maxRowWidth = 0;
    for (const [, rowZones] of tierRows) {
      const rowWidth = rowZones.length * NODE_W + (rowZones.length - 1) * COL_GAP;
      if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
    }
    return {
      width: Math.max(maxRowWidth, NODE_W),
      height: tierRows.length * (NODE_H + ROW_GAP) - ROW_GAP,
    };
  }, [tierRows]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId);
  const canTravel =
    selectedZone &&
    selectedZone.discovered &&
    selectedZone.id !== currentZoneId &&
    !isRecovering &&
    !playbackActive &&
    availableTurns >= selectedZone.travelCost;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">World Map</h2>
        <MapPin size={20} color="var(--rpg-gold)" />
      </div>

      {/* Tiered map */}
      <div className="overflow-x-auto pb-1">
        <div
          className="relative mx-auto"
          style={{ width: svgSize.width, minHeight: svgSize.height }}
        >
          {/* SVG connection lines */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={svgSize.width}
            height={svgSize.height}
            style={{ zIndex: 0 }}
          >
            {connections.map((conn) => {
              const from = zonePositions.get(conn.fromId);
              const to = zonePositions.get(conn.toId);
              if (!from || !to) return null;
              return (
                <line
                  key={`${conn.fromId}-${conn.toId}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="var(--rpg-border)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              );
            })}
          </svg>

          {/* Zone nodes */}
          {tierRows.map(([tier, rowZones]) => {
            const rowWidth = rowZones.length * NODE_W + (rowZones.length - 1) * COL_GAP;
            let maxRowWidth = 0;
            for (const [, rz] of tierRows) {
              const w = rz.length * NODE_W + (rz.length - 1) * COL_GAP;
              if (w > maxRowWidth) maxRowWidth = w;
            }
            const offsetX = (maxRowWidth - rowWidth) / 2;
            const rowY = tierRows.findIndex(([t]) => t === tier) * (NODE_H + ROW_GAP);

            return rowZones.map((zone, colIdx) => {
              const x = offsetX + colIdx * (NODE_W + COL_GAP);
              const isCurrent = zone.id === currentZoneId;
              const isSelected = zone.id === selectedZoneId;
              const isUndiscovered = !zone.discovered;

              return (
                <button
                  key={zone.id}
                  onClick={() => {
                    if (!isUndiscovered && !playbackActive) setSelectedZoneId(zone.id);
                  }}
                  disabled={isUndiscovered}
                  className="absolute flex flex-col items-center justify-center text-center transition-all"
                  style={{
                    left: x,
                    top: rowY,
                    width: NODE_W,
                    height: NODE_H,
                    zIndex: 1,
                  }}
                >
                  {/* Node card */}
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: isUndiscovered
                        ? 'var(--rpg-background)'
                        : 'var(--rpg-bg-medium, var(--rpg-surface))',
                      border: isCurrent
                        ? '2px solid var(--rpg-gold)'
                        : isSelected
                          ? '2px solid var(--rpg-blue-light)'
                          : '1px solid var(--rpg-border)',
                      borderRadius: 8,
                      opacity: isUndiscovered ? 0.4 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: 6,
                      paddingRight: 4,
                      paddingBottom: 6,
                      paddingLeft: 4,
                      boxSizing: 'border-box',
                      cursor: isUndiscovered ? 'not-allowed' : 'pointer',
                      boxShadow: isCurrent
                        ? '0 0 8px var(--rpg-gold)'
                        : isSelected
                          ? '0 0 6px var(--rpg-blue-light)'
                          : 'none',
                    }}
                  >
                    {/* Zone icon */}
                    <div
                      style={{
                        width: 144,
                        height: 144,
                        padding: 8,
                        border: '1px solid var(--rpg-border)',
                        borderRadius: 6,
                        background: 'var(--rpg-background)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}
                    >
                      {zone.imageSrc && !isUndiscovered ? (
                        <img
                          src={zone.imageSrc}
                          alt={zone.name}
                          className="image-rendering-pixelated"
                          style={{ width: 128, height: 128, objectFit: 'contain' }}
                        />
                      ) : (
                        <span style={{ fontSize: 48 }}>
                          {isUndiscovered ? '?' : zone.zoneType === 'town' ? '\u{1F3D8}\uFE0F' : '\u{1F332}'}
                        </span>
                      )}
                    </div>

                    {/* Zone name */}
                    <span
                      style={{
                        fontSize: 12,
                        lineHeight: '14px',
                        fontWeight: 700,
                        color: isUndiscovered
                          ? 'var(--rpg-text-secondary)'
                          : 'var(--rpg-text-primary)',
                        marginTop: 4,
                        maxWidth: '96%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isUndiscovered ? '???' : zone.name}
                    </span>

                    {/* Difficulty stars */}
                    {!isUndiscovered && (
                      <div style={{ display: 'flex', gap: 1, marginTop: 2 }}>
                        {Array.from({ length: Math.min(zone.difficulty, 5) }).map((_, idx) => (
                          <Star
                            key={idx}
                            size={9}
                            fill="var(--rpg-gold)"
                            color="var(--rpg-gold)"
                          />
                        ))}
                      </div>
                    )}

                    {/* Travel cost badge */}
                    {!isUndiscovered && zone.travelCost > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 2,
                          fontSize: 10,
                          color: 'var(--rpg-gold)',
                        }}
                      >
                        <Hourglass size={9} />
                        <span>{zone.travelCost}</span>
                      </div>
                    )}

                    {/* Current badge */}
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--rpg-gold)',
                          fontWeight: 700,
                          marginTop: 1,
                        }}
                      >
                        HERE
                      </span>
                    )}
                  </div>
                </button>
              );
            });
          })}
        </div>
      </div>

      {/* Selected zone details panel — hidden during travel playback */}
      {!travelPlaybackData && selectedZone && selectedZone.discovered && (
        <div
          style={{
            background: 'var(--rpg-surface)',
            border: '1px solid var(--rpg-border)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-[var(--rpg-text-primary)]">
              {selectedZone.name}
              {selectedZone.id === currentZoneId && (
                <span className="ml-2 text-xs text-[var(--rpg-gold)]">(Current)</span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(selectedZone.difficulty, 5) }).map((_, idx) => (
                <Star key={idx} size={12} fill="var(--rpg-gold)" color="var(--rpg-gold)" />
              ))}
            </div>
          </div>

          {selectedZone.description && (
            <p className="text-sm leading-snug text-[var(--rpg-text-secondary)] mb-2">
              {selectedZone.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm mb-3">
            {selectedZone.zoneType === 'town' && (
              <span className="text-[var(--rpg-text-secondary)]">{'\u{1F3D8}\uFE0F'} Town</span>
            )}
            {selectedZone.travelCost > 0 && (
              <div className="flex items-center gap-1 text-[var(--rpg-gold)]">
                <Hourglass size={12} />
                <span>{selectedZone.travelCost} turns</span>
              </div>
            )}
          </div>

          {/* Exploration progress bar */}
          {selectedZone.exploration && selectedZone.exploration.turnsToExplore && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-[var(--rpg-text-secondary)] mb-1">
                <span>{Math.floor(selectedZone.exploration.percent)}% Explored</span>
                <span>{selectedZone.exploration.turnsExplored.toLocaleString()} / {selectedZone.exploration.turnsToExplore.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--rpg-background)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--rpg-gold)] transition-all"
                  style={{ width: `${Math.min(100, selectedZone.exploration.percent)}%` }}
                />
              </div>
              {getMilestoneHint(selectedZone.exploration.percent)}
            </div>
          )}

          {/* Locked zone exits */}
          {(() => {
            const selectedExploration = selectedZone.exploration;
            if (!selectedExploration || selectedZone.zoneType === 'town') return null;

            const lockedExits = connections
              .filter((conn) => conn.fromId === selectedZone.id && conn.explorationThreshold > 0)
              .filter((conn) => {
                const targetZone = zones.find((z) => z.id === conn.toId);
                return targetZone && !targetZone.discovered && selectedExploration.percent < conn.explorationThreshold;
              })
              .map((conn) => {
                const targetZone = zones.find((z) => z.id === conn.toId);
                return { toId: conn.toId, toName: targetZone?.name ?? '???', explorationThreshold: conn.explorationThreshold };
              });

            if (lockedExits.length === 0) return null;

            return (
              <div className="mb-3 space-y-1">
                {lockedExits.map((exit) => (
                  <div key={exit.toId} className="flex items-center gap-1.5 text-xs text-[var(--rpg-text-secondary)] opacity-50">
                    <Lock size={10} />
                    <span>{exit.toName} -- requires {exit.explorationThreshold}% explored (currently {Math.floor(selectedExploration.percent)}%)</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {selectedZone.id === currentZoneId && (
            <PixelButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={onExploreCurrentZone}
            >
              Explore {selectedZone.name}
            </PixelButton>
          )}

          {selectedZone.id !== currentZoneId && (
            <PixelButton
              variant="gold"
              size="md"
              className="w-full"
              onClick={() => onTravel(selectedZone.id)}
              disabled={!canTravel}
            >
              {isRecovering
                ? 'Recover first to travel'
                : availableTurns < selectedZone.travelCost
                ? `Need ${selectedZone.travelCost} turns (have ${availableTurns})`
                : `Travel to ${selectedZone.name} (${selectedZone.travelCost} turns)`}
            </PixelButton>
          )}
        </div>
      )}

      {/* Travel playback panel */}
      {travelPlaybackData && (
        <div
          style={{
            background: 'var(--rpg-surface)',
            border: '1px solid var(--rpg-border)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <TurnPlayback
            totalTurns={travelPlaybackData.totalTurns}
            label={`Travelling to ${travelPlaybackData.destinationName}`}
            events={travelPlaybackData.events}
            aborted={travelPlaybackData.aborted}
            refundedTurns={travelPlaybackData.refundedTurns}
            playerHpBefore={travelPlaybackData.playerHpBefore}
            playerMaxHp={travelPlaybackData.playerMaxHp}
            combatSpeedMs={combatSpeedMs}
            explorationSpeedMs={explorationSpeedMs}
            onComplete={onTravelPlaybackComplete!}
            onSkip={onTravelPlaybackSkip!}
            onPushLog={onPushLog}
          />
        </div>
      )}

      {/* Activity log */}
      {activityLog && <ActivityLog entries={activityLog} />}
    </div>
  );
}
