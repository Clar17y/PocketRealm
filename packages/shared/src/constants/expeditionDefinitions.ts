import type { BossTemplateAction } from '../types/bossTemplate.types';
import type { ExpeditionRoomType, ExpeditionShopItem, ExpeditionSetId } from '../types/expedition.types';

// =============================================================================
// ROOM COMPOSITIONS PER TIER
// =============================================================================

export const EXPEDITION_ROOM_COMPOSITIONS: Record<number, { type: ExpeditionRoomType; count: number }[]> = {
  0: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
  1: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 1 },
    { type: 'mini_boss', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
  2: [
    { type: 'trash', count: 3 },
    { type: 'elite', count: 2 },
    { type: 'mini_boss', count: 1 },
    { type: 'event', count: 1 },
    { type: 'final_boss', count: 1 },
  ],
};

// =============================================================================
// MOB ACTION TEMPLATES
// =============================================================================

export const TRASH_MOB_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
];

export const ELITE_MOB_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
];

export const MINI_BOSS_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' },
  { actionId: 'boss_enrage', targetMode: 'single_target' },
  { actionId: 'boss_heal_self', targetMode: 'single_target' },
  { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
  { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true },
];

export const MINI_BOSS_ADD_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_enrage', targetMode: 'single_target' },
];

export const FINAL_BOSS_PHASE1_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_magic_attack', targetMode: 'single_target' },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
  { actionId: 'boss_enrage', targetMode: 'single_target' },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
];

export const FINAL_BOSS_PHASE2_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_magic_attack', targetMode: 'single_target' },
  { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
  { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true },
];

export const FINAL_BOSS_PHASE3_TEMPLATE: readonly BossTemplateAction[] = [
  { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true },
  { actionId: 'boss_enrage', targetMode: 'single_target' },
  { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
];

// =============================================================================
// EXPEDITION SHOP ITEMS
// =============================================================================

const VANGUARD_SET_2PC = '+10% max HP';
const VANGUARD_SET_4PC = 'Counter triggers AoE taunt';
const SHARPSHOOTER_SET_2PC = '+10% crit chance';
const SHARPSHOOTER_SET_4PC = '15% double-hit';
const ARCANIST_SET_2PC = '+15% mana regen';
const ARCANIST_SET_4PC = 'Heal splash 30% to lowest HP';

export const EXPEDITION_SHOP_ITEMS: readonly ExpeditionShopItem[] = [
  // Vanguard set (melee/tank)
  { id: 'vanguard_head',   setId: 'vanguard',    name: 'Vanguard Helm',       slot: 'head',   tokenCost: 80,  stats: { defence: 12, maxHp: 30 },   setBonus2pc: VANGUARD_SET_2PC, setBonus4pc: VANGUARD_SET_4PC },
  { id: 'vanguard_chest',  setId: 'vanguard',    name: 'Vanguard Cuirass',    slot: 'chest',  tokenCost: 120, stats: { defence: 18, maxHp: 50 },   setBonus2pc: VANGUARD_SET_2PC, setBonus4pc: VANGUARD_SET_4PC },
  { id: 'vanguard_gloves', setId: 'vanguard',    name: 'Vanguard Gauntlets',  slot: 'gloves', tokenCost: 60,  stats: { defence: 8, maxHp: 20 },    setBonus2pc: VANGUARD_SET_2PC, setBonus4pc: VANGUARD_SET_4PC },
  { id: 'vanguard_legs',   setId: 'vanguard',    name: 'Vanguard Greaves',    slot: 'legs',   tokenCost: 100, stats: { defence: 14, maxHp: 40 },   setBonus2pc: VANGUARD_SET_2PC, setBonus4pc: VANGUARD_SET_4PC },
  { id: 'vanguard_boots',  setId: 'vanguard',    name: 'Vanguard Sabatons',   slot: 'boots',  tokenCost: 60,  stats: { defence: 8, maxHp: 20 },    setBonus2pc: VANGUARD_SET_2PC, setBonus4pc: VANGUARD_SET_4PC },

  // Sharpshooter set (ranged/DPS)
  { id: 'sharpshooter_head',   setId: 'sharpshooter', name: 'Sharpshooter Hood',      slot: 'head',   tokenCost: 80,  stats: { accuracy: 8, critChance: 3, critDamage: 5 },   setBonus2pc: SHARPSHOOTER_SET_2PC, setBonus4pc: SHARPSHOOTER_SET_4PC },
  { id: 'sharpshooter_chest',  setId: 'sharpshooter', name: 'Sharpshooter Vest',      slot: 'chest',  tokenCost: 120, stats: { accuracy: 12, critChance: 5, critDamage: 8 },  setBonus2pc: SHARPSHOOTER_SET_2PC, setBonus4pc: SHARPSHOOTER_SET_4PC },
  { id: 'sharpshooter_gloves', setId: 'sharpshooter', name: 'Sharpshooter Bracers',   slot: 'gloves', tokenCost: 60,  stats: { accuracy: 5, critChance: 2, critDamage: 3 },   setBonus2pc: SHARPSHOOTER_SET_2PC, setBonus4pc: SHARPSHOOTER_SET_4PC },
  { id: 'sharpshooter_legs',   setId: 'sharpshooter', name: 'Sharpshooter Leggings',  slot: 'legs',   tokenCost: 100, stats: { accuracy: 10, critChance: 4, critDamage: 6 },  setBonus2pc: SHARPSHOOTER_SET_2PC, setBonus4pc: SHARPSHOOTER_SET_4PC },
  { id: 'sharpshooter_boots',  setId: 'sharpshooter', name: 'Sharpshooter Treads',    slot: 'boots',  tokenCost: 60,  stats: { accuracy: 5, critChance: 2, critDamage: 3 },   setBonus2pc: SHARPSHOOTER_SET_2PC, setBonus4pc: SHARPSHOOTER_SET_4PC },

  // Arcanist set (magic/healer)
  { id: 'arcanist_head',   setId: 'arcanist', name: 'Arcanist Circlet',    slot: 'head',   tokenCost: 80,  stats: { magicDefence: 10, attack: 6 },   setBonus2pc: ARCANIST_SET_2PC, setBonus4pc: ARCANIST_SET_4PC },
  { id: 'arcanist_chest',  setId: 'arcanist', name: 'Arcanist Robes',      slot: 'chest',  tokenCost: 120, stats: { magicDefence: 16, attack: 10 },  setBonus2pc: ARCANIST_SET_2PC, setBonus4pc: ARCANIST_SET_4PC },
  { id: 'arcanist_gloves', setId: 'arcanist', name: 'Arcanist Wraps',      slot: 'gloves', tokenCost: 60,  stats: { magicDefence: 6, attack: 4 },    setBonus2pc: ARCANIST_SET_2PC, setBonus4pc: ARCANIST_SET_4PC },
  { id: 'arcanist_legs',   setId: 'arcanist', name: 'Arcanist Trousers',   slot: 'legs',   tokenCost: 100, stats: { magicDefence: 12, attack: 8 },   setBonus2pc: ARCANIST_SET_2PC, setBonus4pc: ARCANIST_SET_4PC },
  { id: 'arcanist_boots',  setId: 'arcanist', name: 'Arcanist Slippers',   slot: 'boots',  tokenCost: 60,  stats: { magicDefence: 6, attack: 4 },    setBonus2pc: ARCANIST_SET_2PC, setBonus4pc: ARCANIST_SET_4PC },
];

// =============================================================================
// SET BONUS HELPER
// =============================================================================

/** Count how many pieces of a given set the player has equipped. */
export function getSetPieceCount(
  equippedItemSetIds: (ExpeditionSetId | null)[],
  setId: ExpeditionSetId,
): number {
  return equippedItemSetIds.filter((id) => id === setId).length;
}
