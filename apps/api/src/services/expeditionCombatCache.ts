import { redis } from '../redis';
import type { EquipmentStats } from './equipmentService';
import type { AttackSkill } from './combatStatsService';
import type { PerActionScaling, CombatTemplateSlotData, CombatPotion, PlayerAttributes } from '@pocketrealm/shared';
import type { PlayerGuildModifiers } from './guildUpgradeService';

export interface ExpeditionCombatSnapshot {
  equipmentStats: EquipmentStats;
  attackSkill: AttackSkill;
  attackLevel: number;
  progression: { attributes: PlayerAttributes };
  guildMods: Pick<PlayerGuildModifiers, 'combatDamage' | 'defenseBoost'>;
  perActionScaling: PerActionScaling;
  playerTemplate: CombatTemplateSlotData[];
  unlockedActions: string[];
  potionPool: CombatPotion[];
  maxHp: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  maxMana: number;
  manaRegenPerRound: number;
}

/** TTL matches expedition timeout (2h) — snapshots self-expire if expedition abandoned. */
export const SNAPSHOT_TTL = 7200;

function key(expeditionId: string, roomIndex: number, playerId: string): string {
  return `expedition:${expeditionId}:room:${roomIndex}:player:${playerId}:combat`;
}

export async function snapshotCombatData(
  expeditionId: string,
  roomIndex: number,
  playerId: string,
  snapshot: ExpeditionCombatSnapshot,
): Promise<void> {
  try {
    await redis.set(key(expeditionId, roomIndex, playerId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL);
  } catch {
    // Best-effort — fallback is DB re-fetch in buildRaidParticipant
  }
}

export async function getCombatSnapshot(
  expeditionId: string,
  roomIndex: number,
  playerId: string,
): Promise<ExpeditionCombatSnapshot | null> {
  try {
    const raw = await redis.get(key(expeditionId, roomIndex, playerId));
    return raw ? (JSON.parse(raw) as ExpeditionCombatSnapshot) : null;
  } catch {
    return null;
  }
}

// Note: redis.keys is O(N) but acceptable here — max 5-10 keys per room (guild size cap).
export async function clearRoomSnapshots(expeditionId: string, roomIndex: number): Promise<void> {
  try {
    const pattern = `expedition:${expeditionId}:room:${roomIndex}:player:*:combat`;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Best-effort cleanup
  }
}
