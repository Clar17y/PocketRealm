'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  getGuildProjects, startGuildProject, contributeProjectTurns, contributeProjectMaterials,
  type GuildProjectResponse, type GuildProjectAvailableResponse, type GuildProjectsListResponse,
} from '@/lib/api/guild';
import { PerkBadges } from '@/components/common/PerkBadges';
import { getInventory } from '@/lib/api/items';
import { GUILD_PROJECT_DEFINITIONS, GUILD_PROJECT_CONSTANTS, getCategoryForTemplate, type StateUpdates } from '@pocketrealm/shared';
import { formatNumber } from '@/lib/format';

interface GuildProjectsTabProps {
  guildId: string;
  myRole: string;
  setError: (err: string | null) => void;
  onStateUpdates?: (updates: StateUpdates) => void;
}

interface ResourceItem {
  templateId: string;
  templateName: string;
  quantity: number;
  category: string;
}

export function GuildProjectsTab({ guildId, myRole, setError, onStateUpdates }: GuildProjectsTabProps) {
  const [data, setData] = useState<GuildProjectsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [turnAmount, setTurnAmount] = useState('1000');
  const [showContribute, setShowContribute] = useState<string | null>(null);
  const [resourceItems, setResourceItems] = useState<ResourceItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('10');
  const [showStartConfirm, setShowStartConfirm] = useState<string | null>(null);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildProjects(guildId);
      if (res.data) setData(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [guildId, setError]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  // Load resource items when materials contribute panel opens
  const loadResourceItems = useCallback(async (neededCategories: string[]) => {
    try {
      const res = await getInventory();
      if (!res.data) return;
      const resources: ResourceItem[] = [];
      for (const item of res.data.items) {
        if (item.template.itemType !== 'resource' || item.quantity <= 0) continue;
        const cat = getCategoryForTemplate(item.template.name);
        if (cat && neededCategories.includes(cat)) {
          resources.push({
            templateId: item.templateId,
            templateName: item.template.name,
            quantity: item.quantity,
            category: cat,
          });
        }
      }
      setResourceItems(resources);
      if (resources.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(resources[0].templateId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load materials');
    }
  }, [selectedTemplateId, setError]);

  const handleStartProject = async (projectKey: string) => {
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
      if ((res.data as any)?.stateUpdates) onStateUpdates?.((res.data as any).stateUpdates);
      void loadProjects();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to contribute turns');
    } finally {
      setActionLoading(false);
    }
  };

  const handleContributeMaterials = async (projectId: string) => {
    const qty = parseInt(materialQuantity);
    if (!qty || qty <= 0 || !selectedTemplateId) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await contributeProjectMaterials(guildId, projectId, selectedTemplateId, qty);
      if (res.error) { setError(res.error.message); return; }
      void loadProjects();
      // Refresh resource items
      const activeProject = data?.projects.find((p) => p.status === 'active');
      if (activeProject) {
        const neededCategories = activeProject.materialCosts
          .filter((c) => (activeProject.materialsProgress[c.category] ?? 0) < c.quantity)
          .map((c) => c.category);
        void loadResourceItems(neededCategories);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to contribute materials');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) return <LoadingCard />;

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
          setShowContribute={(mode) => {
            setShowContribute(mode);
            if (mode === 'materials') {
              const neededCategories = activeProject.materialCosts
                .filter((c) => (activeProject.materialsProgress[c.category] ?? 0) < c.quantity)
                .map((c) => c.category);
              void loadResourceItems(neededCategories);
            }
          }}
          turnAmount={turnAmount}
          setTurnAmount={setTurnAmount}
          actionLoading={actionLoading}
          onContributeTurns={() => handleContributeTurns(activeProject.id)}
          resourceItems={resourceItems}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          materialQuantity={materialQuantity}
          setMaterialQuantity={setMaterialQuantity}
          onContributeMaterials={() => handleContributeMaterials(activeProject.id)}
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
                onStart={() => setShowStartConfirm(proj.key)}
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
                  <PerkBadges perks={proj.perks} variant="gold" size="md" />
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

      {showStartConfirm && (
        <ConfirmModal
          title="Start Project?"
          message="Start this project? The treasury cost will be deducted immediately."
          confirmLabel="Start"
          variant="warning"
          onConfirm={() => { const key = showStartConfirm; setShowStartConfirm(null); void handleStartProject(key); }}
          onCancel={() => setShowStartConfirm(null)}
        />
      )}
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
  resourceItems,
  selectedTemplateId,
  setSelectedTemplateId,
  materialQuantity,
  setMaterialQuantity,
  onContributeMaterials,
}: {
  project: GuildProjectResponse;
  showContribute: string | null;
  setShowContribute: (id: string | null) => void;
  turnAmount: string;
  setTurnAmount: (v: string) => void;
  actionLoading: boolean;
  onContributeTurns: () => void;
  resourceItems: ResourceItem[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  materialQuantity: string;
  setMaterialQuantity: (v: string) => void;
  onContributeMaterials: () => void;
}) {
  const turnsPercent = Math.min(100, (project.turnsContributed / project.memberTurnGoal) * 100);
  const hasMaterialsNeeded = project.materialCosts.some(
    (c) => (project.materialsProgress[c.category] ?? 0) < c.quantity,
  );

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
        <PerkBadges perks={project.perks} variant="surface" size="md" />
      </div>

      {/* Contribute Section */}
      <div className="mt-3 pt-3 border-t border-[var(--rpg-border)]">
        <div className="flex gap-2">
          <PixelButton
            onClick={() => setShowContribute(showContribute === 'turns' ? null : 'turns')}
          >
            Contribute Turns
          </PixelButton>
          {hasMaterialsNeeded && (
            <PixelButton
              onClick={() => setShowContribute(showContribute === 'materials' ? null : 'materials')}
            >
              Contribute Materials
            </PixelButton>
          )}
        </div>

        {showContribute === 'turns' && (
          <div className="mt-3 p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-[var(--rpg-text-secondary)]">
                  Amount (max {formatNumber(GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP)} per project)
                </label>
                <input
                  type="number"
                  value={turnAmount}
                  onChange={(e) => setTurnAmount(e.target.value)}
                  min={1}
                  max={GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP}
                  className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                />
              </div>
              <PixelButton onClick={onContributeTurns} disabled={actionLoading}>
                {actionLoading ? '...' : 'Contribute'}
              </PixelButton>
            </div>
          </div>
        )}

        {showContribute === 'materials' && (
          <div className="mt-3 p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
            {resourceItems.length === 0 ? (
              <p className="text-xs text-[var(--rpg-text-secondary)]">No matching materials in your inventory.</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-[var(--rpg-text-secondary)]">Material</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                  >
                    {resourceItems.map((item) => (
                      <option key={item.templateId} value={item.templateId}>
                        {item.templateName} ({item.category}) — {formatNumber(item.quantity)} owned
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-[var(--rpg-text-secondary)]">Quantity</label>
                    <input
                      type="number"
                      value={materialQuantity}
                      onChange={(e) => setMaterialQuantity(e.target.value)}
                      min={1}
                      className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                    />
                  </div>
                  <PixelButton onClick={onContributeMaterials} disabled={actionLoading}>
                    {actionLoading ? '...' : 'Contribute'}
                  </PixelButton>
                </div>
              </div>
            )}
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
        <PerkBadges perks={project.perks} variant="gold" size="sm" goldOpacity={10} />
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
