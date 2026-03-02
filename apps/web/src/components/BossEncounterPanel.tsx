'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  getBossEncounter,
  signUpForBoss,
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
}

export function BossEncounterPanel({ encounterId, playerId, onClose }: BossEncounterPanelProps) {
  const [encounter, setEncounter] = useState<BossEncounterResponse | null>(null);
  const [participants, setParticipants] = useState<BossParticipantResponse[]>([]);
  const [myRewards, setMyRewards] = useState<BossPlayerReward | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [autoSignUp, setAutoSignUp] = useState(false);
  const [signupError, setSignupError] = useState('');
  const autoSignUpInitRef = useRef(false);

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

  // Initialize auto-signup and role from player's existing signup (once)
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

  const displayName = (playerId: string) => usernameMap.get(playerId) ?? playerId.slice(0, 8) + '...';

  // Compute top contributors for defeated summary
  const topContributors = useMemo(() => {
    if (encounter?.status !== 'defeated') return [];
    const dmgMap = new Map<string, number>();
    for (const p of participants) {
      dmgMap.set(p.playerId, (dmgMap.get(p.playerId) ?? 0) + p.totalDamage + p.totalHealing);
    }
    return Array.from(dmgMap.entries())
      .sort(([, a], [, b]) => b - a)
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

      {/* HP Bar — percentage only (absolute values rescale between rounds) */}
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

      {/* Signup */}
      {!isOver && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-sm font-semibold">Sign up for next round</p>
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
                {topContributors.map(([playerId, contribution], i) => (
                  <div key={playerId} className="flex justify-between">
                    <span>{i + 1}. {displayName(playerId)}</span>
                    <span>{contribution.toLocaleString()} total</span>
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
                  <div className="space-y-0.5">
                    {roundParticipants.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span className="truncate">
                          {displayName(p.playerId)}
                          {p.autoSignUp && <span className="ml-1 opacity-60">(auto)</span>}
                        </span>
                        <span>
                          {p.totalDamage > 0 && `${p.totalDamage} dmg`}
                          {p.totalHealing > 0 && ` ${p.totalHealing} healed`}
                          {p.attacks > 0 && (
                            <span className="ml-1 opacity-60">
                              ({p.hits}/{p.attacks} hit{p.crits > 0 ? `, ${p.crits} crit` : ''})
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
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
