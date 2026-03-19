export type EncounterSiteSize = 'small' | 'medium' | 'large';
export type EncounterMobRole = 'trash' | 'elite' | 'boss';
export type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';

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
