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
