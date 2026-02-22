'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  getGuildProjects, startGuildProject, contributeProjectTurns, contributeProjectMaterials,
  type GuildProjectResponse, type GuildProjectAvailableResponse, type GuildProjectsListResponse,
} from '@/lib/api/guild';
import { GUILD_PROJECT_DEFINITIONS, GUILD_PROJECT_CONSTANTS } from '@adventure/shared';

const formatNumber = (n: number) => n.toLocaleString();

const PERK_LABELS: Record<string, string> = {
  craftingCrit: 'Crafting Crit',
  xpBoost: 'Skill XP',
  travelCostReduction: 'Travel Cost Reduction',
  repairCostReduction: 'Repair Cost Reduction',
  gatheringYield: 'Gathering Yield',
  combatDamage: 'Combat Damage',
  defenseBoost: 'Defense',
};

interface GuildProjectsTabProps {
  guildId: string;
  myRole: string;
  setError: (err: string | null) => void;
  onTurnsChanged: () => void;
}

export function GuildProjectsTab({ guildId, myRole, setError, onTurnsChanged }: GuildProjectsTabProps) {
  const [data, setData] = useState<GuildProjectsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [turnAmount, setTurnAmount] = useState('1000');
  const [showContribute, setShowContribute] = useState<string | null>(null);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildProjects(guildId);
      if (res.data) setData(res.data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const handleStartProject = async (projectKey: string) => {
    if (!confirm('Start this project? The treasury cost will be deducted immediately.')) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await startGuildProject(guildId, projectKey);
      if (res.error) { setError(res.error.message); return; }
      void loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start project');
    } finally {
      setActionLoading(false);
    }
  };

  const handleContributeTurns = async (projectId: string) => {
    const amount = parseInt(turnAmount);
    if (!amount || amount <= 0) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await contributeProjectTurns(guildId, projectId, amount);
      if (res.error) { setError(res.error.message); return; }
      onTurnsChanged();
      void loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to contribute turns');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) return <PixelCard><p className="text-sm opacity-60">Loading...</p></PixelCard>;

  const activeProject = data?.projects.find((p) => p.status === 'active');
  const completedProjects = data?.projects.filter((p) => p.status === 'completed') ?? [];
  const available = data?.available ?? [];

  return (
    <div className="space-y-4">
      {/* Active Project */}
      {activeProject && (
        <ActiveProjectCard
          project={activeProject}
          showContribute={showContribute}
          setShowContribute={setShowContribute}
          turnAmount={turnAmount}
          setTurnAmount={setTurnAmount}
          actionLoading={actionLoading}
          onContributeTurns={() => handleContributeTurns(activeProject.id)}
        />
      )}

      {/* Available Projects */}
      {available.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-2">Available Projects</h3>
          <div className="space-y-2">
            {available.map((proj) => (
              <AvailableProjectCard
                key={proj.key}
                project={proj}
                isOfficer={isOfficer}
                actionLoading={actionLoading}
                onStart={() => handleStartProject(proj.key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Projects */}
      {completedProjects.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-2">Completed Projects</h3>
          <div className="space-y-2">
            {completedProjects.map((proj) => (
              <PixelCard key={proj.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-[var(--rpg-green-light)]">{proj.name}</p>
                    <p className="text-xs text-[var(--rpg-text-secondary)]">{proj.description}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">
                    Complete
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {proj.perks.map((perk, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                      +{Math.round(perk.value * 100)}% {PERK_LABELS[perk.effectType] ?? perk.effectType}
                    </span>
                  ))}
                </div>
              </PixelCard>
            ))}
          </div>
        </div>
      )}

      {/* Project Tree */}
      <ProjectTree
        projects={data?.projects ?? []}
        available={available}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active Project Card
// ---------------------------------------------------------------------------

function ActiveProjectCard({
  project,
  showContribute,
  setShowContribute,
  turnAmount,
  setTurnAmount,
  actionLoading,
  onContributeTurns,
}: {
  project: GuildProjectResponse;
  showContribute: string | null;
  setShowContribute: (id: string | null) => void;
  turnAmount: string;
  setTurnAmount: (v: string) => void;
  actionLoading: boolean;
  onContributeTurns: () => void;
}) {
  const turnsPercent = Math.min(100, (project.turnsContributed / project.memberTurnGoal) * 100);

  return (
    <PixelCard>
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-sm font-bold text-[var(--rpg-gold)]">{project.name}</p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">{project.description}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
          Active
        </span>
      </div>

      {/* Turns Progress */}
      <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--rpg-text-secondary)]">Turns</span>
          <span className="text-[var(--rpg-text-secondary)]">
            {formatNumber(project.turnsContributed)} / {formatNumber(project.memberTurnGoal)}
          </span>
        </div>
        <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark, #1a1a2e)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${turnsPercent}%`, backgroundColor: 'var(--rpg-gold)' }}
          />
        </div>
      </div>

      {/* Material Progress */}
      {project.materialCosts.map((cost) => {
        const current = project.materialsProgress[cost.category] ?? 0;
        const percent = Math.min(100, (current / cost.quantity) * 100);
        return (
          <div key={cost.category} className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--rpg-text-secondary)] capitalize">{cost.category}</span>
              <span className="text-[var(--rpg-text-secondary)]">
                {formatNumber(current)} / {formatNumber(cost.quantity)}
              </span>
            </div>
            <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark, #1a1a2e)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${percent}%`,
                  backgroundColor: percent >= 100 ? 'var(--rpg-green-light)' : 'var(--rpg-blue-light)',
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Perks */}
      <div className="mt-3 flex flex-wrap gap-2">
        {project.perks.map((perk, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]">
            +{Math.round(perk.value * 100)}% {PERK_LABELS[perk.effectType] ?? perk.effectType}
          </span>
        ))}
      </div>

      {/* Contribute Section */}
      <div className="mt-3 pt-3 border-t border-[var(--rpg-border)]">
        <div className="flex gap-2">
          <PixelButton
            onClick={() => setShowContribute(showContribute === 'turns' ? null : 'turns')}
          >
            Contribute Turns
          </PixelButton>
        </div>

        {showContribute === 'turns' && (
          <div className="mt-3 p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-[var(--rpg-text-secondary)]">
                  Amount (max {formatNumber(GUILD_PROJECT_CONSTANTS.DAILY_TURN_CAP)}/day)
                </label>
                <input
                  type="number"
                  value={turnAmount}
                  onChange={(e) => setTurnAmount(e.target.value)}
                  min={1}
                  max={GUILD_PROJECT_CONSTANTS.DAILY_TURN_CAP}
                  className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                />
              </div>
              <PixelButton onClick={onContributeTurns} disabled={actionLoading}>
                {actionLoading ? '...' : 'Contribute'}
              </PixelButton>
            </div>
          </div>
        )}
      </div>
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// Available Project Card
// ---------------------------------------------------------------------------

function AvailableProjectCard({
  project,
  isOfficer,
  actionLoading,
  onStart,
}: {
  project: GuildProjectAvailableResponse;
  isOfficer: boolean;
  actionLoading: boolean;
  onStart: () => void;
}) {
  return (
    <PixelCard>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
            {project.name}
            <span className="ml-2 text-xs text-[var(--rpg-text-secondary)]">L{project.level}</span>
          </p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">{project.description}</p>
        </div>
        {isOfficer && project.canStart && (
          <PixelButton onClick={onStart} disabled={actionLoading}>
            Start
          </PixelButton>
        )}
        {!project.canStart && project.reason && (
          <span className="text-xs text-[var(--rpg-text-secondary)] italic">{project.reason}</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-[var(--rpg-text-secondary)]">Treasury Cost</span>
          <p className="text-[var(--rpg-gold)]">{formatNumber(project.treasuryCost)}</p>
        </div>
        <div>
          <span className="text-[var(--rpg-text-secondary)]">Turn Goal</span>
          <p>{formatNumber(project.memberTurnGoal)}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {project.materialCosts.map((c) => (
          <span key={c.category} className="text-xs px-1.5 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] capitalize">
            {c.category}: {formatNumber(c.quantity)}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {project.perks.map((perk, i) => (
          <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-[var(--rpg-gold)]/10 text-[var(--rpg-gold)]">
            +{Math.round(perk.value * 100)}% {PERK_LABELS[perk.effectType] ?? perk.effectType}
          </span>
        ))}
      </div>
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// Project Tree
// ---------------------------------------------------------------------------

function ProjectTree({
  projects,
  available,
}: {
  projects: GuildProjectResponse[];
  available: GuildProjectAvailableResponse[];
}) {
  const completedKeys = new Set(projects.filter((p) => p.status === 'completed').map((p) => p.projectKey));
  const activeKeys = new Set(projects.filter((p) => p.status === 'active').map((p) => p.projectKey));

  const levels = [1, 2, 3];

  return (
    <div>
      <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-2">Project Tree</h3>
      <PixelCard>
        <div className="space-y-4">
          {levels.map((level) => {
            const defs = GUILD_PROJECT_DEFINITIONS.filter((d) => d.level === level);
            return (
              <div key={level}>
                <p className="text-xs text-[var(--rpg-text-secondary)] mb-1.5">Level {level}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {defs.map((def) => {
                    const isCompleted = completedKeys.has(def.key);
                    const isActive = activeKeys.has(def.key);
                    const isAvailable = available.some((a) => a.key === def.key && a.canStart);
                    const isLocked = !isCompleted && !isActive && !isAvailable;

                    let borderColor = 'var(--rpg-border)';
                    let textColor = 'var(--rpg-text-secondary)';
                    if (isCompleted) { borderColor = 'var(--rpg-green-light)'; textColor = 'var(--rpg-green-light)'; }
                    else if (isActive) { borderColor = 'var(--rpg-gold)'; textColor = 'var(--rpg-gold)'; }
                    else if (isAvailable) { borderColor = 'var(--rpg-blue-light)'; textColor = 'var(--rpg-blue-light)'; }

                    return (
                      <div
                        key={def.key}
                        className={`p-2 rounded border text-center ${isLocked ? 'opacity-40' : ''}`}
                        style={{ borderColor }}
                      >
                        <p className="text-xs font-bold" style={{ color: textColor }}>{def.name}</p>
                        <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-0.5">
                          {isCompleted ? 'Done' : isActive ? 'In Progress' : isAvailable ? 'Available' : 'Locked'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </PixelCard>
    </div>
  );
}
