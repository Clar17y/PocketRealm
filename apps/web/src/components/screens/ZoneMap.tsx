'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { PixelButton } from '@/components/PixelButton';
import { ActivityLog } from '@/components/ActivityLog';
import { TurnPlayback } from '@/components/playback/TurnPlayback';
import { PlaybackSurface } from '@/components/playback/PlaybackSurface';
import type { ActivityLogEntry, BestiarySkipEntry } from '@/app/game/gameController.types';
import type { CombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import { MapPin, Star, Hourglass, Lock, Home } from 'lucide-react';
import { inflateCost } from '@/lib/taxCalc';
import { buildZoneAdjacency, findShortestZonePath } from '@/lib/zoneRoutes';
import { FeatureTutorial } from '@/components/common/FeatureTutorial';
import { ScreenContainer } from '../common/ScreenContainer';

function getMilestoneHint(percent: number): ReactNode {
  if (percent >= 75) return <p className="text-xs text-amber-400 mt-1 italic">Apex — The apex predator stirs...</p>;
  if (percent >= 50) return <p className="text-xs text-red-400 mt-1 italic">Depths — Dangerous creatures lurk ahead...</p>;
  if (percent >= 25) return <p className="text-xs text-yellow-400 mt-1 italic">Interior — Larger creatures roam deeper in...</p>;
  return <p className="text-xs text-[var(--rpg-text-secondary)] mt-1 italic">Outskirts — Only small creatures roam here.</p>;
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
  isOverEncumbered: boolean;
  playbackActive?: boolean;
  travelPlaybackData?: {
    totalTurns: number;
    destinationName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBefore: number;
    playerMaxHp: number;
    currentHop: number;
    totalHops: number;
    finalDestinationName: string;
  } | null;
  onTravelPlaybackComplete?: () => void;
  onTravelPlaybackSkip?: () => void;
  onPushLog?: (...entries: Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'danger' }>) => void;
  activityLog?: ActivityLogEntry[];
  combatSpeedMs?: number;
  explorationSpeedMs?: number;
  autoSkipKnownCombat?: boolean;
  bestiaryMobs?: BestiarySkipEntry[];
  onTravel: (zoneId: string) => void;
  onExploreCurrentZone: () => void;
  guildTaxRate?: number;
  undiscoveredZones?: Array<{ id: string; name: string; explorationThreshold: number; fromZoneId: string }>;
  combatLogPrefetch?: CombatLogPrefetch;
  playerStartStamina?: number;
  playerStartMana?: number;
  playerMaxStamina?: number;
  playerMaxMana?: number;
  homeTownId?: string | null;
  onSetHomeTown?: (zoneId: string) => void;
}

type ZoneMapZone = ZoneMapProps['zones'][number];

/** BFS from the starter zone to compute shortest-path tier for each zone. */
function computeTiers(
  zones: ZoneMapProps['zones'],
  connections: ZoneMapProps['connections'],
): Map<string, number> {
  const starterZone = zones.find(
    (z) => z.discovered && z.travelCost === 0 && z.zoneType === 'town',
  );
  if (!starterZone) return new Map();

  const graph = buildZoneAdjacency(connections, { bidirectional: true });

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
  isOverEncumbered,
  playbackActive,
  travelPlaybackData,
  onTravelPlaybackComplete,
  onTravelPlaybackSkip,
  onPushLog,
  activityLog,
  combatSpeedMs,
  explorationSpeedMs,
  autoSkipKnownCombat,
  bestiaryMobs,
  onTravel,
  onExploreCurrentZone,
  guildTaxRate = 0,
  undiscoveredZones,
  combatLogPrefetch,
  playerStartStamina,
  playerStartMana,
  playerMaxStamina,
  playerMaxMana,
  homeTownId,
  onSetHomeTown,
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

  const zoneById = useMemo(
    () => new Map(zones.map((zone) => [zone.id, zone])),
    [zones],
  );
  const selectedZone = selectedZoneId ? zoneById.get(selectedZoneId) : undefined;
  const currentZone = zoneById.get(currentZoneId);
  const selectedRouteIds = useMemo(() => {
    if (!selectedZoneId) return null;
    return findShortestZonePath(currentZoneId, selectedZoneId, connections);
  }, [selectedZoneId, currentZoneId, connections]);
  const selectedRouteZones = useMemo(
    () => (selectedRouteIds ?? [])
      .map((zoneId) => zoneById.get(zoneId))
      .filter((zone): zone is ZoneMapZone => zone !== undefined),
    [selectedRouteIds, zoneById],
  );
  const routeHopCount = Math.max(0, selectedRouteZones.length - 1);
  const nextHopZone = routeHopCount > 0 ? selectedRouteZones[1] : null;
  const firstHopBaseCost = (() => {
    if (!selectedZone || selectedZone.id === currentZoneId || !currentZone || !nextHopZone) return null;
    if (currentZone.zoneType === 'town') return nextHopZone.travelCost;
    return currentZone.travelCost;
  })();
  const firstHopInflatedCost = firstHopBaseCost === null
    ? null
    : inflateCost(firstHopBaseCost, guildTaxRate);
  const displayedTravelCost = firstHopInflatedCost ?? inflateCost(selectedZone?.travelCost ?? 0, guildTaxRate);
  const canTravel =
    selectedZone &&
    selectedZone.discovered &&
    selectedZone.id !== currentZoneId &&
    !!selectedRouteIds &&
    !isRecovering &&
    !isOverEncumbered &&
    !playbackActive &&
    (firstHopInflatedCost === null || availableTurns >= firstHopInflatedCost);

  return (
    <ScreenContainer>
      <FeatureTutorial storageKey="howto_zones" title="Zone Map">
        <p>
          The world is made up of connected zones. <strong>Travel</strong> between them
          by spending turns. Click any discovered zone to auto-path through intermediate zones.
        </p>
        <p>
          <strong>Wild zones</strong> have monsters and resources. <strong>Town zones</strong>
          offer crafting, the forge, stash, and shops.
        </p>
        <p>
          Explore deeper into a zone to unlock higher-tier mobs and discover connections
          to new areas.
        </p>
        <p className="text-[var(--rpg-green-light)]">
          <strong>Tip:</strong> Returning to a previously visited zone via breadcrumb is free.
        </p>
      </FeatureTutorial>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">World Map</h2>
        <MapPin size={20} color="var(--rpg-gold)" />
      </div>

      {/* Primary action/playback region — stays in the focus area while the map scrolls */}
      {travelPlaybackData ? (
        <PlaybackSurface
          mode="overlay"
          title="Travel Playback"
          subtitle={`Travelling to ${travelPlaybackData.destinationName}`}
          progressLabel={travelPlaybackData.totalHops > 1
            ? `${travelPlaybackData.currentHop}/${travelPlaybackData.totalHops} to ${travelPlaybackData.finalDestinationName}`
            : undefined}
        >
          <TurnPlayback
            totalTurns={travelPlaybackData.totalTurns}
            label={travelPlaybackData.totalHops > 1
              ? `Travelling to ${travelPlaybackData.destinationName} (${travelPlaybackData.currentHop}/${travelPlaybackData.totalHops} to ${travelPlaybackData.finalDestinationName})`
              : `Travelling to ${travelPlaybackData.destinationName}`}
            events={travelPlaybackData.events}
            aborted={travelPlaybackData.aborted}
            refundedTurns={travelPlaybackData.refundedTurns}
            playerHpBefore={travelPlaybackData.playerHpBefore}
            playerMaxHp={travelPlaybackData.playerMaxHp}
            combatSpeedMs={combatSpeedMs}
            explorationSpeedMs={explorationSpeedMs}
            autoSkipKnownCombat={autoSkipKnownCombat}
            bestiaryMobs={bestiaryMobs}
            onComplete={onTravelPlaybackComplete!}
            onSkip={onTravelPlaybackSkip!}
            onPushLog={onPushLog}
            combatLogPrefetch={combatLogPrefetch}
            playerStartStamina={playerStartStamina}
            playerStartMana={playerStartMana}
            playerMaxStamina={playerMaxStamina}
            playerMaxMana={playerMaxMana}
            embedded
          />
        </PlaybackSurface>
      ) : selectedZone && selectedZone.discovered && (
        <div
          className="sticky top-2 z-20"
          style={{
            background: 'color-mix(in srgb, var(--rpg-surface) 94%, transparent)',
            border: '1px solid var(--rpg-border)',
            borderRadius: 8,
            padding: 12,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.28)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-semibold font-almendra text-[var(--rpg-text-primary)]">
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-3">
            {selectedZone.zoneType === 'town' && (
              <span className="text-[var(--rpg-text-secondary)]">{'\u{1F3D8}\uFE0F'} Town</span>
            )}
            {selectedZone.travelCost > 0 && selectedZone.id !== currentZoneId && (
              <div className="flex items-center gap-1 text-[var(--rpg-gold)]">
                <Hourglass size={12} />
                <span>
                  {routeHopCount > 1
                    ? `${displayedTravelCost} turns next hop`
                    : `${displayedTravelCost} turns`}
                </span>
              </div>
            )}
          </div>

          {selectedZone.id !== currentZoneId && (
            <div className="mb-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/70 px-3 py-2">
              {selectedRouteIds ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rpg-text-secondary)] mb-1">
                    Route
                  </p>
                  <p className="text-sm text-[var(--rpg-text-primary)]">
                    {routeHopCount > 1
                      ? `${routeHopCount} hops via ${selectedRouteZones
                        .slice(1, -1)
                        .map((zone) => zone.name)
                        .join(' -> ')}`
                      : `Direct travel to ${selectedZone.name}`}
                  </p>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                    {selectedRouteZones.map((zone) => zone.name).join(' -> ')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-red-300">No discovered route to this zone yet.</p>
              )}
            </div>
          )}

          {/* Exploration progress bar */}
          {selectedZone.exploration && selectedZone.exploration.turnsToExplore && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-[var(--rpg-text-secondary)] mb-1">
                <span><span className="font-pixel text-[8px]">{Math.floor(selectedZone.exploration.percent)}%</span> Explored</span>
                <span className="font-pixel text-[8px]">{selectedZone.exploration.turnsExplored.toLocaleString()} / {selectedZone.exploration.turnsToExplore.toLocaleString()}</span>
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
              .reduce<Array<{ toId: string; toName: string; explorationThreshold: number }>>((acc, conn) => {
                const targetZone = zoneById.get(conn.toId);
                if (targetZone && !targetZone.discovered && selectedExploration.percent < conn.explorationThreshold) {
                  acc.push({ toId: conn.toId, toName: targetZone.name, explorationThreshold: conn.explorationThreshold });
                }
                return acc;
              }, []);

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

          {/* Home town button — only when physically in a town zone */}
          {selectedZone.zoneType === 'town' && onSetHomeTown && selectedZone.id === currentZoneId && (
            <div className="mb-2">
              {homeTownId === selectedZone.id ? (
                <div className="flex items-center gap-1.5 text-xs text-[var(--rpg-gold)]">
                  <Home size={12} />
                  <span>Current Home Town</span>
                </div>
              ) : (
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetHomeTown(selectedZone.id)}
                >
                  <div className="flex items-center gap-1">
                    <Home size={12} />
                    Set as Home Town
                  </div>
                </PixelButton>
              )}
            </div>
          )}

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
              {(() => {
                if (!selectedRouteIds) return 'No route available';
                if (isOverEncumbered) return 'Over-encumbered';
                if (isRecovering) return 'Recover first to travel';
                if (firstHopInflatedCost !== null && availableTurns < firstHopInflatedCost) {
                  return `Need ${firstHopInflatedCost} turns for next hop`;
                }
                if (routeHopCount > 1) return `Auto-travel to ${selectedZone.name} (${routeHopCount} hops)`;
                return `Travel to ${selectedZone.name} (${displayedTravelCost} turns)`;
              })()}
            </PixelButton>
          )}
        </div>
      )}

      {/* Tiered map */}
      <div className={travelPlaybackData ? 'overflow-x-auto pb-1 opacity-60 saturate-50 transition-all' : 'overflow-x-auto pb-1 transition-all'}>
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

      {/* Undiscovered zone hints */}
      {!travelPlaybackData && undiscoveredZones && undiscoveredZones.length > 0 && (
        <div
          style={{
            background: 'var(--rpg-surface)',
            border: '1px solid var(--rpg-border)',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <h3 className="text-sm font-semibold text-[var(--rpg-text-secondary)] mb-2">Undiscovered Paths</h3>
          <div className="space-y-1.5">
            {undiscoveredZones.map(uz => {
              const fromZone = zones.find(z => z.id === uz.fromZoneId);
              return (
                <div key={uz.id} className="flex items-center gap-2 px-3 py-2 rounded border border-dashed border-[var(--rpg-border)] opacity-60">
                  <Lock size={14} className="text-[var(--rpg-text-secondary)] flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm text-[var(--rpg-text-secondary)]">???</span>
                    <span className="text-xs text-[var(--rpg-text-secondary)] ml-2">
                      from {fromZone?.name ?? 'Unknown'} &mdash; {uz.explorationThreshold}% explored to discover
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity log */}
      {activityLog && <ActivityLog entries={activityLog} />}
    </ScreenContainer>
  );
}
