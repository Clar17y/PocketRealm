'use client';

import { useState, useMemo, useCallback } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Lock, CheckCircle, Sparkles, Zap } from 'lucide-react';
import { SKILL_POINT_CONSTANTS } from '@adventure/shared';
import type { TalentNodeDefinition, TalentTree as TalentTreeName } from '@adventure/shared';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import type { SkillPointState } from '@/lib/api';
import type { Screen } from '@/app/game/gameController.types';
import { SkillTreeTutorial } from '@/components/common/SkillTreeTutorial';

interface TalentTreeProps {
  skillPointState: SkillPointState;
  skills: Array<{ skillType: string; level: number }>;
  onAllocate: (nodeId: string) => Promise<void>;
  onRespec: () => Promise<void>;
  onNavigate: (screen: Screen) => void;
}

const TREE_TABS: { id: TalentTreeName; label: string; color: string }[] = [
  { id: 'melee', label: 'Melee', color: 'var(--rpg-red)' },
  { id: 'ranged', label: 'Ranged', color: 'var(--rpg-green-light)' },
  { id: 'magic', label: 'Magic', color: 'var(--rpg-purple)' },
  { id: 'general', label: 'General', color: 'var(--rpg-gold)' },
];

const RESPEC_TURN_COST = SKILL_POINT_CONSTANTS.RESPEC_TURN_COST;

function groupNodesByTier(nodes: TalentNodeDefinition[]): Map<number, TalentNodeDefinition[]> {
  const map = new Map<number, TalentNodeDefinition[]>();
  for (const node of nodes) {
    const arr = map.get(node.tier);
    if (arr) arr.push(node);
    else map.set(node.tier, [node]);
  }
  return map;
}

function getSkillLevel(skills: Array<{ skillType: string; level: number }>, skillName: string): number {
  return skills.find(s => s.skillType === skillName)?.level ?? 0;
}

function countTierAllocations(
  nodes: TalentNodeDefinition[],
  tier: number,
  allocations: Record<string, number>,
): number {
  return nodes
    .filter(n => n.tier === tier)
    .reduce((sum, n) => sum + (allocations[n.id] ?? 0), 0);
}

export function TalentTree({
  skillPointState,
  skills,
  onAllocate,
  onRespec,
  onNavigate,
}: TalentTreeProps) {
  const [activeTree, setActiveTree] = useState<TalentTreeName>('melee');
  const [allocating, setAllocating] = useState<string | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const [respeccing, setRespeccing] = useState(false);

  const { availablePoints = 0, allocations = {}, trees = {} } = skillPointState;
  const treeNodes = trees[activeTree] ?? [];
  const tierGroups = useMemo(() => groupNodesByTier(treeNodes), [treeNodes]);
  const sortedTiers = useMemo(() => [...tierGroups.keys()].sort((a, b) => a - b), [tierGroups]);

  // Check if a node can be allocated
  const canAllocate = useCallback((node: TalentNodeDefinition): { allowed: boolean; reason?: string } => {
    // Already allocated
    if ((allocations[node.id] ?? 0) > 0) {
      return { allowed: false, reason: 'Already allocated' };
    }

    // Enough points
    if (availablePoints < node.pointCost) {
      return { allowed: false, reason: `Need ${node.pointCost} points (have ${availablePoints})` };
    }

    // Skill level gate
    if (node.skillLevelGate) {
      const playerLevel = getSkillLevel(skills, node.skillLevelGate.skill);
      if (playerLevel < node.skillLevelGate.level) {
        return {
          allowed: false,
          reason: `Requires ${node.skillLevelGate.skill} Lv ${node.skillLevelGate.level} (have Lv ${playerLevel})`,
        };
      }
    }

    // Prerequisites
    for (const prereqId of node.prerequisites) {
      if ((allocations[prereqId] ?? 0) === 0) {
        const prereqNode = treeNodes.find(n => n.id === prereqId);
        return {
          allowed: false,
          reason: `Requires: ${prereqNode?.name ?? prereqId}`,
        };
      }
    }

    // Tier gate: need 2+ allocations in previous tier
    if (node.tier > 1) {
      const prevTierCount = countTierAllocations(treeNodes, node.tier - 1, allocations);
      if (prevTierCount < 2) {
        return {
          allowed: false,
          reason: `Need 2+ allocations in Tier ${node.tier - 1} (have ${prevTierCount})`,
        };
      }
    }

    return { allowed: true };
  }, [allocations, availablePoints, skills, treeNodes]);

  const handleAllocate = useCallback(async (nodeId: string) => {
    setAllocating(nodeId);
    try {
      await onAllocate(nodeId);
    } finally {
      setAllocating(null);
    }
  }, [onAllocate]);

  const handleRespec = useCallback(async () => {
    setRespeccing(true);
    try {
      await onRespec();
      setConfirmRespec(false);
    } finally {
      setRespeccing(false);
    }
  }, [onRespec]);

  const activeTabMeta = TREE_TABS.find(t => t.id === activeTree)!;

  return (
    <div className="rpg-screen-enter space-y-4">
      <SkillTreeTutorial />
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display text-[var(--rpg-text-primary)]">Talent Tree</h2>
        <span
          className="text-sm font-bold px-3 py-1 rounded-full border"
          style={{
            color: 'var(--rpg-gold)',
            borderColor: 'var(--rpg-gold)',
            backgroundColor: 'rgba(201, 169, 101, 0.1)',
          }}
        >
          {availablePoints} point{availablePoints !== 1 ? 's' : ''} available
        </span>
      </div>

      {/* Tree tabs */}
      <div className="flex gap-1">
        {TREE_TABS.map(tab => {
          const isActive = tab.id === activeTree;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTree(tab.id)}
              className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
              style={{
                color: isActive ? tab.color : 'var(--rpg-text-secondary)',
                backgroundColor: isActive ? 'var(--rpg-surface)' : 'transparent',
                borderWidth: 1,
                borderColor: isActive ? tab.color : 'var(--rpg-border)',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tier groups */}
      {sortedTiers.map(tier => {
        const nodes = tierGroups.get(tier)!;
        // Derive skill level gate label from the first node in the tier that has one
        const gateNode = nodes.find(n => n.skillLevelGate);
        const gateLabel = gateNode?.skillLevelGate
          ? `Requires ${gateNode.skillLevelGate.skill.charAt(0).toUpperCase() + gateNode.skillLevelGate.skill.slice(1)} Lv ${gateNode.skillLevelGate.level}`
          : null;

        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-[var(--rpg-text-primary)]">Tier {tier}</span>
              {gateLabel && (
                <span className="text-[11px] text-[var(--rpg-text-secondary)]">
                  {gateLabel}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {nodes.map(node => {
                const isAllocated = (allocations[node.id] ?? 0) > 0;
                const check = canAllocate(node);
                const isAffordable = check.allowed;
                const isLocked = !isAllocated && !isAffordable;

                return (
                  <PixelCard
                    key={node.id}
                    padding="sm"
                    className={
                      isAllocated
                        ? 'border-[var(--rpg-green-light)]'
                        : isAffordable
                          ? 'border-[var(--rpg-gold)]'
                          : ''
                    }
                  >
                    <div className="flex items-start gap-2">
                      {/* Status icon */}
                      <div className="pt-0.5 shrink-0">
                        {isAllocated ? (
                          <CheckCircle size={16} className="text-[var(--rpg-green-light)]" />
                        ) : (
                          <Lock
                            size={16}
                            className={isAffordable ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'}
                          />
                        )}
                      </div>

                      {/* Node info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-sm font-semibold"
                            style={{
                              color: isAllocated
                                ? 'var(--rpg-green-light)'
                                : isLocked
                                  ? 'var(--rpg-text-secondary)'
                                  : 'var(--rpg-text-primary)',
                            }}
                          >
                            {node.name}
                          </span>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              color: activeTabMeta.color,
                              borderColor: activeTabMeta.color,
                              borderWidth: 1,
                            }}
                          >
                            {node.pointCost} pt{node.pointCost !== 1 ? 's' : ''}
                          </span>
                          {isAllocated && (
                            <span className="text-[10px] font-bold text-[var(--rpg-green-light)] uppercase">
                              Allocated ({allocations[node.id]})
                            </span>
                          )}
                        </div>

                        <p
                          className="text-[12px] mt-0.5"
                          style={{ color: isLocked ? 'var(--rpg-text-secondary)' : 'var(--rpg-text-secondary)' }}
                        >
                          {node.description}
                        </p>

                        {/* Action unlock badge */}
                        {node.unlocksAction && (
                          <div className="flex items-center gap-1 mt-1">
                            <Zap size={11} style={{ color: activeTabMeta.color }} />
                            <span className="text-[11px] font-semibold" style={{ color: activeTabMeta.color }}>
                              Unlocks: {node.unlocksAction.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </div>
                        )}

                        {/* Passive bonus badge */}
                        {node.passiveBonus && (
                          <div className="flex items-center gap-1 mt-1">
                            <Sparkles size={11} style={{ color: 'var(--rpg-gold)' }} />
                            <span className="text-[11px] text-[var(--rpg-gold)]">
                              {node.passiveBonus.description}
                            </span>
                          </div>
                        )}

                        {/* Lock reason */}
                        {isLocked && check.reason && (
                          <p className="text-[11px] text-[var(--rpg-red)] mt-1">{check.reason}</p>
                        )}
                      </div>

                      {/* Allocate button */}
                      <div className="shrink-0 pt-0.5">
                        {!isAllocated && (
                          <PixelButton
                            size="sm"
                            variant={isAffordable ? 'primary' : 'secondary'}
                            disabled={!isAffordable || allocating === node.id}
                            onClick={() => handleAllocate(node.id)}
                          >
                            {allocating === node.id ? '...' : 'Learn'}
                          </PixelButton>
                        )}
                      </div>
                    </div>
                  </PixelCard>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Respec button */}
      <div className="pt-2">
        <PixelButton
          variant="danger"
          size="sm"
          onClick={() => setConfirmRespec(true)}
          className="w-full"
          disabled={skillPointState.totalPointsSpent === 0 || respeccing}
        >
          {respeccing ? 'Respeccing...' : `Respec (${RESPEC_TURN_COST.toLocaleString()} turns)`}
        </PixelButton>
      </div>

      {confirmRespec && (
        <ConfirmModal
          title="Respec Talents"
          message={`Reset all talent allocations? This will cost ${RESPEC_TURN_COST.toLocaleString()} turns and refund all spent skill points.`}
          confirmLabel="Respec"
          variant="danger"
          onConfirm={handleRespec}
          onCancel={() => setConfirmRespec(false)}
        />
      )}
    </div>
  );
}
