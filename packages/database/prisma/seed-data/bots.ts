import { randomUUID, randomBytes } from 'crypto';
import { HP_CONSTANTS } from '@pocketrealm/shared';
import { IDS } from './ids';

// ── Types ────────────────────────────────────────────────────────────────────

type CombatStyle = 'melee' | 'ranged' | 'magic';
type Archetype = 'balanced' | 'tank' | 'glass';

type BotDef = {
  name: string;
  style: CombatStyle;
  archetype: Archetype;
  tier: number;
};

type TierConfig = {
  levelRange: [number, number];
  eloRange: [number, number];
  primaryRange: [number, number];
  skillRange: [number, number];
  rarity: string;
  armorSlots: string[];
};

// ── Tier Configuration ───────────────────────────────────────────────────────

const TIER_CONFIG: Record<number, TierConfig> = {
  0: {
    levelRange: [10, 10],
    eloRange: [600, 850],
    primaryRange: [3, 5],
    skillRange: [3, 5],
    rarity: 'common',
    armorSlots: [],
  },
  1: {
    levelRange: [10, 12],
    eloRange: [800, 1000],
    primaryRange: [5, 10],
    skillRange: [5, 10],
    rarity: 'common',
    armorSlots: ['head', 'chest'],
  },
  2: {
    levelRange: [13, 18],
    eloRange: [950, 1150],
    primaryRange: [10, 15],
    skillRange: [10, 15],
    rarity: 'common',
    armorSlots: ['head', 'chest', 'legs'],
  },
  3: {
    levelRange: [19, 24],
    eloRange: [1100, 1400],
    primaryRange: [15, 25],
    skillRange: [15, 25],
    rarity: 'uncommon',
    armorSlots: ['head', 'chest', 'legs', 'boots', 'gloves'],
  },
  4: {
    levelRange: [25, 34],
    eloRange: [1350, 1700],
    primaryRange: [25, 35],
    skillRange: [25, 35],
    rarity: 'rare',
    armorSlots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'],
  },
  5: {
    levelRange: [35, 50],
    eloRange: [1650, 2100],
    primaryRange: [35, 50],
    skillRange: [35, 50],
    rarity: 'rare',
    armorSlots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'],
  },
};

// Weapon template ID key per style and tier (maps to IDS.wep keys)
const WEAPON_KEYS: Record<CombatStyle, Record<number, keyof typeof IDS.wep>> = {
  melee: {
    0: 'woodenSword',
    1: 'woodenSword',
    2: 'tinSword',
    3: 'ironLongsword',
    4: 'darkIronGreatsword',
    5: 'mithrilBlade',
  },
  ranged: {
    0: 'oakShortbow',
    1: 'oakShortbow',
    2: 'mapleLongbow',
    3: 'willowWarbow',
    4: 'bogwoodLongbow',
    5: 'ancientBow',
  },
  magic: {
    0: 'oakStaff',
    1: 'oakStaff',
    2: 'mapleStaff',
    3: 'elderwoodStaff',
    4: 'crystalStaffWep',
    5: 'lichStaff',
  },
};

// Armor weight class per combat style
const ARMOR_WEIGHT: Record<CombatStyle, string> = {
  melee: 'heavy',
  ranged: 'medium',
  magic: 'light',
};

// Armor tier used per bot tier (T0 has no armor, T1 uses tier-1 armor, etc.)
// For T0, armorSlots is empty so this is unused
const ARMOR_TIER: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

// ── Bot Names (90 total: 15 per tier, 5 per style per tier) ──────────────────

const BOT_NAMES: BotDef[] = [
  // ── Tier 0 ──
  { name: 'Krag Ironjaw', style: 'melee', archetype: 'balanced', tier: 0 },
  { name: 'Brenna Shieldwall', style: 'melee', archetype: 'tank', tier: 0 },
  { name: 'Thoric Hammerfist', style: 'melee', archetype: 'glass', tier: 0 },
  { name: 'Gorn Dullblade', style: 'melee', archetype: 'balanced', tier: 0 },
  { name: 'Helga Rustguard', style: 'melee', archetype: 'tank', tier: 0 },
  { name: 'Sylvana Swiftbow', style: 'ranged', archetype: 'balanced', tier: 0 },
  { name: 'Fenwick Trueshot', style: 'ranged', archetype: 'glass', tier: 0 },
  { name: 'Ashira Windstring', style: 'ranged', archetype: 'balanced', tier: 0 },
  { name: 'Ren Quickarrow', style: 'ranged', archetype: 'tank', tier: 0 },
  { name: 'Mira Pinfeather', style: 'ranged', archetype: 'glass', tier: 0 },
  { name: 'Theron the Wise', style: 'magic', archetype: 'balanced', tier: 0 },
  { name: 'Isolde Frostweave', style: 'magic', archetype: 'tank', tier: 0 },
  { name: 'Malachar Voidborn', style: 'magic', archetype: 'glass', tier: 0 },
  { name: 'Lyra Sparktouch', style: 'magic', archetype: 'balanced', tier: 0 },
  { name: 'Pip Candlewick', style: 'magic', archetype: 'tank', tier: 0 },

  // ── Tier 1 ──
  { name: 'Gareth Stonefist', style: 'melee', archetype: 'balanced', tier: 1 },
  { name: 'Sven Ironsides', style: 'melee', archetype: 'tank', tier: 1 },
  { name: 'Rognar Bloodaxe', style: 'melee', archetype: 'glass', tier: 1 },
  { name: 'Tormund Greyhelm', style: 'melee', archetype: 'balanced', tier: 1 },
  { name: 'Brina Warbraid', style: 'melee', archetype: 'tank', tier: 1 },
  { name: 'Elara Nighteye', style: 'ranged', archetype: 'balanced', tier: 1 },
  { name: 'Quinn Hollowpoint', style: 'ranged', archetype: 'glass', tier: 1 },
  { name: 'Yara Stormshot', style: 'ranged', archetype: 'balanced', tier: 1 },
  { name: 'Aldric Longdraw', style: 'ranged', archetype: 'tank', tier: 1 },
  { name: 'Fenn Whisperwind', style: 'ranged', archetype: 'glass', tier: 1 },
  { name: 'Cecily Moonfire', style: 'magic', archetype: 'balanced', tier: 1 },
  { name: 'Graven Ashweaver', style: 'magic', archetype: 'tank', tier: 1 },
  { name: 'Nyx Flamecaller', style: 'magic', archetype: 'glass', tier: 1 },
  { name: 'Eldrin Mistwalker', style: 'magic', archetype: 'balanced', tier: 1 },
  { name: 'Sera Brightspell', style: 'magic', archetype: 'tank', tier: 1 },

  // ── Tier 2 ──
  { name: 'Draven Warclaw', style: 'melee', archetype: 'balanced', tier: 2 },
  { name: 'Bjorn Shattershield', style: 'melee', archetype: 'tank', tier: 2 },
  { name: 'Vex Razorblade', style: 'melee', archetype: 'glass', tier: 2 },
  { name: 'Hilda Steelgrip', style: 'melee', archetype: 'balanced', tier: 2 },
  { name: 'Korrin Stoneback', style: 'melee', archetype: 'tank', tier: 2 },
  { name: 'Thalia Swiftstrike', style: 'ranged', archetype: 'balanced', tier: 2 },
  { name: 'Dusk Ravenwing', style: 'ranged', archetype: 'glass', tier: 2 },
  { name: 'Iona Silentstring', style: 'ranged', archetype: 'balanced', tier: 2 },
  { name: 'Bram Ironquiver', style: 'ranged', archetype: 'tank', tier: 2 },
  { name: 'Nell Fletchsong', style: 'ranged', archetype: 'glass', tier: 2 },
  { name: 'Varen Stormcrest', style: 'magic', archetype: 'balanced', tier: 2 },
  { name: 'Agatha Emberveil', style: 'magic', archetype: 'tank', tier: 2 },
  { name: 'Kaelen Hexbinder', style: 'magic', archetype: 'glass', tier: 2 },
  { name: 'Rowena Duskchant', style: 'magic', archetype: 'balanced', tier: 2 },
  { name: 'Finch Glowmote', style: 'magic', archetype: 'tank', tier: 2 },

  // ── Tier 3 ──
  { name: 'Ulric Doomhammer', style: 'melee', archetype: 'balanced', tier: 3 },
  { name: 'Ingrid Bulwark', style: 'melee', archetype: 'tank', tier: 3 },
  { name: 'Riven Blacksteel', style: 'melee', archetype: 'glass', tier: 3 },
  { name: 'Magnus Gravecrusher', style: 'melee', archetype: 'balanced', tier: 3 },
  { name: 'Thyra Ironmaiden', style: 'melee', archetype: 'tank', tier: 3 },
  { name: 'Orin Hawkeye', style: 'ranged', archetype: 'balanced', tier: 3 },
  { name: 'Vesper Shadowbolt', style: 'ranged', archetype: 'glass', tier: 3 },
  { name: 'Lark Windpiercer', style: 'ranged', archetype: 'balanced', tier: 3 },
  { name: 'Rowan Steelbow', style: 'ranged', archetype: 'tank', tier: 3 },
  { name: 'Zara Deadeye', style: 'ranged', archetype: 'glass', tier: 3 },
  { name: 'Mordecai Dreadweave', style: 'magic', archetype: 'balanced', tier: 3 },
  { name: 'Elspeth Thornward', style: 'magic', archetype: 'tank', tier: 3 },
  { name: 'Corvus Soulflare', style: 'magic', archetype: 'glass', tier: 3 },
  { name: 'Sabine Runeglow', style: 'magic', archetype: 'balanced', tier: 3 },
  { name: 'Oberon Starfire', style: 'magic', archetype: 'tank', tier: 3 },

  // ── Tier 4 ──
  { name: 'Voss Warbreaker', style: 'melee', archetype: 'balanced', tier: 4 },
  { name: 'Brunhild Aegis', style: 'melee', archetype: 'tank', tier: 4 },
  { name: 'Kael Reaperstrike', style: 'melee', archetype: 'glass', tier: 4 },
  { name: 'Aldhelm Skullcleaver', style: 'melee', archetype: 'balanced', tier: 4 },
  { name: 'Sigrun Titanwall', style: 'melee', archetype: 'tank', tier: 4 },
  { name: 'Artemis Ghostarrow', style: 'ranged', archetype: 'balanced', tier: 4 },
  { name: 'Shade Nightbolt', style: 'ranged', archetype: 'glass', tier: 4 },
  { name: 'Ceridwen Stormflight', style: 'ranged', archetype: 'balanced', tier: 4 },
  { name: 'Garrick Ironmark', style: 'ranged', archetype: 'tank', tier: 4 },
  { name: 'Rune Silvertip', style: 'ranged', archetype: 'glass', tier: 4 },
  { name: 'Zarael Netherbane', style: 'magic', archetype: 'balanced', tier: 4 },
  { name: 'Viridian Wardkeeper', style: 'magic', archetype: 'tank', tier: 4 },
  { name: 'Nocturne Hexflame', style: 'magic', archetype: 'glass', tier: 4 },
  { name: 'Seraphina Fateweave', style: 'magic', archetype: 'balanced', tier: 4 },
  { name: 'Thalric Runebound', style: 'magic', archetype: 'tank', tier: 4 },

  // ── Tier 5 ──
  { name: 'Valkyr Godslayer', style: 'melee', archetype: 'balanced', tier: 5 },
  { name: 'Ormundr the Unbroken', style: 'melee', archetype: 'tank', tier: 5 },
  { name: 'Nihil Deathbringer', style: 'melee', archetype: 'glass', tier: 5 },
  { name: 'Athgar Worldcleaver', style: 'melee', archetype: 'balanced', tier: 5 },
  { name: 'Thorvald Eternguard', style: 'melee', archetype: 'tank', tier: 5 },
  { name: 'Aethon Starshot', style: 'ranged', archetype: 'balanced', tier: 5 },
  { name: 'Eclipse Voidarrow', style: 'ranged', archetype: 'glass', tier: 5 },
  { name: 'Callista Stormrend', style: 'ranged', archetype: 'balanced', tier: 5 },
  { name: 'Torvald Ironaim', style: 'ranged', archetype: 'tank', tier: 5 },
  { name: 'Wren Duskhunter', style: 'ranged', archetype: 'glass', tier: 5 },
  { name: 'Archon Worldender', style: 'magic', archetype: 'balanced', tier: 5 },
  { name: 'Bastion Aegisweave', style: 'magic', archetype: 'tank', tier: 5 },
  { name: 'Xyra Doomcaster', style: 'magic', archetype: 'glass', tier: 5 },
  { name: 'Solara Celestine', style: 'magic', archetype: 'balanced', tier: 5 },
  { name: 'Grimoire Riftkeeper', style: 'magic', archetype: 'tank', tier: 5 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const ALL_SKILL_TYPES = [
  'melee', 'ranged', 'magic', 'mining', 'foraging', 'woodcutting',
  'refining', 'tanning', 'weaving', 'weaponsmithing', 'armorsmithing',
  'leatherworking', 'tailoring', 'alchemy',
] as const;

function buildAttributes(style: CombatStyle, archetype: Archetype, primary: number) {
  let str = 0, dex = 0, int = 0;
  let vitalityMul: number;
  let evasionMul: number;
  let primaryMul: number;

  // Base multipliers per style
  if (style === 'melee') {
    vitalityMul = 0.6;
    evasionMul = 0.2;
  } else if (style === 'ranged') {
    vitalityMul = 0.5;
    evasionMul = 0.3;
  } else {
    vitalityMul = 0.5;
    evasionMul = 0.2;
  }

  // Archetype adjustments
  primaryMul = 1.0;
  if (archetype === 'tank') {
    vitalityMul += 0.3;
    primaryMul = 0.8;
  } else if (archetype === 'glass') {
    vitalityMul -= 0.3;
    primaryMul = 1.2;
  }

  const adjustedPrimary = Math.round(primary * primaryMul);
  const vitality = Math.max(1, Math.round(primary * vitalityMul));
  const evasion = Math.max(0, Math.round(primary * evasionMul));

  if (style === 'melee') str = adjustedPrimary;
  else if (style === 'ranged') dex = adjustedPrimary;
  else int = adjustedPrimary;

  return {
    vitality,
    strength: str,
    dexterity: dex,
    intelligence: int,
    luck: 0,
    evasion,
  };
}

function calculateMaxHp(vitality: number): number {
  return HP_CONSTANTS.BASE_HP + vitality * HP_CONSTANTS.HP_PER_VITALITY;
}

// ── Generation ───────────────────────────────────────────────────────────────

// Bot password: random 64-char hex string. Bots are rejected at the isBot
// guard before password comparison, so this just needs to be non-empty.
const BOT_PASSWORD_HASH = `$bot$${randomBytes(32).toString('hex')}`;

export interface BotSeedData {
  player: {
    id: string;
    username: string;
    email: string;
    passwordHash: string;
    isBot: boolean;
    characterLevel: number;
    attributes: Record<string, number>;
    currentHp: number;
  };
  turnBank: { currentTurns: number };
  skills: Array<{ skillType: string; level: number; xp: bigint }>;
  weaponTemplateId: string;
  armorTemplateIds: Array<{ slot: string; templateId: string }>;
  rarity: string;
  pvpRating: number;
}

export function generateBotPlayers(): BotSeedData[] {
  const passwordHash = BOT_PASSWORD_HASH;
  const bots: BotSeedData[] = [];

  for (const def of BOT_NAMES) {
    const cfg = TIER_CONFIG[def.tier];
    const level = randInt(...cfg.levelRange);
    const primary = randInt(...cfg.primaryRange);
    const combatSkillLevel = randInt(...cfg.skillRange);
    const elo = randInt(...cfg.eloRange);
    const attrs = buildAttributes(def.style, def.archetype, primary);
    const maxHp = calculateMaxHp(attrs.vitality);

    // Weapon template ID
    const weaponKey = WEAPON_KEYS[def.style][def.tier];
    const weaponTemplateId = IDS.wep[weaponKey];

    // Armor template IDs
    const weight = ARMOR_WEIGHT[def.style];
    const armorTier = ARMOR_TIER[def.tier];
    const armorTemplateIds = cfg.armorSlots.map((slot) => {
      const key = `t${armorTier}_${weight}_${slot}` as keyof typeof IDS.arm;
      return { slot, templateId: IDS.arm[key] };
    });

    // Skills: combat skill at tier level, all others at 1
    const skills = ALL_SKILL_TYPES.map((st) => ({
      skillType: st,
      level: st === def.style ? combatSkillLevel : 1,
      xp: BigInt(0),
    }));

    bots.push({
      player: {
        id: randomUUID(),
        username: def.name,
        email: `bot-${randomUUID()}@arena.local`,
        passwordHash,
        isBot: true,
        characterLevel: level,
        attributes: attrs,
        currentHp: maxHp,
      },
      turnBank: { currentTurns: 0 },
      skills,
      weaponTemplateId,
      armorTemplateIds,
      rarity: cfg.rarity,
      pvpRating: elo,
    });
  }

  return bots;
}
