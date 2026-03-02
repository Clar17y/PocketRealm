'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Shield } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import {
  getBossEncounter,
  signUpForBoss,
  getActiveTemplate,
  getTemplates,
  type BossEncounterResponse,
  type BossParticipantResponse,
  type BossPlayerReward,
  type BossRoundSummary,
} from '@/lib/api';
import { BossRewardsDisplay } from '@/components/common/BossRewardsDisplay';

interface BossEncounterPanelProps {
  encounterId: string;
  playerId?: string;
  onClose?: () => void;
  onNavigate?: (screen: string) => void;
}

export function BossEncounterPanel({ encounterId, playerId, onClose, onNavigate }: BossEncounterPanelProps) {
  const [encounter, setEncounter] = useState<BossEncounterResponse | null>(null);
  const [participants, setParticipants] = useState<BossParticipantResponse[]>([]);
  const [myRewards, setMyRewards] = useState<BossPlayerReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [autoSignUp, setAutoSignUp] = useState(false);
  const [signupError, setSignupError] = useState('');
  const autoSignUpInitRef = useRef(false);

  // Active template state
  const [activeTemplateName, setActiveTemplateName] = useState<string | null>(null);
  const [activeTemplateActionCount, setActiveTemplateActionCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await getBossEncounter(encounterId);
    if (res.data) {
      setEncounter(res.data.encounter);
      setParticipants(res.data.participants);
      setMyRewards(res.data.myRewards ?? null);
    }
    setLoading(false);
  }, [encounterId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch active template on mount
  useEffect(() => {
    async function loadTemplate() {
      const [activeRes, templatesRes] = await Promise.all([
        getActiveTemplate(),
        getTemplates(),
      ]);
      if (activeRes.data) {
        setActiveTemplateActionCount(activeRes.data.actions.length);
      }
      if (templatesRes.data) {
        const active = templatesRes.data.templates.find((t) => t.isActive);
        if (active) setActiveTemplateName(active.name);
      }
    }
    loadTemplate();
  }, []);

  // Initialize auto-signup from player's existing signup (once)
  useEffect(() => {
    if (!playerId || !encounter || autoSignUpInitRef.current) return;
    autoSignUpInitRef.current = true;
    const nextRound = encounter.roundNumber + 1;
    const mySignup = participants.find(
      (p) => p.playerId === playerId && p.roundNumber === nextRound,
    );
    if (mySignup) {
      setAutoSignUp(mySignup.autoSignUp);
    }
  }, [playerId, encounter, participants]);

  async function handleSignup() {
    setSigning(true);
    setSignupError('');
    const res = await signUpForBoss(encounterId, autoSignUp);
    if (res.error) {
      setSignupError(res.error.message);
    } else {
      await refresh();
    }
    setSigning(false);
  }

  // Group participants by round
  const roundGroups = useMemo(() => {
    const groups = new Map<number, BossParticipantResponse[]>();
    for (const p of participants) {
      const list = groups.get(p.roundNumber) ?? [];
      list.push(p);
      groups.set(p.roundNumber, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b - a);
  }, [participants]);

  // Build playerId → username lookup
  const usernameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      if (p.username && !map.has(p.playerId)) {
        map.set(p.playerId, p.username);
      }
    }
    return map;
  }, [participants]);

  const displayName = (pid: string) => usernameMap.get(pid) ?? pid.slice(0, 8) + '...';

  // Find aggro holder per round (highest threat among alive participants)
  const aggroHolderByRound = useMemo(() => {
    const map = new Map<number, string>();
    for (const [roundNum, roundParticipants] of roundGroups) {
      const alive = roundParticipants.filter((p) => p.status === 'alive');
      if (alive.length > 0) {
        const top = alive.reduce((a, b) => (a.threat >= b.threat ? a : b));
        if (top.threat > 0) map.set(roundNum, top.id);
      }
    }
    return map;
  }, [roundGroups]);

  // Compute top contributors for defeated summary
  const topContributors = useMemo(() => {
    if (encounter?.status !== 'defeated') return [];
    const statMap = new Map<string, { contribution: number; absorbed: number }>();
    for (const p of participants) {
      const existing = statMap.get(p.playerId) ?? { contribution: 0, absorbed: 0 };
      existing.contribution += p.totalDamage + p.totalHealing;
      existing.absorbed += p.damageAbsorbed;
      statMap.set(p.playerId, existing);
    }
    return Array.from(statMap.entries())
      .sort(([, a], [, b]) => b.contribution - a.contribution)
      .slice(0, 5);
  }, [encounter?.status, participants]);

  if (loading) {
    return <PixelCard className="p-4 text-center">Loading boss encounter...</PixelCard>;
  }

  if (!encounter) {
    return <PixelCard className="p-4 text-center">Boss encounter not found.</PixelCard>;
  }

  const hpPercent = Math.max(0, Math.min(100, (encounter.currentHp / encounter.maxHp) * 100));
  const isOver = encounter.status === 'defeated' || encounter.status === 'expired';
  const summaryMap = new Map<number, BossRoundSummary>();
  if (encounter.roundSummaries) {
    for (const s of encounter.roundSummaries) {
      summaryMap.set(s.round, s);
    }
  }

  return (
    <PixelCard className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg" style={{ color: 'var(--rpg-red)' }}>
          {encounter.mobName} (Lv.{encounter.mobLevel})
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100">
            Close
          </button>
        )}
      </div>

      {/* HP Bar -- percentage only (absolute values rescale between rounds) */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span>Boss HP</span>
          <span>{Math.round(hpPercent)}%</span>
        </div>
        <div className="w-full h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${hpPercent}%`,
              background: hpPercent > 50 ? 'var(--rpg-red)' : hpPercent > 25 ? 'var(--rpg-gold)' : '#ff4444',
            }}
          />
        </div>
      </div>

      {/* Status */}
      <div className="flex justify-between text-xs">
        <span>
          Round {encounter.roundNumber} — {encounter.status}
        </span>
        {encounter.nextRoundAt && !isOver && (
          <span>
            Next round at {new Date(encounter.nextRoundAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Boss effect badges */}
      {encounter.bossEffects && encounter.bossEffects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {encounter.bossEffects.map((effect, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
              style={{
                background: effect.modifier > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                color: effect.modifier > 0 ? 'var(--rpg-red)' : 'var(--rpg-blue-light)',
              }}
            >
              {effect.name} ({effect.stat} {effect.modifier > 0 ? '+' : ''}{effect.modifier})
              {effect.roundsRemaining > 0 && (
                <span className="ml-1 opacity-70">{effect.roundsRemaining}r</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Signup */}
      {!isOver && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-sm font-semibold">Sign up for next round</p>

          {/* Active template display */}
          {activeTemplateName && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--rpg-text-secondary)]">
                Active: <span className="text-[var(--rpg-text-primary)] font-medium">{activeTemplateName}</span>
                {' '}({activeTemplateActionCount}r)
              </span>
              {onNavigate && (
                <button
                  onClick={() => onNavigate('templates')}
                  className="text-[var(--rpg-blue-light)] hover:underline"
                >
                  Change Template
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={autoSignUp}
                onChange={(e) => setAutoSignUp(e.target.checked)}
                className="rounded"
              />
              Auto re-signup each round
            </label>
          </div>
          <PixelButton onClick={handleSignup} disabled={signing} size="sm">
            {signing ? 'Signing up...' : 'Sign Up (200 turns)'}
          </PixelButton>
          {signupError && (
            <p className="text-xs" style={{ color: 'var(--rpg-red)' }}>{signupError}</p>
          )}
        </div>
      )}

      {/* Defeated boss fight summary */}
      {encounter.status === 'defeated' && (
        <div className="border-t border-white/10 pt-3 space-y-2">
          <div className="text-center p-2 rounded" style={{ background: 'rgba(76,175,80,0.2)' }}>
            <span className="font-bold" style={{ color: 'var(--rpg-green-light)' }}>
              Boss Defeated!
            </span>
            {encounter.killedByUsername && (
              <p className="text-xs mt-1" style={{ color: 'var(--rpg-gold)' }}>
                Kill credit: {encounter.killedByUsername}
              </p>
            )}
          </div>
          {myRewards && (
            <div className="mt-2">
              <BossRewardsDisplay rewards={myRewards} />
            </div>
          )}
          <div className="text-xs space-y-1">
            <p>Total rounds: {encounter.roundNumber}</p>
            {topContributors.length > 0 && (
              <div>
                <p className="font-semibold mb-1">Top contributors:</p>
                {topContributors.map(([pid, stats], i) => (
                  <div key={pid} className="flex justify-between">
                    <span>{i + 1}. {displayName(pid)}</span>
                    <span>
                      {stats.contribution.toLocaleString()} total
                      {stats.absorbed > 0 && (
                        <span className="ml-1 opacity-70">
                          ({stats.absorbed.toLocaleString()} absorbed)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Round-grouped participant list */}
      {roundGroups.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="text-sm font-semibold mb-2">
            Participants ({participants.length})
          </p>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {roundGroups.map(([roundNum, roundParticipants]) => {
              const summary = summaryMap.get(roundNum);
              const aggroId = aggroHolderByRound.get(roundNum);
              return (
                <div key={roundNum}>
                  <div className="flex justify-between text-xs font-semibold mb-1" style={{ color: 'var(--rpg-gold)' }}>
                    <span>Round {roundNum}</span>
                    {summary && (
                      <span>
                        Boss dealt {summary.bossDamage.toLocaleString()} dmg | Players dealt {summary.totalPlayerDamage.toLocaleString()} dmg
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {roundParticipants.map((p) => {
                      const isAggro = p.id === aggroId;
                      return (
                        <div
                          key={p.id}
                          className="rounded px-1.5 py-1"
                          style={{
                            background: isAggro ? 'rgba(239,68,68,0.1)' : undefined,
                            borderLeft: isAggro ? '2px solid var(--rpg-red)' : '2px solid transparent',
                          }}
                        >
                          {/* Name row */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate">
                              {displayName(p.playerId)}
                              {p.autoSignUp && <span className="ml-1 opacity-60">(auto)</span>}
                              {p.status === 'knocked_out' && (
                                <span className="ml-1 text-[var(--rpg-red)]">[KO]</span>
                              )}
                            </span>
                            <span className="flex items-center gap-2">
                              {/* Template round indicator */}
                              {activeTemplateActionCount > 0 && (
                                <span className="opacity-70">R{p.templateRound}/{activeTemplateActionCount}</span>
                              )}
                              {/* Threat with shield icon */}
                              <span
                                className="inline-flex items-center gap-0.5"
                                style={{ color: isAggro ? 'var(--rpg-red)' : undefined }}
                                title={isAggro ? 'Aggro holder' : `Threat: ${p.threat}`}
                              >
                                <Shield size={10} />
                                {p.threat}
                              </span>
                            </span>
                          </div>

                          {/* Stamina / Mana bars */}
                          <div className="flex gap-2 mt-0.5">
                            <StatBar
                              current={p.currentStamina}
                              max={100}
                              color="stamina"
                              size="sm"
                              showNumbers={false}
                              className="flex-1"
                            />
                            <StatBar
                              current={p.currentMana}
                              max={50}
                              color="mana"
                              size="sm"
                              showNumbers={false}
                              className="flex-1"
                            />
                          </div>

                          {/* Damage / healing stats */}
                          <div className="flex justify-between text-xs mt-0.5 opacity-80">
                            <span>
                              {p.totalDamage > 0 && `${p.totalDamage} dmg`}
                              {p.totalHealing > 0 && ` ${p.totalHealing} healed`}
                              {p.damageAbsorbed > 0 && ` ${p.damageAbsorbed} absorbed`}
                            </span>
                            {p.attacks > 0 && (
                              <span className="opacity-60">
                                ({p.hits}/{p.attacks} hit{p.crits > 0 ? `, ${p.crits} crit` : ''})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PixelCard>
  );
}
