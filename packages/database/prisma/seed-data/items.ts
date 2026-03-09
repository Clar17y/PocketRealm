import { IDS } from './ids';
import { POTION_CONSTANTS } from '@pocketrealm/shared';

type ConsumableEffectJson = { type: 'heal_flat' | 'heal_percent' | 'restore_stamina' | 'restore_mana'; value: number };

type ItemRow = {
  id: string;
  name: string;
  itemType: string;
  slot?: string;
  tier: number;
  weightClass?: string;
  baseStats?: Record<string, number>;
  requiredSkill?: string;
  requiredLevel?: number;
  maxDurability?: number;
  stackable?: boolean;
  consumableEffect?: ConsumableEffectJson;
  sellPrice?: number;
};

// Helper: build item template row with defaults
function it(row: ItemRow) {
  return {
    id: row.id,
    name: row.name,
    itemType: row.itemType,
    slot: row.slot ?? null,
    tier: row.tier,
    weightClass: row.weightClass ?? null,
    baseStats: row.baseStats ?? {},
    requiredSkill: row.requiredSkill ?? null,
    requiredLevel: row.requiredLevel ?? 1,
    maxDurability: row.maxDurability ?? 100,
    stackable: row.stackable ?? false,
    consumableEffect: row.consumableEffect ?? null,
    sellPrice: row.sellPrice ?? null,
  };
}

function resource(id: string, name: string, tier: number) {
  return it({ id, name, itemType: 'resource', tier, stackable: true, maxDurability: 0, sellPrice: tier * 1 });
}

function consumable(id: string, name: string, tier: number, effect?: ConsumableEffectJson) {
  return it({ id, name, itemType: 'consumable', tier, stackable: true, maxDurability: 0, consumableEffect: effect, sellPrice: tier * 2 });
}

// ── Raw Resources ────────────────────────────────────────────────────────────

const rawResources = [
  // Ores
  resource(IDS.res.copperOre, 'Copper Ore', 1),
  resource(IDS.res.tinOre, 'Tin Ore', 2),
  resource(IDS.res.ironOre, 'Iron Ore', 3),
  resource(IDS.res.sandstone, 'Sandstone', 3),
  resource(IDS.res.darkIronOre, 'Dark Iron Ore', 4),
  resource(IDS.res.mithrilOre, 'Mithril Ore', 4),
  resource(IDS.res.ancientOre, 'Ancient Ore', 5),
  // Logs
  resource(IDS.res.oakLog, 'Oak Log', 1),
  resource(IDS.res.mapleLog, 'Maple Log', 2),
  resource(IDS.res.fungalWood, 'Fungal Wood', 2),
  resource(IDS.res.elderwoodLog, 'Elderwood Log', 3),
  resource(IDS.res.willowLog, 'Willow Log', 3),
  resource(IDS.res.bogwoodLog, 'Bogwood Log', 4),
  resource(IDS.res.crystalWood, 'Crystal Wood', 4),
  resource(IDS.res.petrifiedWood, 'Petrified Wood', 5),
  // Herbs
  resource(IDS.res.forestSage, 'Forest Sage', 1),
  resource(IDS.res.moonpetal, 'Moonpetal', 2),
  resource(IDS.res.caveMoss, 'Cave Moss', 2),
  resource(IDS.res.starbloom, 'Starbloom', 3),
  resource(IDS.res.glowcapMushroom, 'Glowcap Mushroom', 3),
  resource(IDS.res.windbloom, 'Windbloom', 3),
  resource(IDS.res.gravemoss, 'Gravemoss', 4),
  resource(IDS.res.shimmerFern, 'Shimmer Fern', 4),
  resource(IDS.res.abyssalKelp, 'Abyssal Kelp', 5),
];

// ── Raw Gems (gathering crit drops) ──────────────────────────────────────────

const rawGems = [
  // Mining gems (T1-T5)
  resource(IDS.gems.roughRuby, 'Rough Ruby', 1),
  resource(IDS.gems.roughSapphire, 'Rough Sapphire', 2),
  resource(IDS.gems.roughEmerald, 'Rough Emerald', 3),
  resource(IDS.gems.roughDiamond, 'Rough Diamond', 4),
  resource(IDS.gems.roughOpal, 'Rough Opal', 5),
  // Foraging gems (T1-T5)
  resource(IDS.gems.rawAmber, 'Raw Amber', 1),
  resource(IDS.gems.rawPearl, 'Raw Pearl', 2),
  resource(IDS.gems.rawJade, 'Raw Jade', 3),
  resource(IDS.gems.rawMoonstone, 'Raw Moonstone', 4),
  resource(IDS.gems.rawStarcrystal, 'Raw Starcrystal', 5),
  // Woodcutting gems (T1-T5)
  resource(IDS.gems.treeResin, 'Tree Resin', 1),
  resource(IDS.gems.fossilizedSap, 'Fossilized Sap', 2),
  resource(IDS.gems.crystalBark, 'Crystal Bark', 3),
  resource(IDS.gems.heartwoodGem, 'Heartwood Gem', 4),
  resource(IDS.gems.ancientAmber, 'Ancient Amber', 5),
];

// ── Cut Gems (refined from raw gems) ────────────────────────────────────────

const cutGems = [
  // Mining
  resource(IDS.gems.cutRuby, 'Cut Ruby', 1),
  resource(IDS.gems.cutSapphire, 'Cut Sapphire', 2),
  resource(IDS.gems.cutEmerald, 'Cut Emerald', 3),
  resource(IDS.gems.cutDiamond, 'Cut Diamond', 4),
  resource(IDS.gems.cutOpal, 'Cut Opal', 5),
  // Foraging
  resource(IDS.gems.cutAmber, 'Cut Amber', 1),
  resource(IDS.gems.cutPearl, 'Cut Pearl', 2),
  resource(IDS.gems.cutJade, 'Cut Jade', 3),
  resource(IDS.gems.cutMoonstone, 'Cut Moonstone', 4),
  resource(IDS.gems.cutStarcrystal, 'Cut Starcrystal', 5),
  // Woodcutting
  resource(IDS.gems.cutResin, 'Cut Resin', 1),
  resource(IDS.gems.cutSap, 'Cut Sap', 2),
  resource(IDS.gems.cutBark, 'Cut Bark', 3),
  resource(IDS.gems.cutHeartwood, 'Cut Heartwood', 4),
  resource(IDS.gems.cutAncientAmber, 'Cut Ancient Amber', 5),
];

// ── Jewellery Equipment ─────────────────────────────────────────────────────

const jewellery = [
  // Tier 1
  it({ id: IDS.jewel.copperRing, name: 'Copper Ring', itemType: 'armor', slot: 'ring', tier: 1, requiredLevel: 1, baseStats: { luck: 2, critChance: 0.01 }, maxDurability: 60, sellPrice: 1 * 12 }),
  it({ id: IDS.jewel.copperPendant, name: 'Copper Pendant', itemType: 'armor', slot: 'neck', tier: 1, requiredLevel: 1, baseStats: { health: 3, luck: 1 }, maxDurability: 60, sellPrice: 1 * 12 }),
  it({ id: IDS.jewel.copperCharm, name: 'Copper Charm', itemType: 'armor', slot: 'charm', tier: 1, requiredLevel: 1, baseStats: { luck: 2, dodge: 1 }, maxDurability: 60, sellPrice: 1 * 12 }),
  // Tier 2
  it({ id: IDS.jewel.ironBand, name: 'Iron Band', itemType: 'armor', slot: 'ring', tier: 2, requiredLevel: 5, baseStats: { luck: 3, accuracy: 2, critChance: 0.01 }, maxDurability: 80, sellPrice: 2 * 12 }),
  it({ id: IDS.jewel.ironChain, name: 'Iron Chain', itemType: 'armor', slot: 'neck', tier: 2, requiredLevel: 5, baseStats: { health: 5, luck: 2 }, maxDurability: 80, sellPrice: 2 * 12 }),
  it({ id: IDS.jewel.ironTalisman, name: 'Iron Talisman', itemType: 'armor', slot: 'charm', tier: 2, requiredLevel: 5, baseStats: { luck: 3, dodge: 2 }, maxDurability: 80, sellPrice: 2 * 12 }),
  // Tier 3
  it({ id: IDS.jewel.darkIronRing, name: 'Dark Iron Ring', itemType: 'armor', slot: 'ring', tier: 3, requiredLevel: 12, baseStats: { luck: 4, accuracy: 3, critChance: 0.02 }, maxDurability: 100, sellPrice: 3 * 12 }),
  it({ id: IDS.jewel.darkIronAmulet, name: 'Dark Iron Amulet', itemType: 'armor', slot: 'neck', tier: 3, requiredLevel: 12, baseStats: { health: 8, luck: 3, accuracy: 1 }, maxDurability: 100, sellPrice: 3 * 12 }),
  it({ id: IDS.jewel.darkIronCharm, name: 'Dark Iron Charm', itemType: 'armor', slot: 'charm', tier: 3, requiredLevel: 12, baseStats: { luck: 4, dodge: 3, critChance: 0.01 }, maxDurability: 100, sellPrice: 3 * 12 }),
  // Tier 4
  it({ id: IDS.jewel.mithrilRing, name: 'Mithril Ring', itemType: 'armor', slot: 'ring', tier: 4, requiredLevel: 20, baseStats: { luck: 5, accuracy: 4, critChance: 0.03, critDamage: 0.05 }, maxDurability: 120, sellPrice: 4 * 12 }),
  it({ id: IDS.jewel.mithrilNecklace, name: 'Mithril Necklace', itemType: 'armor', slot: 'neck', tier: 4, requiredLevel: 20, baseStats: { health: 12, luck: 4, accuracy: 2 }, maxDurability: 120, sellPrice: 4 * 12 }),
  it({ id: IDS.jewel.mithrilTalisman, name: 'Mithril Talisman', itemType: 'armor', slot: 'charm', tier: 4, requiredLevel: 20, baseStats: { luck: 5, dodge: 4, critChance: 0.02, critDamage: 0.05 }, maxDurability: 120, sellPrice: 4 * 12 }),
  // Tier 5
  it({ id: IDS.jewel.ancientRing, name: 'Ancient Ring', itemType: 'armor', slot: 'ring', tier: 5, requiredLevel: 28, baseStats: { luck: 7, accuracy: 5, critChance: 0.04, critDamage: 0.1 }, maxDurability: 150, sellPrice: 5 * 12 }),
  it({ id: IDS.jewel.ancientAmulet, name: 'Ancient Amulet', itemType: 'armor', slot: 'neck', tier: 5, requiredLevel: 28, baseStats: { health: 16, luck: 5, accuracy: 3 }, maxDurability: 150, sellPrice: 5 * 12 }),
  it({ id: IDS.jewel.ancientCharm, name: 'Ancient Charm', itemType: 'armor', slot: 'charm', tier: 5, requiredLevel: 28, baseStats: { luck: 7, dodge: 5, critChance: 0.03, critDamage: 0.1 }, maxDurability: 150, sellPrice: 5 * 12 }),
];

// ── Processed Materials ──────────────────────────────────────────────────────

const processedMaterials = [
  // Ingots
  resource(IDS.proc.copperIngot, 'Copper Ingot', 1),
  resource(IDS.proc.tinIngot, 'Tin Ingot', 2),
  resource(IDS.proc.ironIngot, 'Iron Ingot', 3),
  resource(IDS.proc.cutStone, 'Cut Stone', 3),
  resource(IDS.proc.darkIronIngot, 'Dark Iron Ingot', 4),
  resource(IDS.proc.mithrilIngot, 'Mithril Ingot', 4),
  resource(IDS.proc.ancientIngot, 'Ancient Ingot', 5),
  // Planks
  resource(IDS.proc.oakPlank, 'Oak Plank', 1),
  resource(IDS.proc.maplePlank, 'Maple Plank', 2),
  resource(IDS.proc.fungalPlank, 'Fungal Plank', 2),
  resource(IDS.proc.elderwoodPlank, 'Elderwood Plank', 3),
  resource(IDS.proc.willowPlank, 'Willow Plank', 3),
  resource(IDS.proc.bogwoodPlank, 'Bogwood Plank', 4),
  resource(IDS.proc.crystalPlank, 'Crystal Plank', 4),
  resource(IDS.proc.petrifiedPlank, 'Petrified Plank', 5),
];

// ── Mob Drop Materials ───────────────────────────────────────────────────────

const mobDropMaterials = [
  // Tier 1
  resource(IDS.drop.ratPelt, 'Rat Pelt', 1),
  resource(IDS.drop.boarHide, 'Boar Hide', 1),
  resource(IDS.drop.spiderSilk, 'Spider Silk', 1),
  resource(IDS.drop.ratTail, 'Rat Tail', 1),
  resource(IDS.drop.boarTusk, 'Boar Tusk', 1),
  // Tier 2
  resource(IDS.drop.wolfPelt, 'Wolf Pelt', 2),
  resource(IDS.drop.banditCloth, 'Bandit Cloth', 2),
  resource(IDS.drop.wolfFang, 'Wolf Fang', 2),
  resource(IDS.drop.ancientBark, 'Ancient Bark', 2),
  resource(IDS.drop.batWing, 'Bat Wing', 2),
  resource(IDS.drop.goblinRag, 'Goblin Rag', 2),
  resource(IDS.drop.batFang, 'Bat Fang', 2),
  resource(IDS.drop.stolenCoin, 'Stolen Coin', 2),
  resource(IDS.drop.crudeGemstone, 'Crude Gemstone', 2),
  // Tier 3
  resource(IDS.drop.faeSilk, 'Fae Silk', 3),
  resource(IDS.drop.dryadThread, 'Dryad Thread', 3),
  resource(IDS.drop.spriteDust, 'Sprite Dust', 3),
  resource(IDS.drop.pixieWing, 'Pixie Wing', 3),
  resource(IDS.drop.crawlerChitin, 'Crawler Chitin', 3),
  resource(IDS.drop.roughGem, 'Rough Gem', 3),
  resource(IDS.drop.stolenOre, 'Stolen Ore', 3),
  resource(IDS.drop.crystalShard, 'Crystal Shard', 3),
  resource(IDS.drop.wargHide, 'Warg Hide', 3),
  resource(IDS.drop.harpyFeather, 'Harpy Feather', 3),
  resource(IDS.drop.harpyTalon, 'Harpy Talon', 3),
  // Tier 4
  resource(IDS.drop.crocHide, 'Croc Hide', 4),
  resource(IDS.drop.hydraScale, 'Hydra Scale', 4),
  resource(IDS.drop.witchCloth, 'Witch Cloth', 4),
  resource(IDS.drop.wraithEssence, 'Wraith Essence', 4),
  resource(IDS.drop.boneFragment, 'Bone Fragment', 4),
  resource(IDS.drop.bogHeart, 'Bog Heart', 4),
  resource(IDS.drop.cutGem, 'Cut Gem', 4),
  resource(IDS.drop.goblinGold, 'Goblin Gold', 4),
  resource(IDS.drop.darkCrystal, 'Dark Crystal', 4),
  // Tier 5
  resource(IDS.drop.nagaScale, 'Naga Scale', 5),
  resource(IDS.drop.spectralSilk, 'Spectral Silk', 5),
  resource(IDS.drop.oozeResidue, 'Ooze Residue', 5),
  resource(IDS.drop.eldritchFragment, 'Eldritch Fragment', 5),
  resource(IDS.drop.lichDust, 'Lich Dust', 5),
  resource(IDS.drop.nagaPearl, 'Naga Pearl', 5),
  resource(IDS.drop.ancientRelic, 'Ancient Relic', 5),
];

// ── Processed Leather/Cloth ──────────────────────────────────────────────────

const processedLeather = [
  resource(IDS.leather.ratLeather, 'Rat Leather', 1),
  resource(IDS.leather.boarLeather, 'Boar Leather', 1),
  resource(IDS.leather.silkCloth, 'Silk Cloth', 1),
  resource(IDS.leather.wolfLeather, 'Wolf Leather', 2),
  resource(IDS.leather.batLeather, 'Bat Leather', 2),
  resource(IDS.leather.wovenCloth, 'Woven Cloth', 2),
  resource(IDS.leather.wargLeather, 'Warg Leather', 3),
  resource(IDS.leather.chitinPlate, 'Chitin Plate', 3),
  resource(IDS.leather.faeFabric, 'Fae Fabric', 3),
  resource(IDS.leather.crocLeather, 'Croc Leather', 4),
  resource(IDS.leather.scaleMail, 'Scale Mail', 4),
  resource(IDS.leather.cursedFabric, 'Cursed Fabric', 4),
  resource(IDS.leather.etherealCloth, 'Ethereal Cloth', 4),
  resource(IDS.leather.nagaLeather, 'Naga Leather', 5),
  resource(IDS.leather.spectralFabric, 'Spectral Fabric', 5),
];

// ── Consumables ──────────────────────────────────────────────────────────────

const consumables = [
  consumable(IDS.pots.minorHealthPotion, 'Minor Health Potion', 1, { type: 'heal_flat', value: POTION_CONSTANTS.MINOR_HEALTH_HEAL }),
  consumable(IDS.pots.healthPotion, 'Health Potion', 2, { type: 'heal_flat', value: POTION_CONSTANTS.HEALTH_HEAL }),
  consumable(IDS.pots.antivenomPotion, 'Antivenom Potion', 2),
  consumable(IDS.pots.greaterHealthPotion, 'Greater Health Potion', 3, { type: 'heal_flat', value: POTION_CONSTANTS.GREATER_HEALTH_HEAL }),
  consumable(IDS.pots.resistPotion, 'Resist Potion', 4),
  consumable(IDS.pots.manaPotion, 'Mana Potion', 4, { type: 'restore_mana', value: POTION_CONSTANTS.MANA_RESTORE }),
  consumable(IDS.pots.elixirOfPower, 'Elixir of Power', 5),
  // Stamina potions
  consumable(IDS.pots.minorStaminaPotion, 'Minor Stamina Potion', 1, { type: 'restore_stamina', value: POTION_CONSTANTS.MINOR_STAMINA_RESTORE }),
  consumable(IDS.pots.staminaPotion, 'Stamina Potion', 2, { type: 'restore_stamina', value: POTION_CONSTANTS.STAMINA_RESTORE }),
  consumable(IDS.pots.greaterStaminaPotion, 'Greater Stamina Potion', 3, { type: 'restore_stamina', value: POTION_CONSTANTS.GREATER_STAMINA_RESTORE }),
  // Mana potions
  consumable(IDS.pots.minorManaPotion, 'Minor Mana Potion', 1, { type: 'restore_mana', value: POTION_CONSTANTS.MINOR_MANA_RESTORE }),
  consumable(IDS.pots.greaterManaPotion, 'Greater Mana Potion', 5, { type: 'restore_mana', value: POTION_CONSTANTS.GREATER_MANA_RESTORE }),
];

// ── Weapons ──────────────────────────────────────────────────────────────────

function weapon(
  id: string,
  name: string,
  tier: number,
  skill: 'melee' | 'ranged' | 'magic',
  level: number,
  stats: Record<string, number>,
) {
  return it({
    id,
    name,
    itemType: 'weapon',
    slot: 'main_hand',
    tier,
    requiredSkill: skill,
    requiredLevel: level,
    baseStats: stats,
    maxDurability: 50 + tier * 20,
    sellPrice: tier * 10,
  });
}

const weapons = [
  // Tier 1
  weapon(IDS.wep.woodenSword, 'Wooden Sword', 1, 'melee', 1, { attack: 4 }),
  weapon(IDS.wep.oakShortbow, 'Oak Shortbow', 1, 'ranged', 1, { rangedPower: 3 }),
  weapon(IDS.wep.oakStaff, 'Oak Staff', 1, 'magic', 1, { magicPower: 5 }),
  weapon(IDS.wep.copperDagger, 'Copper Dagger', 1, 'melee', 3, { attack: 5, dodge: 1 }),
  // Tier 2
  weapon(IDS.wep.tinSword, 'Tin Sword', 2, 'melee', 5, { attack: 8 }),
  weapon(IDS.wep.mapleLongbow, 'Maple Longbow', 2, 'ranged', 5, { rangedPower: 7 }),
  weapon(IDS.wep.mapleStaff, 'Maple Staff', 2, 'magic', 5, { magicPower: 10 }),
  weapon(IDS.wep.boarTuskMace, 'Boar Tusk Mace', 2, 'melee', 8, { attack: 10, armor: 1 }),
  weapon(IDS.wep.batWingCrossbow, 'Bat Wing Crossbow', 2, 'ranged', 8, { rangedPower: 9, dodge: 1 }),
  weapon(IDS.wep.goblinHexStaff, 'Goblin Hex Staff', 2, 'magic', 8, { magicPower: 13 }),
  // Tier 3
  weapon(IDS.wep.ironLongsword, 'Iron Longsword', 3, 'melee', 12, { attack: 14 }),
  weapon(IDS.wep.willowWarbow, 'Willow Warbow', 3, 'ranged', 12, { rangedPower: 12 }),
  weapon(IDS.wep.elderwoodStaff, 'Elderwood Staff', 3, 'magic', 12, { magicPower: 17 }),
  weapon(IDS.wep.crawlerFangBlade, 'Crawler Fang Blade', 3, 'melee', 16, { attack: 16, critChance: 0.02 }),
  weapon(IDS.wep.harpyTalonBow, 'Harpy Talon Bow', 3, 'ranged', 16, { rangedPower: 14, dodge: 2 }),
  weapon(IDS.wep.faeCrystalStaff, 'Fae Crystal Staff', 3, 'magic', 16, { magicPower: 21 }),
  // Tier 4
  weapon(IDS.wep.darkIronGreatsword, 'Dark Iron Greatsword', 4, 'melee', 20, { attack: 22 }),
  weapon(IDS.wep.bogwoodLongbow, 'Bogwood Longbow', 4, 'ranged', 20, { rangedPower: 19 }),
  weapon(IDS.wep.crystalStaffWep, 'Crystal Staff', 4, 'magic', 20, { magicPower: 26 }),
  weapon(IDS.wep.hydraFangSabre, 'Hydra Fang Sabre', 4, 'melee', 25, { attack: 24, critChance: 0.03 }),
  weapon(IDS.wep.wraithBow, 'Wraith Bow', 4, 'ranged', 25, { rangedPower: 22, magicPower: 4 }),
  weapon(IDS.wep.witchsSceptre, "Witch's Sceptre", 4, 'magic', 25, { magicPower: 32 }),
  // Tier 5
  weapon(IDS.wep.mithrilBlade, 'Mithril Blade', 5, 'melee', 30, { attack: 30 }),
  weapon(IDS.wep.ancientBow, 'Ancient Bow', 5, 'ranged', 30, { rangedPower: 27 }),
  weapon(IDS.wep.lichStaff, 'Lich Staff', 5, 'magic', 30, { magicPower: 38 }),
];

// ── Armor (generated) ────────────────────────────────────────────────────────

// Stat scaling factors by slot relative to chest (1.0)
const SLOT_SCALE: Record<string, number> = {
  head: 0.8,
  chest: 1.0,
  legs: 0.9,
  boots: 0.6,
  gloves: 0.5,
  belt: 0.5,
};

type ArmorTierDef = {
  tier: number;
  reqLevel: number;
  slots: string[];
  heavy: { prefix: string; chestName: string; stats: Record<string, number> };
  medium: { prefix: string; chestName: string; stats: Record<string, number> };
  light: { prefix: string; chestName: string; stats: Record<string, number> };
};

const SLOT_NAMES: Record<string, Record<string, string>> = {
  heavy: { head: 'Helm', chest: '', legs: 'Greaves', boots: 'Boots', gloves: 'Gauntlets', belt: 'Belt' },
  medium: { head: 'Cap', chest: '', legs: 'Leggings', boots: 'Boots', gloves: 'Gloves', belt: 'Belt' },
  light: { head: 'Hood', chest: '', legs: 'Pants', boots: 'Slippers', gloves: 'Gloves', belt: 'Belt' },
};

const armorTiers: ArmorTierDef[] = [
  {
    tier: 1,
    reqLevel: 1,
    slots: ['head', 'chest'],
    heavy: { prefix: 'Copper', chestName: 'Copper Chainmail', stats: { armor: 5 } },
    medium: { prefix: 'Boar Leather', chestName: 'Boar Leather Vest', stats: { armor: 3, dodge: 1 } },
    light: { prefix: 'Silk', chestName: 'Silk Robe', stats: { armor: 1, magicDefence: 2, dodge: 2 } },
  },
  {
    tier: 2,
    reqLevel: 5,
    slots: ['head', 'chest', 'legs'],
    heavy: { prefix: 'Tin Plate', chestName: 'Tin Plate Cuirass', stats: { armor: 8 } },
    medium: { prefix: 'Wolf Leather', chestName: 'Wolf Leather Vest', stats: { armor: 5, dodge: 2 } },
    light: { prefix: 'Woven', chestName: 'Woven Tunic', stats: { armor: 2, magicDefence: 4, dodge: 3 } },
  },
  {
    tier: 3,
    reqLevel: 12,
    slots: ['head', 'chest', 'legs', 'boots', 'gloves'],
    heavy: { prefix: 'Iron', chestName: 'Iron Breastplate', stats: { armor: 12 } },
    medium: { prefix: 'Warg Hide', chestName: 'Warg Hide Coat', stats: { armor: 8, dodge: 3 } },
    light: { prefix: 'Fae Silk', chestName: 'Fae Silk Robe', stats: { armor: 3, magicDefence: 6, dodge: 5 } },
  },
  {
    tier: 4,
    reqLevel: 20,
    slots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'],
    heavy: { prefix: 'Dark Iron', chestName: 'Dark Iron Platemail', stats: { armor: 18 } },
    medium: { prefix: 'Croc Scale', chestName: 'Croc Scale Vest', stats: { armor: 12, dodge: 4 } },
    light: { prefix: 'Cursed', chestName: 'Cursed Garb', stats: { armor: 5, magicDefence: 10, dodge: 7 } },
  },
  {
    tier: 5,
    reqLevel: 30,
    slots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'],
    heavy: { prefix: 'Mithril', chestName: 'Mithril Warplate', stats: { armor: 24 } },
    medium: { prefix: 'Naga Scale', chestName: 'Naga Scale Armour', stats: { armor: 16, dodge: 6 } },
    light: { prefix: 'Spectral', chestName: 'Spectral Robe', stats: { armor: 7, magicDefence: 14, dodge: 9 } },
  },
];

function generateArmor() {
  const items: ReturnType<typeof it>[] = [];
  for (const td of armorTiers) {
    for (const weight of ['heavy', 'medium', 'light'] as const) {
      const wDef = td[weight];
      for (const slot of td.slots) {
        const key = `t${td.tier}_${weight}_${slot}` as keyof typeof IDS.arm;
        const id = IDS.arm[key];
        if (!id) continue;

        // Name: chest uses special name, others use "prefix slotName"
        const name =
          slot === 'chest'
            ? wDef.chestName
            : `${wDef.prefix} ${SLOT_NAMES[weight][slot]}`;

        // Scale stats by slot
        const scale = SLOT_SCALE[slot];
        const baseStats: Record<string, number> = {};
        for (const [stat, val] of Object.entries(wDef.stats)) {
          baseStats[stat] = Math.max(1, Math.round(val * scale));
        }

        items.push(
          it({
            id,
            name,
            itemType: 'armor',
            slot,
            tier: td.tier,
            weightClass: weight,
            requiredLevel: td.reqLevel,
            baseStats,
            maxDurability: 60 + td.tier * 20,
            sellPrice: td.tier * 8,
          }),
        );
      }
    }
  }
  return items;
}

// ── Advanced (Soulbound) Gear ────────────────────────────────────────────────

const advancedGear = [
  // Tier 1
  it({ id: IDS.adv.ratHideGloves, name: 'Rat Hide Gloves', itemType: 'armor', slot: 'gloves', tier: 1, weightClass: 'medium', requiredLevel: 1, baseStats: { attack: 2, dodge: 1 }, maxDurability: 60, sellPrice: 0 }),
  it({ id: IDS.adv.spiderSilkBelt, name: 'Spider Silk Belt', itemType: 'armor', slot: 'belt', tier: 1, weightClass: 'light', requiredLevel: 1, baseStats: { health: 3, dodge: 2 }, maxDurability: 60, sellPrice: 0 }),
  it({ id: IDS.adv.boarHideBoots, name: 'Boar Hide Boots', itemType: 'armor', slot: 'boots', tier: 1, weightClass: 'medium', requiredLevel: 1, baseStats: { armor: 2, health: 2 }, maxDurability: 60, sellPrice: 0 }),
  // Tier 2
  it({ id: IDS.adv.wolfFangNecklace, name: 'Wolf Fang Necklace', itemType: 'armor', slot: 'neck', tier: 2, requiredLevel: 5, baseStats: { attack: 3, critChance: 0.01 }, maxDurability: 80, sellPrice: 0 }),
  it({ id: IDS.adv.banditsLuckyRing, name: "Bandit's Lucky Ring", itemType: 'armor', slot: 'ring', tier: 2, requiredLevel: 5, baseStats: { luck: 3, dodge: 2 }, maxDurability: 80, sellPrice: 0 }),
  it({ id: IDS.adv.ironbarkGloves, name: 'Ironbark Gloves', itemType: 'armor', slot: 'gloves', tier: 2, weightClass: 'heavy', requiredLevel: 5, baseStats: { armor: 4, magicDefence: 3 }, maxDurability: 80, sellPrice: 0 }),
  it({ id: IDS.adv.batWingBoots, name: 'Bat Wing Boots', itemType: 'armor', slot: 'boots', tier: 2, weightClass: 'light', requiredLevel: 5, baseStats: { dodge: 6 }, maxDurability: 80, sellPrice: 0 }),
  it({ id: IDS.adv.goblinTrinketCharm, name: 'Goblin Trinket Charm', itemType: 'armor', slot: 'charm', tier: 2, requiredLevel: 5, baseStats: { luck: 2, health: 3 }, maxDurability: 80, sellPrice: 0 }),
  // Tier 3
  it({ id: IDS.adv.spriteDustRing, name: 'Sprite Dust Ring', itemType: 'armor', slot: 'ring', tier: 3, requiredLevel: 12, baseStats: { magicPower: 4, luck: 2 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.faeCrown, name: 'Fae Crown', itemType: 'armor', slot: 'charm', tier: 3, requiredLevel: 12, baseStats: { magicDefence: 5, dodge: 3 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.heartwoodShield, name: 'Heartwood Shield', itemType: 'armor', slot: 'off_hand', tier: 3, weightClass: 'heavy', requiredLevel: 12, baseStats: { armor: 6, health: 4 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.crystalCoreBelt, name: 'Crystal Core Belt', itemType: 'armor', slot: 'belt', tier: 3, weightClass: 'heavy', requiredLevel: 12, baseStats: { armor: 5, health: 5 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.chitinGauntlets, name: 'Chitin Gauntlets', itemType: 'armor', slot: 'gloves', tier: 3, weightClass: 'medium', requiredLevel: 12, baseStats: { attack: 4, armor: 3 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.wargRiderBelt, name: 'Warg Rider Belt', itemType: 'armor', slot: 'belt', tier: 3, weightClass: 'medium', requiredLevel: 12, baseStats: { attack: 3, dodge: 3, health: 2 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.warlordsSignet, name: "Warlord's Signet", itemType: 'armor', slot: 'ring', tier: 3, requiredLevel: 12, baseStats: { attack: 3, critDamage: 0.1 }, maxDurability: 100, sellPrice: 0 }),
  it({ id: IDS.adv.windcallersCharm, name: "Windcaller's Charm", itemType: 'armor', slot: 'charm', tier: 3, requiredLevel: 12, baseStats: { dodge: 8 }, maxDurability: 100, sellPrice: 0 }),
  // Tier 4
  it({ id: IDS.adv.deathKnightsRing, name: "Death Knight's Ring", itemType: 'armor', slot: 'ring', tier: 4, requiredLevel: 20, baseStats: { attack: 5, critChance: 0.02 }, maxDurability: 120, sellPrice: 0 }),
  it({ id: IDS.adv.hydraScaleShield, name: 'Hydra Scale Shield', itemType: 'armor', slot: 'off_hand', tier: 4, weightClass: 'heavy', requiredLevel: 20, baseStats: { armor: 8, health: 6 }, maxDurability: 120, sellPrice: 0 }),
  it({ id: IDS.adv.covenAmulet, name: 'Coven Amulet', itemType: 'armor', slot: 'neck', tier: 4, requiredLevel: 20, baseStats: { magicPower: 6, critChance: 0.02 }, maxDurability: 120, sellPrice: 0 }),
  it({ id: IDS.adv.stormCrystalCharm, name: 'Storm Crystal Charm', itemType: 'armor', slot: 'charm', tier: 4, requiredLevel: 20, baseStats: { magicPower: 5, critDamage: 0.15 }, maxDurability: 120, sellPrice: 0 }),
  it({ id: IDS.adv.diamondGolemBelt, name: 'Diamond Golem Belt', itemType: 'armor', slot: 'belt', tier: 4, weightClass: 'heavy', requiredLevel: 20, baseStats: { armor: 8, magicDefence: 6 }, maxDurability: 120, sellPrice: 0 }),
  it({ id: IDS.adv.goblinKingsCrown, name: "Goblin King's Crown", itemType: 'armor', slot: 'head', tier: 4, weightClass: 'medium', requiredLevel: 20, baseStats: { luck: 5, attack: 4, health: 4 }, maxDurability: 120, sellPrice: 0 }),
];

// ── Backpacks ───────────────────────────────────────────────────────────────

const backpacks = [
  it({ id: IDS.backpack.clothSatchel, name: 'Cloth Satchel', itemType: 'armor', slot: 'backpack', tier: 1, requiredLevel: 1, baseStats: { inventorySlots: 8 }, maxDurability: 0, sellPrice: 15 }),
  it({ id: IDS.backpack.reinforcedPack, name: 'Reinforced Pack', itemType: 'armor', slot: 'backpack', tier: 2, requiredLevel: 1, baseStats: { inventorySlots: 16 }, maxDurability: 0, sellPrice: 30 }),
  it({ id: IDS.backpack.travellerRucksack, name: "Traveller's Rucksack", itemType: 'armor', slot: 'backpack', tier: 3, requiredLevel: 1, baseStats: { inventorySlots: 24 }, maxDurability: 0, sellPrice: 45 }),
  it({ id: IDS.backpack.rangerHaversack, name: "Ranger's Haversack", itemType: 'armor', slot: 'backpack', tier: 4, requiredLevel: 1, baseStats: { inventorySlots: 32 }, maxDurability: 0, sellPrice: 60 }),
  it({ id: IDS.backpack.adventurerExpeditionPack, name: "Adventurer's Expedition Pack", itemType: 'armor', slot: 'backpack', tier: 5, requiredLevel: 1, baseStats: { inventorySlots: 40 }, maxDurability: 0, sellPrice: 75 }),
];

// ── Boss Trophy Materials ────────────────────────────────────────────────────

const bossTrophyMaterials = [
  resource(IDS.trophy.alphaWolfFang, 'Alpha Wolf Fang', 2),
  resource(IDS.trophy.spiritEssence, 'Spirit Essence', 4),
];

// ── Boss Equipment ──────────────────────────────────────────────────────────

const bossEquipment = [
  { ...weapon(IDS.bossGear.wolfsbaneBlade, 'Wolfsbane Blade', 2, 'melee', 8, { attack: 8, critChance: 0.02 }), sellPrice: 0 },
  it({ id: IDS.bossGear.alphaPeltChest, name: 'Alpha Pelt Chest', itemType: 'armor', slot: 'chest', tier: 2, weightClass: 'medium', requiredLevel: 8, baseStats: { armor: 6, health: 5, dodge: 2 }, maxDurability: 100, sellPrice: 0 }),
  { ...weapon(IDS.bossGear.spiritStaff, 'Spirit Staff', 4, 'magic', 16, { magicPower: 10, critChance: 0.03 }), sellPrice: 0 },
  it({ id: IDS.bossGear.etherealRobes, name: 'Ethereal Robes', itemType: 'armor', slot: 'chest', tier: 4, weightClass: 'light', requiredLevel: 16, baseStats: { magicDefence: 8, health: 6, dodge: 3 }, maxDurability: 120, sellPrice: 0 }),
];

// ── Achievement Family Reward Items ──────────────────────────────────────────

const achievementFamilyItems = [
  it({ id: 'achievement_vermin_gloves', name: "Ratcatcher's Gloves", itemType: 'armor', slot: 'gloves', tier: 5, weightClass: 'light', baseStats: { attack: 5, dodge: 10 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_spiders_boots', name: 'Venomweave Boots', itemType: 'armor', slot: 'boots', tier: 5, weightClass: 'light', baseStats: { dodge: 12 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_boars_chest', name: 'Tuskhide Pauldrons', itemType: 'armor', slot: 'chest', tier: 5, weightClass: 'heavy', baseStats: { health: 15, armor: 8 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_wolves_chest', name: 'Wolf Pelt Cloak', itemType: 'armor', slot: 'chest', tier: 5, weightClass: 'light', baseStats: { dodge: 10 }, maxDurability: 200, sellPrice: 0 }),
  { ...weapon('achievement_bandits_weapon', "Bandit Lord's Blade", 5, 'melee', 30, { attack: 12, critChance: 0.05 }), maxDurability: 200, sellPrice: 0 },
  it({ id: 'achievement_treants_shield', name: 'Ironbark Shield', itemType: 'armor', slot: 'off_hand', tier: 5, weightClass: 'heavy', baseStats: { armor: 15, health: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_spirits_charm', name: 'Spectral Lantern', itemType: 'armor', slot: 'charm', tier: 5, baseStats: { magicPower: 12, magicDefence: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_fae_ring', name: 'Pixie Dust Ring', itemType: 'armor', slot: 'ring', tier: 5, baseStats: { luck: 10, dodge: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_bats_helm', name: 'Echolocation Helm', itemType: 'armor', slot: 'head', tier: 5, weightClass: 'light', baseStats: { dodge: 10, accuracy: 8 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_goblins_helm', name: "Goblin King's Crown", itemType: 'armor', slot: 'head', tier: 5, weightClass: 'light', baseStats: { luck: 12, attack: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_golems_charm', name: 'Crystal Core Charm', itemType: 'armor', slot: 'charm', tier: 5, baseStats: { magicDefence: 15, armor: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_crawlers_legs', name: 'Chitin Legguards', itemType: 'armor', slot: 'legs', tier: 5, weightClass: 'heavy', baseStats: { armor: 12, health: 8 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_harpies_boots', name: 'Featherstep Boots', itemType: 'armor', slot: 'boots', tier: 5, weightClass: 'light', baseStats: { dodge: 15 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_undead_gloves', name: "Death Knight's Gauntlets", itemType: 'armor', slot: 'gloves', tier: 5, weightClass: 'heavy', baseStats: { attack: 12, critDamage: 0.1 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_swampBeasts_belt', name: "Mire Walker's Belt", itemType: 'armor', slot: 'belt', tier: 5, baseStats: { health: 12, armor: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_witches_helm', name: 'Hexweave Cowl', itemType: 'armor', slot: 'head', tier: 5, weightClass: 'light', baseStats: { magicPower: 12, magicDefence: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_elementals_neck', name: 'Primordial Shard Necklace', itemType: 'armor', slot: 'neck', tier: 5, baseStats: { magicPower: 8, magicDefence: 8 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_serpents_ring', name: "Naga Queen's Ring", itemType: 'armor', slot: 'ring', tier: 5, baseStats: { magicDefence: 12, dodge: 5 }, maxDurability: 200, sellPrice: 0 }),
  it({ id: 'achievement_abominations_chest', name: 'Fleshknit Vest', itemType: 'armor', slot: 'chest', tier: 5, weightClass: 'light', baseStats: { health: 20 }, maxDurability: 200, sellPrice: 0 }),
];

// ── Export ────────────────────────────────────────────────────────────────────

export function getAllItemTemplates() {
  return [
    ...rawResources,
    ...processedMaterials,
    ...mobDropMaterials,
    ...processedLeather,
    ...consumables,
    ...weapons,
    ...generateArmor(),
    ...rawGems,
    ...cutGems,
    ...jewellery,
    ...advancedGear,
    ...backpacks,
    ...bossTrophyMaterials,
    ...bossEquipment,
    ...achievementFamilyItems,
  ];
}
