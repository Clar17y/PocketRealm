import type { BossTemplateAction } from '../types/bossTemplate.types';
import type { CombatantStats } from '../types/combat.types';
import type { ExpeditionRoomType, ExpeditionShopItem, ExpeditionSetId, ExpeditionTheme, ExpeditionThemeMob } from '../types/expedition.types';

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
// EXPEDITION THEMES
// =============================================================================

function mobStats(
  hp: number, atk: number, def: number, mdef: number, dodge: number,
  dmin: number, dmax: number, damageType: 'physical' | 'magic',
): CombatantStats {
  return {
    hp, maxHp: hp, attack: atk, accuracy: atk, defence: def,
    magicDefence: mdef, dodge, evasion: 0, damageMin: dmin, damageMax: dmax,
    speed: 0, damageType,
  };
}

// --- Shared add mob definitions (referenced by regularAdd and miniBossAdds) ---

const SPIDER_NEST_ADD: ExpeditionThemeMob = {
  key: 'expSpiderling', name: 'Spiderling', hp: 100,
  stats: mobStats(100, 14, 8, 4, 4, 6, 10, 'physical'),
  actionTemplate: [
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  ] as BossTemplateAction[],
};

const WOLF_PACK_ADD: ExpeditionThemeMob = {
  key: 'expFrenziedWolf', name: 'Frenzied Wolf', hp: 100,
  stats: mobStats(100, 16, 10, 4, 6, 8, 14, 'physical'),
  actionTemplate: [
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  ] as BossTemplateAction[],
};

const BANDIT_CAMP_ADD: ExpeditionThemeMob = {
  key: 'expBanditGrunt', name: 'Bandit Grunt', hp: 90,
  stats: mobStats(90, 14, 10, 6, 4, 8, 12, 'physical'),
  actionTemplate: [
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
  ] as BossTemplateAction[],
};

const CORRUPTED_GROVE_ADD: ExpeditionThemeMob = {
  key: 'expThornVine', name: 'Thorn Vine', hp: 80,
  stats: mobStats(80, 14, 10, 6, 2, 6, 10, 'physical'),
  actionTemplate: [
    { actionId: 'boss_physical_attack', targetMode: 'single_target' },
    { actionId: 'boss_root', targetMode: 'single_target' },
  ] as BossTemplateAction[],
};

export const EXPEDITION_THEMES: readonly ExpeditionTheme[] = [
  // ─── Theme 1: Spider Nest ─────────────────────────────────────────────
  {
    id: 'spider_nest',
    name: 'Spider Nest',
    tier: 1,
    mobFamilyKeys: ['spiders'],
    trash: [
      {
        key: 'expCavernSpider', name: 'Cavern Spider', hp: 150,
        stats: mobStats(150, 16, 12, 8, 6, 8, 14, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_poison_spray', targetMode: 'aoe' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expWebweaver', name: 'Webweaver', hp: 120,
        stats: mobStats(120, 14, 10, 6, 8, 6, 12, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_root', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    elites: [
      {
        key: 'expBroodguard', name: 'Broodguard', hp: 350,
        stats: mobStats(350, 20, 16, 12, 6, 12, 20, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_poison_spray', targetMode: 'aoe' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_root', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expSilkStalker', name: 'Silk Stalker', hp: 280,
        stats: mobStats(280, 22, 14, 10, 10, 14, 22, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_impale', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_fear_howl', targetMode: 'aoe' },
        ] as BossTemplateAction[],
      },
    ],
    miniBoss: {
      key: 'expSpiderMatriarch', name: 'Spider Matriarch', hp: 650,
      stats: mobStats(650, 22, 18, 14, 8, 16, 26, 'physical'),
      actionTemplate: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_poison_spray', targetMode: 'aoe' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_frenzy', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    miniBossAdds: [SPIDER_NEST_ADD],
    regularAdd: SPIDER_NEST_ADD,
    casterAdd: {
      key: 'expVenomousSpitter', name: 'Venomous Spitter', hp: 70,
      stats: mobStats(70, 12, 6, 10, 6, 4, 8, 'magic'),
      actionTemplate: [
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_venom_cloud', targetMode: 'aoe' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    finalBoss: {
      mob: {
        key: 'expBroodqueen', name: 'The Broodqueen', hp: 1300,
        stats: mobStats(1300, 28, 22, 16, 8, 20, 35, 'physical'),
        actionTemplate: [],
      },
      phase1: [
        { actionId: 'boss_poison_spray', targetMode: 'aoe' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_wither', targetMode: 'aoe' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase2: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_mark_for_death', targetMode: 'single_target' },
        { actionId: 'boss_impale', targetMode: 'single_target' },
        { actionId: 'boss_poison_spray', targetMode: 'aoe' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_cocoon_burst', targetMode: 'aoe', isTelegraphed: true },
      ] as BossTemplateAction[],
      phase3: [
        { actionId: 'boss_frenzy', targetMode: 'single_target' },
        { actionId: 'boss_impale', targetMode: 'single_target' },
        { actionId: 'boss_poison_spray', targetMode: 'aoe' },
        { actionId: 'boss_death_bloom', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_impale', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
  },

  // ─── Theme 2: Wolf Pack ───────────────────────────────────────────────
  {
    id: 'wolf_pack',
    name: 'Wolf Pack',
    tier: 1,
    mobFamilyKeys: ['wolves'],
    trash: [
      {
        key: 'expTimberWolf', name: 'Timber Wolf', hp: 160,
        stats: mobStats(160, 18, 14, 6, 8, 10, 16, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expSnarler', name: 'Snarler', hp: 130,
        stats: mobStats(130, 16, 12, 8, 6, 8, 14, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_smoke_bomb', targetMode: 'aoe' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    elites: [
      {
        key: 'expDireWolfExp', name: 'Dire Wolf', hp: 380,
        stats: mobStats(380, 22, 18, 8, 8, 14, 24, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_rally', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
        ] as BossTemplateAction[],
      },
      {
        key: 'expShadowWolf', name: 'Shadow Wolf', hp: 300,
        stats: mobStats(300, 20, 14, 16, 12, 12, 20, 'magic'),
        actionTemplate: [
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_fear_howl', targetMode: 'aoe' },
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    miniBoss: {
      key: 'expPackAlphaExp', name: 'Pack Alpha', hp: 680,
      stats: mobStats(680, 24, 20, 10, 8, 18, 28, 'physical'),
      actionTemplate: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_rally', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_impale', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    miniBossAdds: [WOLF_PACK_ADD],
    regularAdd: WOLF_PACK_ADD,
    casterAdd: {
      key: 'expHowlingSpirit', name: 'Howling Spirit', hp: 65,
      stats: mobStats(65, 14, 6, 12, 8, 4, 8, 'magic'),
      actionTemplate: [
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_shadow_bleed', targetMode: 'aoe' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    finalBoss: {
      mob: {
        key: 'expFenris', name: 'Fenris, the Ancient', hp: 1400,
        stats: mobStats(1400, 30, 24, 12, 8, 22, 38, 'physical'),
        actionTemplate: [],
      },
      phase1: [
        { actionId: 'boss_rally', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase2: [
        { actionId: 'boss_mark_for_death', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_fear_howl', targetMode: 'aoe' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase3: [
        { actionId: 'boss_frenzy', targetMode: 'single_target' },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_fear_howl', targetMode: 'aoe' },
        { actionId: 'boss_terrifying_howl', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
  },

  // ─── Theme 3: Bandit Camp ─────────────────────────────────────────────
  {
    id: 'bandit_camp',
    name: 'Bandit Camp',
    tier: 1,
    mobFamilyKeys: ['bandits'],
    trash: [
      {
        key: 'expBanditThug', name: 'Bandit Thug', hp: 170,
        stats: mobStats(170, 18, 14, 8, 6, 10, 16, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_root', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expBanditArcherExp', name: 'Bandit Archer', hp: 130,
        stats: mobStats(130, 20, 10, 6, 8, 12, 18, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    elites: [
      {
        key: 'expBanditAssassin', name: 'Bandit Assassin', hp: 320,
        stats: mobStats(320, 24, 16, 10, 12, 16, 26, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_impale', targetMode: 'single_target' },
          { actionId: 'boss_smoke_bomb', targetMode: 'aoe' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expBanditShaman', name: 'Bandit Shaman', hp: 280,
        stats: mobStats(280, 18, 12, 18, 8, 10, 18, 'magic'),
        actionTemplate: [
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_weaken', targetMode: 'aoe' },
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_regenerate', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    miniBoss: {
      key: 'expWarChief', name: 'War Chief', hp: 640,
      stats: mobStats(640, 24, 20, 12, 6, 18, 30, 'physical'),
      actionTemplate: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_rally', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_impale', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_shield_wall', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    miniBossAdds: [BANDIT_CAMP_ADD],
    regularAdd: BANDIT_CAMP_ADD,
    casterAdd: {
      key: 'expKnifeThrower', name: 'Knife Thrower', hp: 70,
      stats: mobStats(70, 18, 8, 6, 8, 6, 10, 'physical'),
      actionTemplate: [
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_throwing_knives', targetMode: 'aoe' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    finalBoss: {
      mob: {
        key: 'expBanditKing', name: 'The Bandit King', hp: 1300,
        stats: mobStats(1300, 28, 22, 14, 8, 20, 36, 'physical'),
        actionTemplate: [],
      },
      phase1: [
        { actionId: 'boss_rally', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_smoke_bomb', targetMode: 'aoe' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase2: [
        { actionId: 'boss_mark_for_death', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_shield_wall', targetMode: 'single_target' },
        { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
      ] as BossTemplateAction[],
      phase3: [
        { actionId: 'boss_frenzy', targetMode: 'single_target' },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_desperate_fury', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_execution_strike', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
  },

  // ─── Theme 4: Corrupted Grove ─────────────────────────────────────────
  {
    id: 'corrupted_grove',
    name: 'Corrupted Grove',
    tier: 1,
    mobFamilyKeys: ['treants'],
    trash: [
      {
        key: 'expBlightedSapling', name: 'Blighted Sapling', hp: 140,
        stats: mobStats(140, 16, 14, 10, 4, 8, 14, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expFungalSpore', name: 'Fungal Spore', hp: 100,
        stats: mobStats(100, 14, 8, 14, 6, 6, 12, 'magic'),
        actionTemplate: [
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_poison_spray', targetMode: 'aoe' },
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    elites: [
      {
        key: 'expCorruptedTreant', name: 'Corrupted Treant', hp: 400,
        stats: mobStats(400, 20, 24, 16, 2, 14, 22, 'physical'),
        actionTemplate: [
          { actionId: 'boss_physical_attack', targetMode: 'single_target' },
          { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
          { actionId: 'boss_bark_shield', targetMode: 'single_target' },
          { actionId: 'boss_regenerate', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
      {
        key: 'expBlightedDryad', name: 'Blighted Dryad', hp: 300,
        stats: mobStats(300, 18, 14, 20, 8, 12, 20, 'magic'),
        actionTemplate: [
          { actionId: 'boss_magic_attack', targetMode: 'single_target' },
          { actionId: 'boss_wither', targetMode: 'aoe' },
          { actionId: 'boss_nature_curse', targetMode: 'single_target' },
          { actionId: 'boss_regenerate', targetMode: 'single_target' },
        ] as BossTemplateAction[],
      },
    ],
    miniBoss: {
      key: 'expGroveWarden', name: 'Grove Warden', hp: 700,
      stats: mobStats(700, 22, 22, 16, 4, 18, 28, 'physical'),
      actionTemplate: [
        { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
        { actionId: 'boss_root', targetMode: 'single_target' },
        { actionId: 'boss_regenerate', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_physical_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    miniBossAdds: [CORRUPTED_GROVE_ADD],
    regularAdd: CORRUPTED_GROVE_ADD,
    casterAdd: {
      key: 'expBlightedSpore', name: 'Blighted Spore', hp: 60,
      stats: mobStats(60, 12, 6, 12, 4, 4, 8, 'magic'),
      actionTemplate: [
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_blight_cloud', targetMode: 'aoe' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
    finalBoss: {
      mob: {
        key: 'expRotHeart', name: 'The Rot Heart', hp: 1400,
        stats: mobStats(1400, 26, 20, 22, 4, 18, 32, 'magic'),
        actionTemplate: [],
      },
      phase1: [
        { actionId: 'boss_wither', targetMode: 'aoe' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_nature_curse', targetMode: 'single_target' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_regenerate', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase2: [
        { actionId: 'boss_blight_wave', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_nature_curse', targetMode: 'single_target' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_summon_adds', targetMode: 'single_target' },
        { actionId: 'boss_regenerate', targetMode: 'single_target' },
      ] as BossTemplateAction[],
      phase3: [
        { actionId: 'boss_frenzy', targetMode: 'single_target' },
        { actionId: 'boss_magic_attack', targetMode: 'single_target' },
        { actionId: 'boss_blight_wave', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_death_bloom', targetMode: 'aoe', isTelegraphed: true },
        { actionId: 'boss_regenerate', targetMode: 'single_target' },
        { actionId: 'boss_nature_curse', targetMode: 'single_target' },
      ] as BossTemplateAction[],
    },
  },
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
