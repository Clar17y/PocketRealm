'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle, Hammer, MapPin, RotateCcw } from 'lucide-react';
import {
  canLearnVocationTechniqueInTown,
  describeVocationTechnique,
  getPartialRespecRefund,
  getVocationDefinition,
  isAdvancedVocationTechnique,
  VOCATION_DEFINITIONS,
  VOCATION_MASTERY,
  type VocationId,
  type VocationMentorTown,
  type VocationSnapshotResponse,
  type VocationStateDto,
  type VocationTechniqueDefinition,
} from '@pocketrealm/shared';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { ScreenContainer } from '../common/ScreenContainer';

interface VocationsProps {
  snapshot: VocationSnapshotResponse | null;
  availableTurns: number;
  currentZoneName: string | null;
  currentZoneType: string | null;
  busyAction: string | null;
  onHone: (vocationId: VocationId, turns: number) => void | Promise<void>;
  onLearnTechnique: (vocationId: VocationId, techniqueId: string) => void | Promise<void>;
  onRespec: (vocationId: VocationId) => void | Promise<void>;
}

function mentorTownLabel(mentorTown: VocationMentorTown) {
  return mentorTown === 'millbrook' ? 'Millbrook' : 'Thornwall';
}

function resolveCurrentMentorTown(currentZoneName: string | null, currentZoneType: string | null): VocationMentorTown | null {
  if (currentZoneType !== 'town') return null;

  const zoneName = (currentZoneName ?? '').toLowerCase();
  if (zoneName.includes('millbrook')) return 'millbrook';
  if (zoneName.includes('thornwall')) return 'thornwall';

  return null;
}

function formatTag(value: string) {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();

  return spaced.replace(/^\w/, (letter) => letter.toUpperCase());
}

function progressPct(vocation: VocationStateDto) {
  const span = Math.max(1, vocation.xpForNextRank - vocation.xpForCurrentRank);
  return Math.max(0, Math.min(100, Math.round(((vocation.xp - vocation.xpForCurrentRank) / span) * 100)));
}

function techniqueTags(technique: VocationTechniqueDefinition) {
  const rule = technique.applicationRule;
  if (rule.type === 'craft') {
    return [`Craft: ${rule.skill}`, ...rule.itemTypes];
  }
  if (rule.type === 'gathering') {
    return [`Gather: ${rule.skill}`, ...rule.resourceCategories];
  }
  return ['Equipment action', ...rule.actionTypes];
}

export function Vocations({
  snapshot,
  availableTurns,
  currentZoneName,
  currentZoneType,
  busyAction,
  onHone,
  onLearnTechnique,
  onRespec,
}: VocationsProps) {
  const [selectedVocationId, setSelectedVocationId] = useState<VocationId>('weaponsmith');
  const [honingTurns, setHoningTurns] = useState(VOCATION_MASTERY.HONE_ACTION_TURN_MIN);
  const [confirmRespec, setConfirmRespec] = useState(false);

  const vocationRows = snapshot?.vocations ?? [];
  const selectedDefinition = getVocationDefinition(selectedVocationId) ?? VOCATION_DEFINITIONS[0];
  const selectedProgress = vocationRows.find((vocation) => vocation.vocationId === selectedVocationId)
    ?? null;
  const currentMentorTown = resolveCurrentMentorTown(currentZoneName, currentZoneType);
  const canUseMentor = currentMentorTown !== null;
  const maxHoneTurns = Math.max(
    0,
    Math.min(availableTurns, snapshot?.dailyCap.turnsRemaining ?? 0, VOCATION_MASTERY.HONE_ACTION_TURN_LIMIT),
  );
  const minHoneTurns = VOCATION_MASTERY.HONE_ACTION_TURN_MIN;
  const inputMaxHoneTurns = Math.max(minHoneTurns, maxHoneTurns);
  const canHone = canUseMentor && maxHoneTurns >= minHoneTurns;
  const isBusy = busyAction === 'vocations';

  useEffect(() => {
    setHoningTurns((current) => Math.max(minHoneTurns, Math.min(current, inputMaxHoneTurns)));
  }, [inputMaxHoneTurns, minHoneTurns, selectedVocationId]);

  const learnedTechniqueIds = useMemo(
    () => new Set(selectedProgress?.learnedTechniqueIds ?? []),
    [selectedProgress?.learnedTechniqueIds],
  );

  if (!snapshot) {
    return (
      <ScreenContainer>
        <PixelCard>
          <div className="text-sm text-[var(--rpg-text-secondary)]">Loading vocations...</div>
        </PixelCard>
      </ScreenContainer>
    );
  }

  const spentPoints = selectedProgress?.spentPoints ?? 0;
  const refundPoints = getPartialRespecRefund(spentPoints);

  return (
    <ScreenContainer>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Vocations</h2>
          <div className="text-xs text-[var(--rpg-text-secondary)]">
            Daily honing: <span className="font-pixel text-[10px] text-[var(--rpg-gold)]">{snapshot.dailyCap.turnsSpent}</span>
            {' / '}
            <span className="font-pixel text-[10px]">{snapshot.dailyCap.turnsLimit}</span>
          </div>
        </div>
        <div className="text-right text-xs text-[var(--rpg-text-secondary)]">
          <div>{availableTurns.toLocaleString()} turns available</div>
          <div>{snapshot.dailyCap.turnsRemaining.toLocaleString()} honing turns left today</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
        <div className="space-y-2">
          {VOCATION_DEFINITIONS.map((definition) => {
            const progress = vocationRows.find((row) => row.vocationId === definition.id);
            const isSelected = definition.id === selectedVocationId;

            return (
              <button
                key={definition.id}
                type="button"
                aria-label={definition.name}
                onClick={() => setSelectedVocationId(definition.id)}
                className="w-full text-left"
              >
                <PixelCard
                  padding="sm"
                  className={isSelected ? 'border-[var(--rpg-gold)]' : ''}
                >
                  <div className="flex items-center gap-2">
                    <Hammer size={16} className="text-[var(--rpg-gold)] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{definition.name}</span>
                        <span className="font-pixel text-[10px] text-[var(--rpg-gold)]">R{progress?.rank ?? 1}</span>
                      </div>
                      <div className="text-[11px] text-[var(--rpg-text-secondary)] truncate">
                        {formatTag(definition.primarySkill)}
                      </div>
                    </div>
                  </div>
                </PixelCard>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          <PixelCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">
                    {selectedDefinition.name}
                  </h3>
                  <span className="text-xs text-[var(--rpg-gold)]">
                    Rank <span className="font-pixel text-[10px]">{selectedProgress?.rank ?? 1}</span>
                  </span>
                </div>
                <p className="text-sm text-[var(--rpg-text-secondary)] mt-1">{selectedDefinition.description}</p>
              </div>
              <div className="text-right text-xs text-[var(--rpg-text-secondary)]">
                <div>Points: <span className="font-pixel text-[10px] text-[var(--rpg-gold)]">{selectedProgress?.availableMasteryPoints ?? 0}</span></div>
                <div>Spent: <span className="font-pixel text-[10px]">{spentPoints}</span></div>
              </div>
            </div>

            {selectedProgress && (
              <div className="mt-3">
                <div className="h-2 bg-[var(--rpg-background)] rounded-full overflow-hidden border border-[var(--rpg-border)]">
                  <div className="h-full bg-[var(--rpg-gold)]" style={{ width: `${progressPct(selectedProgress)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-[var(--rpg-text-secondary)]">
                  <span>{selectedProgress.xp.toLocaleString()} XP</span>
                  <span>{selectedProgress.xpForNextRank.toLocaleString()} next rank</span>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg bg-[var(--rpg-background)] border border-[var(--rpg-border)] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-[var(--rpg-text-primary)]">
                  <MapPin size={14} className={canUseMentor ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'} />
                  Mentor: Millbrook or Thornwall
                </div>
                <span className="text-xs text-[var(--rpg-text-secondary)]">
                  {currentMentorTown ? mentorTownLabel(currentMentorTown) : (currentZoneName ?? 'No zone')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--rpg-text-secondary)]">
                Any town mentor can teach basic honing and rank 1-4 techniques. Advanced techniques require Thornwall.
              </p>

              <label className="block text-xs font-semibold text-[var(--rpg-text-secondary)]" htmlFor="vocation-honing-turns">
                Honing turns
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  id="vocation-honing-turns"
                  aria-label="Honing turns"
                  type="number"
                  min={minHoneTurns}
                  max={inputMaxHoneTurns}
                  value={honingTurns}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setHoningTurns(Number.isFinite(next)
                      ? Math.max(minHoneTurns, Math.min(Math.floor(next), inputMaxHoneTurns))
                      : minHoneTurns);
                  }}
                  className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]"
                />
                <PixelButton
                  variant="gold"
                  size="sm"
                  disabled={!canHone || isBusy}
                  onClick={() => onHone(selectedVocationId, Math.min(honingTurns, maxHoneTurns))}
                >
                  Hone {selectedDefinition.name}
                </PixelButton>
              </div>
            </div>
          </PixelCard>

          <div className="space-y-3">
            {selectedDefinition.branches.map((branch) => (
              <PixelCard key={branch.id}>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen size={15} className="text-[var(--rpg-gold)]" />
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--rpg-text-primary)]">{branch.name}</h4>
                    <p className="text-xs text-[var(--rpg-text-secondary)]">{branch.description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedDefinition.techniques
                    .filter((technique) => technique.branchId === branch.id)
                    .map((technique) => {
                      const learned = learnedTechniqueIds.has(technique.id);
                      const rankLocked = (selectedProgress?.rank ?? 1) < technique.requiredRank;
                      const pointLocked = (selectedProgress?.availableMasteryPoints ?? 0) < technique.pointCost;
                      const mentorLocked = !canLearnVocationTechniqueInTown(technique, currentMentorTown);
                      const locked = rankLocked || pointLocked || mentorLocked;
                      const label = technique.name;
                      const effectDescription = describeVocationTechnique(technique);

                      return (
                        <div key={technique.id} className="rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-background)] p-3">
                          <div className="flex items-start gap-2">
                            {learned ? (
                              <CheckCircle size={15} className="text-[var(--rpg-green-light)] mt-0.5 shrink-0" />
                            ) : (
                              <div className="w-[15px] h-[15px] rounded-full border border-[var(--rpg-border)] mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-[var(--rpg-text-primary)]">{label}</span>
                                <span className="text-[10px] text-[var(--rpg-gold)]">R{technique.requiredRank}</span>
                                <span className="text-[10px] text-[var(--rpg-text-secondary)]">{technique.pointCost} pt</span>
                              </div>
                              <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">{technique.description}</p>
                              <p className="text-xs text-[var(--rpg-text-primary)] mt-1">{effectDescription}</p>
                              {mentorLocked && (
                                <p className="text-[11px] text-[var(--rpg-red)] mt-1">
                                  {isAdvancedVocationTechnique(technique)
                                    ? 'Advanced techniques require Thornwall.'
                                    : 'Visit Millbrook or Thornwall to learn this technique.'}
                                </p>
                              )}
                              <div className="flex gap-1.5 flex-wrap mt-2">
                                {techniqueTags(technique).map((tag) => (
                                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] border border-[var(--rpg-border)]">
                                    {formatTag(tag)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {!learned && (
                              <PixelButton
                                size="sm"
                                variant={locked ? 'secondary' : 'primary'}
                                disabled={locked || isBusy}
                                aria-label={`Learn ${label}`}
                                onClick={() => onLearnTechnique(selectedVocationId, technique.id)}
                              >
                                Learn
                              </PixelButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </PixelCard>
            ))}
          </div>

          <PixelButton
            variant="danger"
            size="sm"
            className="w-full"
            disabled={!canUseMentor || spentPoints <= 0 || isBusy}
            onClick={() => setConfirmRespec(true)}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <RotateCcw size={14} />
              Respec {selectedDefinition.name} ({refundPoints} point refund)
            </span>
          </PixelButton>
        </div>
      </div>

      {confirmRespec && (
        <ConfirmModal
          title={`Respec ${selectedDefinition.name}`}
          message={`Forget learned ${selectedDefinition.name} techniques and refund ${refundPoints} of ${spentPoints} spent mastery points?`}
          confirmLabel="Respec"
          variant="danger"
          onConfirm={async () => {
            await onRespec(selectedVocationId);
            setConfirmRespec(false);
          }}
          onCancel={() => setConfirmRespec(false)}
        />
      )}
    </ScreenContainer>
  );
}
