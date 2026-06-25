'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import {
  getGuildProjects, startGuildProject, contributeProjectTurns, contributeProjectMaterials,
  type GuildProjectResponse, type GuildProjectAvailableResponse, type GuildProjectsListResponse,
  type GuildProjectContributionResponse, type GuildProjectTurnContributionSource,
} from '@/lib/api/guild';
import { PerkBadges } from '@/components/common/PerkBadges';
import { getInventory } from '@/lib/api/items';
import { GUILD_PROJECT_DEFINITIONS, GUILD_PROJECT_CONSTANTS, getCategoryForTemplate, type StateUpdates } from '@pocketrealm/shared';
import { formatNumber } from '@/lib/format';

interface GuildProjectsTabProps {
  guildId: string;
  myRole: string;
  playerId?: string | null;
  guildTreasuryTurns?: number;
  onStateUpdates?: (updates: StateUpdates) => void;
  onGuildUpdated?: () => void;
}

interface ResourceItem {
  templateId: string;
  templateName: string;
  quantity: number;
  category: string;
}

const POSITIVE_INTEGER_PATTERN = /^\d+$/;

function getPlayerContribution(
  project: GuildProjectResponse,
  playerId: string | null | undefined,
): GuildProjectContributionResponse | undefined {
  if (!playerId) return undefined;
  return project.contributions?.find((contribution) => contribution.playerId === playerId);
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '' || !POSITIVE_INTEGER_PATTERN.test(trimmed)) return null;
  const amount = Number(trimmed);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function clampContributionAmount(value: string, max: number): number {
  const amount = parsePositiveIntegerInput(value);
  if (amount === null || max <= 0) return 0;
  return Math.min(amount, max);
}

function clampContributionInput(value: string, max: number): string {
  if (value.trim() === '') return '';
  const amount = parsePositiveIntegerInput(value);
  if (amount === null || max <= 0) return '';
  return String(Math.min(amount, max));
}

function getTurnContributionMax(
  project: GuildProjectResponse,
  playerId: string | null | undefined,
  source: GuildProjectTurnContributionSource,
  guildTreasuryTurns: number | undefined,
): number {
  if (!playerId) return 0;

  const playerContribution = getPlayerContribution(project, playerId);
  const playerCapRemaining = GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP - (playerContribution?.turnsContributed ?? 0);
  const projectRemaining = project.memberTurnGoal - project.turnsContributed;
  const sourceRemaining = source === 'guild' && guildTreasuryTurns !== undefined
    ? guildTreasuryTurns
    : Number.POSITIVE_INFINITY;

  return Math.max(0, Math.floor(Math.min(playerCapRemaining, projectRemaining, sourceRemaining)));
}

function getMaterialContributionMax(
  project: GuildProjectResponse,
  playerId: string | null | undefined,
  item: ResourceItem | undefined,
): number {
  if (!playerId || !item) return 0;

  const cost = project.materialCosts.find((materialCost) => materialCost.category === item.category);
  if (!cost) return 0;

  const projectRemaining = cost.quantity - (project.materialsProgress[item.category] ?? 0);
  const playerContribution = getPlayerContribution(project, playerId);
  const playerCategoryTotal = playerContribution?.materialsContributed[item.category] ?? 0;
  const playerCapRemaining = GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP - playerCategoryTotal;

  return Math.max(0, Math.floor(Math.min(item.quantity, projectRemaining, playerCapRemaining)));
}

export function GuildProjectsTab({
  guildId,
  myRole,
  playerId,
  guildTreasuryTurns,
  onStateUpdates,
  onGuildUpdated,
}: GuildProjectsTabProps) {
  const [data, setData] = useState<GuildProjectsListResponse | null>(null);
  const load = useAsyncAction();
  const action = useAsyncAction();
  const resourceLoad = useAsyncAction();
  const [turnAmount, setTurnAmount] = useState('1000');
  const [turnSource, setTurnSource] = useState<GuildProjectTurnContributionSource>('player');
  const [showContribute, setShowContribute] = useState<string | null>(null);
  const [resourceItems, setResourceItems] = useState<ResourceItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [materialQuantity, setMaterialQuantity] = useState('10');
  const [showStartConfirm, setShowStartConfirm] = useState<string | null>(null);
  const [projectRefreshPending, setProjectRefreshPending] = useState(false);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const applyProjects = useCallback((nextData?: GuildProjectsListResponse | null) => {
    if (nextData) setData(nextData);
  }, []);

  const loadProjects = useCallback(() => {
    return load.run(() => getGuildProjects(guildId), applyProjects);
  }, [applyProjects, guildId, load.run]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const refreshProjectsAfterContribution = useCallback(async () => {
    setProjectRefreshPending(true);
    try {
      await loadProjects();
    } finally {
      setProjectRefreshPending(false);
    }
  }, [loadProjects]);

  // Load resource items when materials contribute panel opens
  const loadResourceItems = useCallback((neededCategories: string[]) => {
    resourceLoad.run(() => getInventory(), (data) => {
      if (!data) return;
      const resources: ResourceItem[] = [];
      for (const item of data.items) {
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
      setSelectedTemplateId((current) => (
        resources.some((resource) => resource.templateId === current)
          ? current
          : resources[0]?.templateId ?? ''
      ));
    });
  }, [resourceLoad.run]);

  const handleStartProject = (projectKey: string) =>
    action.run(() => startGuildProject(guildId, projectKey), () => void loadProjects());

  const handleContributeTurns = (projectId: string) => {
    const project = data?.projects.find((p) => p.id === projectId);
    if (!project) return;
    const source = project.projectKey === 'war_room' ? turnSource : 'player';
    const maxAmount = getTurnContributionMax(project, playerId, source, guildTreasuryTurns);
    const amount = clampContributionAmount(turnAmount, maxAmount);
    if (amount <= 0) return;
    action.run(() => contributeProjectTurns(guildId, projectId, amount, source), (data) => {
      if (data?.stateUpdates) onStateUpdates?.(data.stateUpdates);
      if (source === 'guild') onGuildUpdated?.();
      void loadProjects();
    });
  };

  const handleContributeMaterials = (projectId: string) => {
    const project = data?.projects.find((p) => p.id === projectId);
    const selectedResource = resourceItems.find((item) => item.templateId === selectedTemplateId);
    if (!project || !selectedResource) return;
    const maxQuantity = getMaterialContributionMax(project, playerId, selectedResource);
    const qty = clampContributionAmount(materialQuantity, maxQuantity);
    if (qty <= 0) return;
    action.run(() => contributeProjectMaterials(guildId, projectId, selectedTemplateId, qty), (response) => {
      if (response?.stateUpdates) onStateUpdates?.(response.stateUpdates);
      void refreshProjectsAfterContribution();
      if (response?.status === 'active') {
        const neededCategories = response.materialCosts
          .filter((c) => (response.materialsProgress[c.category] ?? 0) < c.quantity)
          .map((c) => c.category);
        void loadResourceItems(neededCategories);
      } else {
        setResourceItems([]);
        setSelectedTemplateId('');
      }
    });
  };

  if (load.loading && !data) return <SkeletonCard count={2} />;

  const activeProject = data?.projects.find((p) => p.status === 'active');
  const completedProjects = data?.projects.filter((p) => p.status === 'completed') ?? [];
  const available = data?.available ?? [];

  return (
    <div className="space-y-4">
      {(load.error || action.error || resourceLoad.error) && (
        <ErrorBanner message={(load.error || action.error || resourceLoad.error)!} />
      )}
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
          turnSource={turnSource}
          setTurnSource={setTurnSource}
          playerId={playerId}
          guildTreasuryTurns={guildTreasuryTurns}
          actionLoading={action.loading}
          contributionDisabled={projectRefreshPending}
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
                actionLoading={action.loading}
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
  turnSource,
  setTurnSource,
  playerId,
  guildTreasuryTurns,
  actionLoading,
  contributionDisabled,
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
  turnSource: GuildProjectTurnContributionSource;
  setTurnSource: (v: GuildProjectTurnContributionSource) => void;
  playerId?: string | null;
  guildTreasuryTurns?: number;
  actionLoading: boolean;
  contributionDisabled: boolean;
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
  const canUseGuildTurnBank = project.projectKey === 'war_room';
  const isGuildTurnSource = canUseGuildTurnBank && turnSource === 'guild';
  const activeTurnSource = isGuildTurnSource ? 'guild' : 'player';
  const playerContribution = getPlayerContribution(project, playerId);
  const playerTurnsContributed = playerContribution?.turnsContributed ?? 0;
  const maxTurnContribution = getTurnContributionMax(project, playerId, activeTurnSource, guildTreasuryTurns);
  const canContributeTurns = maxTurnContribution > 0;
  const turnInputContext = isGuildTurnSource ? 'from guild bank' : 'now';
  const selectedResourceItem = resourceItems.find((item) => item.templateId === selectedTemplateId);
  const selectedMaterialContributed = selectedResourceItem
    ? playerContribution?.materialsContributed[selectedResourceItem.category] ?? 0
    : 0;
  const maxMaterialContribution = getMaterialContributionMax(project, playerId, selectedResourceItem);

  useEffect(() => {
    const clamped = clampContributionInput(turnAmount, maxTurnContribution);
    if (turnAmount !== clamped) setTurnAmount(clamped);
  }, [maxTurnContribution, setTurnAmount, turnAmount]);

  useEffect(() => {
    if (maxMaterialContribution <= 0) {
      if (selectedResourceItem && materialQuantity !== '') setMaterialQuantity('');
      return;
    }
    const clamped = clampContributionInput(materialQuantity, maxMaterialContribution);
    if (materialQuantity !== clamped) setMaterialQuantity(clamped);
  }, [materialQuantity, maxMaterialContribution, selectedResourceItem, setMaterialQuantity]);

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
            role="progressbar"
            aria-valuenow={project.turnsContributed}
            aria-valuemin={0}
            aria-valuemax={project.memberTurnGoal}
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
                role="progressbar"
                aria-valuenow={current}
                aria-valuemin={0}
                aria-valuemax={cost.quantity}
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
            aria-expanded={showContribute === 'turns'}
          >
            Contribute Turns
          </PixelButton>
          {hasMaterialsNeeded && (
            <PixelButton
              onClick={() => setShowContribute(showContribute === 'materials' ? null : 'materials')}
              aria-expanded={showContribute === 'materials'}
            >
              Contribute Materials
            </PixelButton>
          )}
        </div>

        {showContribute === 'turns' && (
          <div className="mt-3 p-3 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
            {canUseGuildTurnBank && (
              <div className="mb-3">
                <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Turn source</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['player', 'guild'] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setTurnSource(source)}
                      className={`px-2 py-1.5 rounded border text-xs transition-colors ${
                        turnSource === source
                          ? 'border-[var(--rpg-gold)] text-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10'
                          : 'border-[var(--rpg-border)] text-[var(--rpg-text-secondary)] bg-[var(--rpg-surface)]'
                      }`}
                      aria-pressed={turnSource === source}
                    >
                      {source === 'player' ? 'Personal' : 'Guild bank'}
                    </button>
                  ))}
                </div>
                {turnSource === 'guild' && guildTreasuryTurns !== undefined && (
                  <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
                    Available: {formatNumber(guildTreasuryTurns)} turns
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label htmlFor="contribute-turns-amount" className="text-xs text-[var(--rpg-text-secondary)]">
                  Amount (max {formatNumber(maxTurnContribution)} {turnInputContext}; {formatNumber(GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP)} per person)
                </label>
                <input
                  id="contribute-turns-amount"
                  type="number"
                  value={turnAmount}
                  onChange={(e) => setTurnAmount(clampContributionInput(e.target.value, maxTurnContribution))}
                  min={canContributeTurns ? 1 : 0}
                  max={maxTurnContribution}
                  disabled={actionLoading || contributionDisabled || !canContributeTurns}
                  className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                />
                <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
                  You: {formatNumber(playerTurnsContributed)} / {formatNumber(GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP)} turns
                </p>
              </div>
              <PixelButton onClick={onContributeTurns} disabled={actionLoading || contributionDisabled || !canContributeTurns}>
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
                  <label htmlFor="contribute-material-select" className="text-xs text-[var(--rpg-text-secondary)]">Material</label>
                  <select
                    id="contribute-material-select"
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
                    <label htmlFor="contribute-material-quantity" className="text-xs text-[var(--rpg-text-secondary)]">
                      Quantity (max {formatNumber(maxMaterialContribution)} now; {formatNumber(GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP)} per person/category)
                    </label>
                    <input
                      id="contribute-material-quantity"
                      type="number"
                      value={materialQuantity}
                      onChange={(e) => setMaterialQuantity(clampContributionInput(e.target.value, maxMaterialContribution))}
                      min={1}
                      max={maxMaterialContribution}
                      className="w-full mt-1 p-2 bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded text-sm text-[var(--rpg-text-primary)]"
                    />
                    {selectedResourceItem && (
                      <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
                        You: {formatNumber(selectedMaterialContributed)} / {formatNumber(GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP)} {selectedResourceItem.category}
                      </p>
                    )}
                  </div>
                  <PixelButton onClick={onContributeMaterials} disabled={actionLoading || contributionDisabled || maxMaterialContribution <= 0}>
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

      <div className="mt-2 text-xs">
        <span className="text-[var(--rpg-text-secondary)]">Turn Goal</span>
        <p>{formatNumber(project.memberTurnGoal)}</p>
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
