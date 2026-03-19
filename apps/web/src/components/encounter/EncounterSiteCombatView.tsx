'use client';

import { useState, useCallback, useRef } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  RoomProgressBar,
  MobCardGrid,
  CombatActionButtons,
  TemplateQuickSwitch,
  PlayerResourceBars,
  CombatRoundLog,
} from '@/components/common/combat';
import type {
  EncounterAutoResolveResponse,
  EncounterStartRoomResponse,
  EncounterManualRoundResponse,
  EncounterRoundSnapshot,
  EncounterPlayerState,
} from '@/lib/api/combat';
import type { ExpeditionMobInfo, ExpeditionRoundLog, CombatTemplateData } from '@pocketrealm/shared';

type CombatState = 'room_preview' | 'auto_playback' | 'manual_combat' | 'room_result';

export interface EncounterSiteCombatViewProps {
  siteId: string;
  siteName: string;
  mobFamilyName: string;
  currentRoom: number;
  totalRooms: number;
  initialMobs: ExpeditionMobInfo[];
  playerState: EncounterPlayerState;
  templates: CombatTemplateData[];
  hasDecayedMobs: boolean;
  onAutoResolve: () => Promise<EncounterAutoResolveResponse>;
  onStartRoom: () => Promise<EncounterStartRoomResponse>;
  onResolveRound: (action: { action: string; targetMobSlot?: number }) => Promise<EncounterManualRoundResponse>;
  onAbandon: () => Promise<void>;
  onAdvanceRoom: () => Promise<{
    currentRoom: number;
    mobs: ExpeditionMobInfo[];
    playerState: EncounterPlayerState;
    hasDecayedMobs: boolean;
  }>;
  onRetryRoom: () => Promise<EncounterStartRoomResponse>;
  onComplete: () => void;
  onActivateTemplate: (templateId: string) => void;
  setError: (msg: string | null) => void;
}

function parseMobSlot(mobId: string): number {
  return parseInt(mobId.replace('encounter-mob-', ''), 10);
}

function updateMobsFromSnapshot(
  mobs: ExpeditionMobInfo[],
  mobStates: EncounterRoundSnapshot['mobStates'],
): ExpeditionMobInfo[] {
  return mobs.map(mob => {
    const slot = parseMobSlot(mob.id);
    const ms = mobStates.find(s => s.slot === slot);
    if (!ms) return mob;
    return { ...mob, hp: ms.hp, maxHp: ms.maxHp, activeEffects: ms.activeEffects };
  });
}

function startRoomMobsToExpeditionMobs(
  mobs: EncounterStartRoomResponse['mobs'],
): ExpeditionMobInfo[] {
  return mobs.map(m => ({
    id: m.mobId,
    name: m.name,
    prefix: m.prefix,
    hp: m.hp,
    maxHp: m.maxHp,
    activeEffects: [],
  }));
}

export function EncounterSiteCombatView(props: EncounterSiteCombatViewProps) {
  const [state, setState] = useState<CombatState>('room_preview');
  const [currentRoom, setCurrentRoom] = useState(props.currentRoom);
  const [mobs, setMobs] = useState<ExpeditionMobInfo[]>(props.initialMobs);
  const [playerState, setPlayerState] = useState(props.playerState);
  const [roundLogs, setRoundLogs] = useState<ExpeditionRoundLog[]>([]);
  const [targetMobId, setTargetMobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<'cleared' | 'defeated' | 'site_cleared' | null>(null);
  const [chestReward, setChestReward] = useState<EncounterAutoResolveResponse['chestReward'] | null>(null);
  const [hasDecayedMobs, setHasDecayedMobs] = useState(props.hasDecayedMobs);

  // Auto-playback state
  const [playbackRounds, setPlaybackRounds] = useState<EncounterRoundSnapshot[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const isPlayingBackRef = useRef(false);

  // --- Handlers ---

  const handleAutoResolve = useCallback(async () => {
    setLoading(true);
    try {
      const result = await props.onAutoResolve();
      setPlaybackRounds(result.rounds);
      setPlaybackIndex(0);
      isPlayingBackRef.current = true;
      setState('auto_playback');
      setOutcome(result.outcome);
      if (result.chestReward) setChestReward(result.chestReward);

      // Start animated playback
      for (let i = 0; i < result.rounds.length; i++) {
        if (!isPlayingBackRef.current) break;

        const snapshot = result.rounds[i];
        setPlaybackIndex(i);
        setRoundLogs(prev => [...prev, snapshot.log]);
        setMobs(prev => updateMobsFromSnapshot(prev, snapshot.mobStates));
        setPlayerState(snapshot.playerState);

        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      isPlayingBackRef.current = false;
      setState('room_result');
    } catch (err) {
      props.setError((err as Error).message ?? 'Auto-resolve failed');
    } finally {
      setLoading(false);
    }
  }, [props.onAutoResolve]);

  const handleSkipPlayback = useCallback(() => {
    isPlayingBackRef.current = false;
    const lastRound = playbackRounds[playbackRounds.length - 1];
    if (lastRound) {
      setRoundLogs(playbackRounds.map(r => r.log));
      setMobs(prev => updateMobsFromSnapshot(prev, lastRound.mobStates));
      setPlayerState(lastRound.playerState);
    }
    setState('room_result');
  }, [playbackRounds]);

  const handleStartManual = useCallback(async () => {
    setLoading(true);
    try {
      const result = await props.onStartRoom();
      setMobs(startRoomMobsToExpeditionMobs(result.mobs));
      setPlayerState(result.playerState);
      setState('manual_combat');
    } catch (err) {
      props.setError((err as Error).message ?? 'Failed to start room');
    } finally {
      setLoading(false);
    }
  }, [props.onStartRoom]);

  const handleNextRound = useCallback(async () => {
    setLoading(true);
    try {
      const targetSlot = targetMobId ? parseMobSlot(targetMobId) : undefined;
      const result = await props.onResolveRound({
        action: 'template',
        targetMobSlot: targetSlot,
      });

      setRoundLogs(prev => [...prev, result.roundLog]);
      setMobs(prev => updateMobsFromSnapshot(prev, result.mobStates));
      setPlayerState(result.playerState);

      if (result.outcome === 'cleared' || result.outcome === 'site_cleared') {
        setOutcome(result.outcome);
        if (result.chestReward) setChestReward(result.chestReward);
        setState('room_result');
      } else if (result.outcome === 'defeated') {
        setOutcome('defeated');
        setState('room_result');
      }
    } catch (err) {
      props.setError((err as Error).message ?? 'Failed to resolve round');
    } finally {
      setLoading(false);
    }
  }, [targetMobId, props.onResolveRound]);

  const handleContinue = useCallback(async () => {
    setLoading(true);
    try {
      const nextRoom = await props.onAdvanceRoom();
      setCurrentRoom(nextRoom.currentRoom);
      setMobs(nextRoom.mobs);
      setPlayerState(nextRoom.playerState);
      setHasDecayedMobs(nextRoom.hasDecayedMobs);
      setRoundLogs([]);
      setOutcome(null);
      setChestReward(null);
      setTargetMobId(null);
      setState('room_preview');
    } catch (err) {
      props.setError('Failed to advance room');
    } finally {
      setLoading(false);
    }
  }, [props.onAdvanceRoom]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    try {
      const result = await props.onRetryRoom();
      setMobs(startRoomMobsToExpeditionMobs(result.mobs));
      setPlayerState(result.playerState);
      setRoundLogs([]);
      setOutcome(null);
      setTargetMobId(null);
      setState('room_preview');
    } catch (err) {
      props.setError('Failed to retry room');
    } finally {
      setLoading(false);
    }
  }, [props.onRetryRoom]);

  const handleAbandon = useCallback(async () => {
    setLoading(true);
    try {
      await props.onAbandon();
      props.onComplete();
    } catch (err) {
      props.setError('Failed to abandon site');
    } finally {
      setLoading(false);
    }
  }, [props.onAbandon, props.onComplete]);

  // --- Render ---

  return (
    <div className="flex flex-col gap-3">
      {/* Sticky playback bar during auto_playback */}
      {state === 'auto_playback' && (
        <div className="sticky top-0 z-20 bg-[var(--rpg-surface)] border-b border-[var(--rpg-border)] p-3 flex justify-between items-center rounded">
          <span className="text-xs font-pixel text-[var(--rpg-text-primary)]">
            Round {playbackIndex + 1} / {playbackRounds.length}
          </span>
          <PixelButton size="sm" onClick={handleSkipPlayback} variant="secondary">
            Skip
          </PixelButton>
        </div>
      )}

      {/* Header */}
      <PixelCard>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-pixel text-[var(--rpg-gold)]">{props.siteName}</h3>
            <span className="text-xs text-[var(--rpg-text-secondary)]">{props.mobFamilyName}</span>
          </div>
        </div>
        <RoomProgressBar currentRoom={currentRoom} totalRooms={props.totalRooms} />
      </PixelCard>

      {/* Action buttons — context dependent */}
      {state === 'room_preview' && (
        <>
          {hasDecayedMobs && (
            <div className="text-xs text-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10 border border-[var(--rpg-gold)]/30 rounded px-3 py-2">
              Decayed mobs detected — auto-resolve bonus disabled for this room.
            </div>
          )}
          <CombatActionButtons
            loading={loading}
            actions={[
              { key: 'auto', label: 'Auto-Resolve', subtext: 'Template locked — instant clear', onClick: handleAutoResolve },
              { key: 'manual', label: 'Fight Manually', subtext: 'Round by round', onClick: handleStartManual },
              { key: 'abandon', label: 'Abandon', onClick: handleAbandon, variant: 'danger' },
            ]}
          />
          <TemplateQuickSwitch
            templates={props.templates}
            activeTemplateId={props.templates.find(t => t.isActive)?.id ?? props.templates[0]?.id ?? null}
            onActivate={props.onActivateTemplate}
          />
        </>
      )}

      {state === 'manual_combat' && (
        <CombatActionButtons
          loading={loading}
          actions={[
            { key: 'next-round', label: 'Next Round', onClick: handleNextRound },
            { key: 'abandon', label: 'Abandon', onClick: handleAbandon, variant: 'danger' },
          ]}
        />
      )}

      {/* Room result */}
      {state === 'room_result' && (
        <PixelCard>
          {(outcome === 'cleared') && currentRoom < props.totalRooms && (
            <>
              <h3 className="text-sm font-pixel text-[var(--rpg-green-light)]">
                Room {currentRoom} Cleared!
              </h3>
              <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                {roundLogs.length} rounds — carry HP: {Math.floor(playerState.hp)}/{playerState.maxHp}
              </p>
              <div className="mt-2">
                <PixelButton onClick={handleContinue} disabled={loading}>
                  Continue to Room {currentRoom + 1}
                </PixelButton>
              </div>
            </>
          )}

          {(outcome === 'site_cleared' || (outcome === 'cleared' && currentRoom >= props.totalRooms)) && (
            <>
              <h3 className="text-sm font-pixel text-[var(--rpg-gold)]">
                Site Cleared!
              </h3>
              {chestReward && (
                <div className="mt-2 space-y-1">
                  <span className="text-xs font-pixel text-[var(--rpg-gold)]">
                    {chestReward.rarity.charAt(0).toUpperCase() + chestReward.rarity.slice(1)} Chest
                  </span>
                  {chestReward.materials.map(m => (
                    <div key={m.itemTemplateId} className="text-xs text-[var(--rpg-text-primary)]">
                      {m.name} x{m.quantity}
                    </div>
                  ))}
                  {chestReward.recipe && (
                    <div className="text-xs text-[var(--rpg-blue-light)]">
                      Recipe: {chestReward.recipe.name}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2">
                <PixelButton onClick={props.onComplete}>Done</PixelButton>
              </div>
            </>
          )}

          {outcome === 'defeated' && (
            <>
              <h3 className="text-sm font-pixel text-[var(--rpg-red)]">
                Defeated in Room {currentRoom}
              </h3>
              <p className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                Retrying charges the turn cost again.
              </p>
              <div className="flex gap-2 mt-2">
                <PixelButton onClick={handleRetry} disabled={loading}>Retry Room</PixelButton>
                <PixelButton onClick={handleAbandon} variant="danger" disabled={loading}>Abandon Site</PixelButton>
              </div>
            </>
          )}
        </PixelCard>
      )}

      {/* Mob grid */}
      <MobCardGrid
        mobs={mobs}
        myTargetMobId={targetMobId}
        targetCounts={new Map()}
        onSetTarget={setTargetMobId}
        disabled={state === 'auto_playback' || state === 'room_result'}
      />

      {/* Player resources */}
      <PixelCard>
        <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-1">Your Status</h4>
        <PlayerResourceBars
          players={[{
            playerId: 'self',
            hp: playerState.hp,
            maxHp: playerState.maxHp,
            stamina: playerState.stamina,
            maxStamina: playerState.maxStamina,
            mana: playerState.mana,
            maxMana: playerState.maxMana,
            activeEffects: playerState.activeEffects,
          }]}
        />
      </PixelCard>

      {/* Round logs */}
      {roundLogs.length > 0 && (
        <CombatRoundLog roundLogs={roundLogs} playerId="self" />
      )}
    </div>
  );
}
