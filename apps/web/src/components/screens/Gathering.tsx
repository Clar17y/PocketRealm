'use client';

import { useState, useEffect } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Pagination } from '@/components/common/Pagination';
import { Slider } from '@/components/ui/Slider';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { titleCaseFromSnake } from '@/lib/format';
import { Pickaxe, MapPin } from 'lucide-react';
import { TurnPresets } from '@/components/common/TurnPresets';
import { GATHERING_CONSTANTS } from '@adventure/shared';
import { EventBadges } from '@/components/common/EventBadge';
import { effectiveTurns as calcEffectiveTurns, inflateCost } from '@/lib/taxCalc';
import { ActivityLog } from '@/components/ActivityLog';
import type { ActivityLogEntry } from '@/app/game/useGameController';

interface ResourceNode {
  id: string;
  name: string;
  icon?: string;
  imageSrc?: string;
  levelRequired: number;
  baseYield: number;
  zoneId: string;
  zoneName: string;
  resourceTypeCategory?: string;
  remainingCapacity: number;
  maxCapacity: number;
  sizeName: string;
  weathered?: boolean;
  eventModifiers?: Array<{ title: string; effectType: string; effectValue: number; isGlobal: boolean }>;
}

interface GatheringProps {
  skillName: string;
  skillLevel: number;
  efficiency: number;
  nodes: ResourceNode[];
  currentZoneId: string | null;
  availableTurns: number;
  activityLog: ActivityLogEntry[];
  nodesLoading: boolean;
  nodesError: string | null;
  page: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    zones: Array<{ id: string; name: string }>;
    resourceTypes: string[];
  };
  zoneFilter: string;
  resourceTypeFilter: string;
  onPageChange: (page: number) => void;
  onZoneFilterChange: (zoneId: string) => void;
  onResourceTypeFilterChange: (resourceType: string) => void;
  onStartGathering: (nodeId: string, turns: number) => void;
  isRecovering?: boolean;
  recoveryCost?: number | null;
  guildTaxRate?: number;
}

export function Gathering({
  skillName,
  skillLevel,
  efficiency,
  nodes,
  currentZoneId,
  availableTurns,
  activityLog,
  nodesLoading,
  nodesError,
  page,
  pagination,
  filters,
  zoneFilter,
  resourceTypeFilter,
  onPageChange,
  onZoneFilterChange,
  onResourceTypeFilterChange,
  onStartGathering,
  isRecovering = false,
  recoveryCost,
  guildTaxRate = 0,
}: GatheringProps) {
  const getNodeTurnsToDeplete = (node: ResourceNode) => {
    const levelsAbove = Math.max(0, skillLevel - node.levelRequired);
    const yieldMultiplier = 1 + levelsAbove * GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL;
    const baseYield = Math.max(node.baseYield, GATHERING_CONSTANTS.BASE_YIELD);
    const yieldPerAction = Math.floor(baseYield * yieldMultiplier);
    if (yieldPerAction <= 0) return inflateCost(GATHERING_CONSTANTS.BASE_TURN_COST, guildTaxRate);
    const baseTurns = Math.ceil(node.remainingCapacity / yieldPerAction) * GATHERING_CONSTANTS.BASE_TURN_COST;
    return inflateCost(baseTurns, guildTaxRate);
  };

  const [selectedNode, setSelectedNode] = useState<ResourceNode | null>(nodes[0] || null);
  const [turnInvestment, setTurnInvestment] = useState(() => {
    const node = nodes[0];
    if (!node) return [Math.min(100, availableTurns)];
    return [Math.max(10, Math.min(getNodeTurnsToDeplete(node), availableTurns))];
  });

  // Sync selected node with updated data from props (e.g., after mining reduces capacity)
  useEffect(() => {
    if (!selectedNode) {
      if (nodes.length > 0) setSelectedNode(nodes[0]);
      return;
    }

    const updatedNode = nodes.find((n) => n.id === selectedNode.id);
    if (!updatedNode) {
      // Node was depleted/removed - select first available or null
      setSelectedNode(nodes[0] || null);
    } else if (updatedNode.remainingCapacity !== selectedNode.remainingCapacity) {
      // Node still exists but capacity changed - update with fresh data
      setSelectedNode(updatedNode);
    }
  }, [nodes, selectedNode]);

  // Reset turn investment when a different node is selected
  useEffect(() => {
    if (!selectedNode) return;
    const ttd = getNodeTurnsToDeplete(selectedNode);
    setTurnInvestment([Math.max(10, Math.min(ttd, availableTurns))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id]);

  const calculateYield = (node: ResourceNode, turns: number) => {
    // Match backend formula exactly: linear +10% per level above requirement
    const effective = calcEffectiveTurns(turns, guildTaxRate);
    const maxActionsByTurns = Math.floor(effective / GATHERING_CONSTANTS.BASE_TURN_COST);
    const levelsAbove = Math.max(0, skillLevel - node.levelRequired);
    const yieldMultiplier = 1 + levelsAbove * GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL;
    const baseYield = Math.max(node.baseYield, GATHERING_CONSTANTS.BASE_YIELD);
    const yieldPerAction = Math.floor(baseYield * yieldMultiplier);

    // Cap by remaining capacity
    const maxActionsByCapacity = Math.ceil(node.remainingCapacity / yieldPerAction);
    const actions = Math.min(maxActionsByTurns, maxActionsByCapacity);
    const totalYield = Math.min(actions * yieldPerAction, node.remainingCapacity);
    const willDeplete = totalYield >= node.remainingCapacity;

    return { actions, baseYield, yieldMultiplier, totalYield, willDeplete };
  };

  const yieldInfo = selectedNode ? calculateYield(selectedNode, turnInvestment[0]) : null;

  // Percentage-based presets for selected node
  const turnsToDeplete = selectedNode ? getNodeTurnsToDeplete(selectedNode) : 0;
  const sliderMax = turnsToDeplete > 0
    ? Math.max(10, Math.min(turnsToDeplete, availableTurns))
    : Math.min(1000, availableTurns);

  const gatheringPresets = selectedNode && turnsToDeplete > 0 ? [
    { label: 'Full', pct: 1.0 },
    { label: '75%', pct: 0.75 },
    { label: '50%', pct: 0.50 },
    { label: '25%', pct: 0.25 },
  ].map(({ label, pct }) => {
    const levelsAbove = Math.max(0, skillLevel - selectedNode.levelRequired);
    const yieldMultiplier = 1 + levelsAbove * GATHERING_CONSTANTS.YIELD_MULTIPLIER_PER_LEVEL;
    const baseYield = Math.max(selectedNode.baseYield, GATHERING_CONSTANTS.BASE_YIELD);
    const yieldPerAction = Math.floor(baseYield * yieldMultiplier);
    const targetYield = Math.ceil(selectedNode.remainingCapacity * pct);
    const actions = Math.ceil(targetYield / Math.max(1, yieldPerAction));
    const rawTurns = actions * GATHERING_CONSTANTS.BASE_TURN_COST;
    const inflated = inflateCost(rawTurns, guildTaxRate);
    return { label, turns: Math.min(Math.max(GATHERING_CONSTANTS.BASE_TURN_COST, inflated), availableTurns) };
  }) : null;

  return (
    <div className="space-y-4">
      {/* Knockout Banner */}
      {isRecovering && (
        <KnockoutBanner action="gathering" recoveryCost={recoveryCost} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">{skillName}</h2>
          <div className="px-2 py-1 bg-[var(--rpg-gold)] rounded text-[var(--rpg-background)] text-sm font-bold">
            Lv. {skillLevel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--rpg-text-secondary)]">Efficiency</div>
          <div className="text-sm font-bold text-[var(--rpg-green-light)]">{efficiency}%</div>
        </div>
      </div>

      {/* Resource Nodes */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={zoneFilter}
            onChange={(event) => onZoneFilterChange(event.target.value)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
            disabled={nodesLoading}
          >
            <option value="all">Zone: All</option>
            {filters.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>

          <select
            value={resourceTypeFilter}
            onChange={(event) => onResourceTypeFilterChange(event.target.value)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
            disabled={nodesLoading}
          >
            <option value="all">Type: All</option>
            {filters.resourceTypes.map((resourceType) => (
              <option key={resourceType} value={resourceType}>
                {titleCaseFromSnake(resourceType)}
              </option>
            ))}
          </select>
        </div>

        <h3 className="font-semibold text-[var(--rpg-text-primary)] text-sm">Discovered Nodes</h3>
        {nodesLoading ? (
          <div className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
            Loading resource nodes...
          </div>
        ) : nodesError ? (
          <div className="text-sm text-[var(--rpg-red)] text-center py-4">
            {nodesError}
          </div>
        ) : nodes.length === 0 ? (
          <div className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
            No resource nodes match these filters.
          </div>
        ) : nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          const canGather = skillLevel >= node.levelRequired;
          const isInZone = currentZoneId === node.zoneId;
          const canSelect = canGather && isInZone;
          const capacityPct = Math.round((node.remainingCapacity / node.maxCapacity) * 100);

          return (
            <button
              key={node.id}
              onClick={() => canSelect && setSelectedNode(node)}
              disabled={!canSelect}
              className={`w-full text-left transition-all ${!canSelect ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <PixelCard padding="sm" className={isSelected ? 'border-[var(--rpg-gold)]' : ''}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[var(--rpg-background)] flex items-center justify-center text-2xl flex-shrink-0">
                    {node.imageSrc ? (
                      <img
                        src={node.imageSrc}
                        alt={node.name}
                        className="w-10 h-10 object-contain image-rendering-pixelated"
                      />
                    ) : (
                      node.icon
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-semibold text-[var(--rpg-text-primary)] text-sm">
                        {node.sizeName} {node.name}
                      </h4>
                      <span className="text-xs text-[var(--rpg-text-secondary)]">Lv. {node.levelRequired}</span>
                    </div>
                    {/* Zone indicator */}
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin size={10} className={isInZone ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-text-secondary)]'} />
                      <span className={`text-xs ${isInZone ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-text-secondary)]'}`}>
                        {node.zoneName}
                        {!isInZone && ' (travel here to gather)'}
                      </span>
                    </div>
                    <EventBadges modifiers={node.eventModifiers} />
                    {/* Capacity bar */}
                    <div className="mt-1.5 h-2 bg-[var(--rpg-background)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--rpg-gold)] transition-all"
                        style={{ width: `${capacityPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-[var(--rpg-text-secondary)]">
                        {node.remainingCapacity} / {node.maxCapacity} remaining
                      </span>
                      <div className="flex items-center gap-2">
                        {node.weathered && (
                          <span className="text-xs text-[var(--rpg-text-secondary)]">Weathered</span>
                        )}
                        <span className="text-xs text-[var(--rpg-gold)]">
                          {Math.max(node.baseYield, GATHERING_CONSTANTS.BASE_YIELD)}/action
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </PixelCard>
            </button>
          );
        })}

        {!nodesLoading && !nodesError && pagination.totalPages > 1 && (
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            onPageChange={onPageChange}
            className="pt-1"
          />
        )}
      </div>

      {/* Turn Investment */}
      {selectedNode && (
        <PixelCard>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[var(--rpg-text-primary)]">Turn Investment</h3>
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--rpg-gold)] font-mono">{turnInvestment[0]}</div>
                {guildTaxRate > 0 && (
                  <div className="text-xs text-[var(--rpg-text-secondary)]">
                    {calcEffectiveTurns(turnInvestment[0], guildTaxRate)} effective ({guildTaxRate}% tax)
                  </div>
                )}
                <div className="text-xs text-[var(--rpg-text-secondary)]">of {availableTurns.toLocaleString()} available</div>
              </div>
            </div>

            <Slider
              value={turnInvestment}
              onValueChange={setTurnInvestment}
              min={10}
              max={sliderMax}
              step={10}
              className="w-full"
            />

            {gatheringPresets && (
              <TurnPresets
                presets={gatheringPresets}
                currentValue={turnInvestment[0]}
                onChange={(t) => setTurnInvestment([t])}
              />
            )}
          </div>
        </PixelCard>
      )}

      {/* Estimated Yield */}
      {selectedNode && yieldInfo && (
        <PixelCard className="bg-[var(--rpg-background)]">
          <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3">Estimated Yield</h3>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg bg-[var(--rpg-surface)] flex items-center justify-center text-3xl">
              {selectedNode.imageSrc ? (
                <img
                  src={selectedNode.imageSrc}
                  alt={selectedNode.name}
                  className="w-14 h-14 object-contain image-rendering-pixelated"
                />
              ) : (
                selectedNode.icon
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm text-[var(--rpg-text-secondary)]">{selectedNode.name}</div>
              <div className="text-3xl font-bold text-[var(--rpg-gold)] font-mono">{yieldInfo.totalYield}</div>
              <div className="text-xs text-[var(--rpg-text-secondary)]">
                {yieldInfo.actions} action{yieldInfo.actions !== 1 ? 's' : ''} x {yieldInfo.baseYield} base
                {yieldInfo.yieldMultiplier > 1 && (
                  <span className="text-[var(--rpg-green-light)]"> x {yieldInfo.yieldMultiplier.toFixed(1)}</span>
                )}
              </div>
              {yieldInfo.willDeplete && (
                <div className="text-xs text-[var(--rpg-red)] mt-1 font-semibold">
                  WARNING: Will exhaust node completely
                </div>
              )}
            </div>
          </div>
        </PixelCard>
      )}

      {/* Start Button */}
      {selectedNode && (
        <PixelButton
          variant="gold"
          size="lg"
          className="w-full"
          onClick={() => onStartGathering(selectedNode.id, turnInvestment[0])}
          disabled={isRecovering || turnInvestment[0] > availableTurns || nodesLoading || Boolean(nodesError)}
        >
          <div className="flex items-center justify-center gap-2">
            <Pickaxe size={20} />
            {isRecovering ? 'Recover First' : `Start ${skillName}`}
          </div>
        </PixelButton>
      )}

      {/* Gathering Log */}
      <ActivityLog entries={activityLog} maxHeight="max-h-48" />
    </div>
  );
}
