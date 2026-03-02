import { BOSS_ENCOUNTER_CONSTANTS } from '@adventure/shared';

export interface ThreatEntry {
  playerId: string;
  threat: number;
  tauntRoundsRemaining: number;
}

export function initThreatTable(playerIds: string[]): ThreatEntry[] {
  return playerIds.map(playerId => ({ playerId, threat: 0, tauntRoundsRemaining: 0 }));
}

export function addDamageThreat(table: ThreatEntry[], playerId: string, damage: number): void {
  const entry = table.find(e => e.playerId === playerId);
  if (entry) entry.threat += damage * BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_DAMAGE;
}

export function addHealThreat(table: ThreatEntry[], playerId: string, healAmount: number): void {
  const entry = table.find(e => e.playerId === playerId);
  if (entry) entry.threat += healAmount * BOSS_ENCOUNTER_CONSTANTS.THREAT_PER_HEAL;
}

export function applyTaunt(table: ThreatEntry[], playerId: string, duration: number): void {
  const entry = table.find(e => e.playerId === playerId);
  if (entry) {
    entry.tauntRoundsRemaining = duration;
    entry.threat += BOSS_ENCOUNTER_CONSTANTS.TAUNT_THREAT_BONUS;
  }
}

export function getSingleTarget(table: ThreatEntry[], alivePlayerIds: Set<string>): string | null {
  const alive = table.filter(e => alivePlayerIds.has(e.playerId));
  if (alive.length === 0) return null;

  const taunters = alive.filter(e => e.tauntRoundsRemaining > 0);
  if (taunters.length > 0) {
    return taunters.sort((a, b) => b.threat - a.threat)[0].playerId;
  }

  return alive.sort((a, b) => b.threat - a.threat)[0].playerId;
}

export function tickTaunts(table: ThreatEntry[]): void {
  for (const entry of table) {
    if (entry.tauntRoundsRemaining > 0) entry.tauntRoundsRemaining--;
  }
}
