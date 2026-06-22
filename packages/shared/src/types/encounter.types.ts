// ---------------------------------------------------------------------------
// Encounter mob ID helpers
// ---------------------------------------------------------------------------

const ENCOUNTER_MOB_ID_PREFIX = 'encounter-mob-';
const ENCOUNTER_MOB_ID_RE = /^encounter-mob-(\d+)$/;

/** Build the canonical mob ID for a given slot number. */
export function makeEncounterMobId(slot: number): string {
  return `${ENCOUNTER_MOB_ID_PREFIX}${slot}`;
}

/** Extract the numeric slot from an encounter mob ID like "encounter-mob-3". Returns null if the ID is invalid. */
export function parseEncounterMobSlot(mobId: string): number | null {
  const match = mobId.match(ENCOUNTER_MOB_ID_RE);
  return match ? parseInt(match[1]!, 10) : null;
}

// ---------------------------------------------------------------------------
// Encounter types
// ---------------------------------------------------------------------------

export type EncounterSiteSize = 'small' | 'medium' | 'large';
export type EncounterMobRole = 'trash' | 'elite' | 'mini_boss';
export type LegacyEncounterMobRole = EncounterMobRole | 'boss';
export type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';

export function isEncounterMobRole(value: unknown): value is EncounterMobRole {
  return value === 'trash' || value === 'elite' || value === 'mini_boss';
}

export function normalizeEncounterMobRole(value: unknown): EncounterMobRole | null {
  if (isEncounterMobRole(value)) return value;
  if (value === 'boss') return 'mini_boss';
  return null;
}

/** True if a family-member role maps to a permanent encounter-site role (trash/elite/mini_boss). */
export function isPermanentEncounterFamilyRole(role: string): boolean {
  return normalizeEncounterMobRole(role) !== null;
}

/** True if a family-member role is a mini-boss (or legacy 'boss'). */
export function isMiniBossFamilyRole(role: string): boolean {
  return normalizeEncounterMobRole(role) === 'mini_boss';
}

export interface EncounterMobSlot {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}

export type RoomMode = 'auto' | 'manual';

export interface RoomStrategyEntry {
  room: number;
  mode: RoomMode;
  bonusEligible: boolean;
}

export interface RoomCarryState {
  hp: number;
  stamina: number;
  mana: number;
}
