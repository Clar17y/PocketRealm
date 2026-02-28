import { randomUUID } from 'crypto';
import { IDS } from './ids';

const res = IDS.res;
const proc = IDS.proc;
const drop = IDS.drop;
const lth = IDS.leather;
const pots = IDS.pots;
const wep = IDS.wep;
const arm = IDS.arm;
const adv = IDS.adv;
const fam = IDS.families;
const gems = IDS.gems;
const jewel = IDS.jewel;
const trophy = IDS.trophy;
const bossGear = IDS.bossGear;
const backpack = IDS.backpack;

type Recipe = {
  id?: string;
  skillType: string;
  requiredLevel: number;
  resultTemplateId: string;
  turnCost: number;
  xpReward: number;
  materials: { itemTemplateId: string; quantity: number }[];
  isAdvanced?: boolean;
  soulbound?: boolean;
  mobFamilyId?: string;
};

function recipe(r: Recipe) {
  return {
    id: r.id ?? randomUUID(),
    skillType: r.skillType,
    requiredLevel: r.requiredLevel,
    resultTemplateId: r.resultTemplateId,
    turnCost: r.turnCost,
    xpReward: r.xpReward,
    materials: r.materials.map((material) => ({
      templateId: material.itemTemplateId,
      quantity: material.quantity,
    })),
    isAdvanced: r.isAdvanced ?? false,
    soulbound: r.soulbound ?? false,
    mobFamilyId: r.mobFamilyId ?? null,
  };
}

// ── Processing Recipes (ore→ingot, log→plank, herb→potion, hide→leather) ──

function processingRecipes() {
  return [
    // Ore → Ingot
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: proc.copperIngot, turnCost: 5, xpReward: 8, materials: [{ itemTemplateId: res.copperOre, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: proc.tinIngot, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: res.tinOre, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: proc.ironIngot, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: res.ironOre, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: proc.cutStone, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: res.sandstone, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: proc.darkIronIngot, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: res.darkIronOre, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: proc.mithrilIngot, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: res.mithrilOre, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 30, resultTemplateId: proc.ancientIngot, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: res.ancientOre, quantity: 2 }] }),
    // Log → Plank
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: proc.oakPlank, turnCost: 5, xpReward: 8, materials: [{ itemTemplateId: res.oakLog, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: proc.maplePlank, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: res.mapleLog, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: proc.fungalPlank, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: res.fungalWood, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: proc.elderwoodPlank, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: res.elderwoodLog, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: proc.willowPlank, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: res.willowLog, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: proc.bogwoodPlank, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: res.bogwoodLog, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: proc.crystalPlank, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: res.crystalWood, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 30, resultTemplateId: proc.petrifiedPlank, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: res.petrifiedWood, quantity: 2 }] }),
    // Hide → Leather
    recipe({ skillType: 'tanning', requiredLevel: 1, resultTemplateId: lth.ratLeather, turnCost: 5, xpReward: 8, materials: [{ itemTemplateId: drop.ratPelt, quantity: 2 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 1, resultTemplateId: lth.boarLeather, turnCost: 5, xpReward: 8, materials: [{ itemTemplateId: drop.boarHide, quantity: 2 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 1, resultTemplateId: lth.silkCloth, turnCost: 5, xpReward: 8, materials: [{ itemTemplateId: drop.spiderSilk, quantity: 3 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 5, resultTemplateId: lth.wolfLeather, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: drop.wolfPelt, quantity: 2 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 5, resultTemplateId: lth.batLeather, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: drop.batWing, quantity: 2 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 5, resultTemplateId: lth.wovenCloth, turnCost: 8, xpReward: 14, materials: [{ itemTemplateId: drop.banditCloth, quantity: 3 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 12, resultTemplateId: lth.wargLeather, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: drop.wargHide, quantity: 2 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 12, resultTemplateId: lth.chitinPlate, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: drop.crawlerChitin, quantity: 3 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 12, resultTemplateId: lth.faeFabric, turnCost: 12, xpReward: 22, materials: [{ itemTemplateId: drop.faeSilk, quantity: 3 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 20, resultTemplateId: lth.crocLeather, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: drop.crocHide, quantity: 2 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 20, resultTemplateId: lth.scaleMail, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: drop.hydraScale, quantity: 3 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 20, resultTemplateId: lth.cursedFabric, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: drop.witchCloth, quantity: 3 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 20, resultTemplateId: lth.etherealCloth, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: drop.wraithEssence, quantity: 3 }] }),
    recipe({ skillType: 'tanning', requiredLevel: 30, resultTemplateId: lth.nagaLeather, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: drop.nagaScale, quantity: 3 }] }),
    recipe({ skillType: 'weaving', requiredLevel: 30, resultTemplateId: lth.spectralFabric, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: drop.spectralSilk, quantity: 3 }] }),
    // Herb → Potion
    recipe({ skillType: 'alchemy', requiredLevel: 1, resultTemplateId: pots.minorHealthPotion, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: res.forestSage, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 5, resultTemplateId: pots.healthPotion, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: res.moonpetal, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 5, resultTemplateId: pots.antivenomPotion, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: res.caveMoss, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 12, resultTemplateId: pots.greaterHealthPotion, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: res.starbloom, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 20, resultTemplateId: pots.resistPotion, turnCost: 18, xpReward: 30, materials: [{ itemTemplateId: res.gravemoss, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 20, resultTemplateId: pots.manaPotion, turnCost: 18, xpReward: 30, materials: [{ itemTemplateId: res.shimmerFern, quantity: 2 }] }),
    recipe({ skillType: 'alchemy', requiredLevel: 30, resultTemplateId: pots.elixirOfPower, turnCost: 25, xpReward: 42, materials: [{ itemTemplateId: res.abyssalKelp, quantity: 3 }] }),
  ];
}

// ── Weapon Recipes ────────────────────────────────────────────────────────────

function weaponRecipes() {
  return [
    // Tier 1
    recipe({ skillType: 'weaponsmithing', requiredLevel: 1, resultTemplateId: wep.woodenSword, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.oakPlank, quantity: 3 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 1, resultTemplateId: wep.oakShortbow, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.oakPlank, quantity: 2 }, { itemTemplateId: drop.spiderSilk, quantity: 2 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 1, resultTemplateId: wep.oakStaff, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.oakPlank, quantity: 3 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 3, resultTemplateId: wep.copperDagger, turnCost: 12, xpReward: 18, materials: [{ itemTemplateId: proc.copperIngot, quantity: 2 }, { itemTemplateId: proc.oakPlank, quantity: 1 }] }),
    // Tier 2
    recipe({ skillType: 'weaponsmithing', requiredLevel: 5, resultTemplateId: wep.tinSword, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.tinIngot, quantity: 3 }, { itemTemplateId: proc.maplePlank, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 5, resultTemplateId: wep.mapleLongbow, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.maplePlank, quantity: 3 }, { itemTemplateId: lth.wolfLeather, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 5, resultTemplateId: wep.mapleStaff, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.maplePlank, quantity: 3 }, { itemTemplateId: res.moonpetal, quantity: 1 }] }),
    // Tier 3
    recipe({ skillType: 'weaponsmithing', requiredLevel: 12, resultTemplateId: wep.ironLongsword, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: proc.willowPlank, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 12, resultTemplateId: wep.willowWarbow, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.willowPlank, quantity: 4 }, { itemTemplateId: lth.wargLeather, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 12, resultTemplateId: wep.elderwoodStaff, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.elderwoodPlank, quantity: 4 }, { itemTemplateId: res.starbloom, quantity: 1 }] }),
    // Tier 4
    recipe({ skillType: 'weaponsmithing', requiredLevel: 20, resultTemplateId: wep.darkIronGreatsword, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: proc.bogwoodPlank, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 20, resultTemplateId: wep.bogwoodLongbow, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.bogwoodPlank, quantity: 5 }, { itemTemplateId: lth.crocLeather, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 20, resultTemplateId: wep.crystalStaffWep, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.crystalPlank, quantity: 5 }, { itemTemplateId: drop.darkCrystal, quantity: 2 }] }),
    // Tier 5
    recipe({ skillType: 'weaponsmithing', requiredLevel: 30, resultTemplateId: wep.mithrilBlade, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: proc.petrifiedPlank, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 30, resultTemplateId: wep.ancientBow, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.petrifiedPlank, quantity: 6 }, { itemTemplateId: lth.nagaLeather, quantity: 1 }] }),
  ];
}

// ── Armor Recipes (generated) ─────────────────────────────────────────────────

type ArmorRecipeDef = {
  id: string;
  level: number;
  tier: number;
  weight: 'heavy' | 'medium' | 'light';
  slot: string;
};

// Material mapping per tier per weight
function armorMats(tier: number, weight: string, slot: string): { itemTemplateId: string; quantity: number }[] {
  // Scale material cost by slot
  const slotScale: Record<string, number> = { head: 0.7, chest: 1, legs: 0.8, boots: 0.5, gloves: 0.5, belt: 0.4 };
  const scale = slotScale[slot] ?? 1;
  function q(base: number) { return Math.max(1, Math.round(base * scale)); }

  if (weight === 'heavy') {
    const ingots: Record<number, string> = { 1: proc.copperIngot, 2: proc.tinIngot, 3: proc.ironIngot, 4: proc.darkIronIngot, 5: proc.mithrilIngot };
    return [{ itemTemplateId: ingots[tier], quantity: q(4) }];
  }
  if (weight === 'medium') {
    const leathers: Record<number, string> = { 1: lth.boarLeather, 2: lth.wolfLeather, 3: lth.wargLeather, 4: lth.crocLeather, 5: lth.nagaLeather };
    return [{ itemTemplateId: leathers[tier], quantity: q(4) }];
  }
  // light
  const fabrics: Record<number, string> = { 1: lth.silkCloth, 2: lth.wovenCloth, 3: lth.faeFabric, 4: lth.cursedFabric, 5: lth.spectralFabric };
  return [{ itemTemplateId: fabrics[tier], quantity: q(4) }];
}

function armorRecipes() {
  const tiers: { tier: number; level: number; slots: string[] }[] = [
    { tier: 1, level: 1, slots: ['head', 'chest'] },
    { tier: 2, level: 5, slots: ['head', 'chest', 'legs'] },
    { tier: 3, level: 12, slots: ['head', 'chest', 'legs', 'boots', 'gloves'] },
    { tier: 4, level: 20, slots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'] },
    { tier: 5, level: 30, slots: ['head', 'chest', 'legs', 'boots', 'gloves', 'belt'] },
  ];
  const turnCosts: Record<number, number> = { 1: 10, 2: 18, 3: 30, 4: 45, 5: 70 };
  const xpRewards: Record<number, number> = { 1: 15, 2: 28, 3: 45, 4: 70, 5: 110 };

  const recipes: ReturnType<typeof recipe>[] = [];
  for (const td of tiers) {
    for (const weight of ['heavy', 'medium', 'light'] as const) {
      for (const slot of td.slots) {
        const key = `t${td.tier}_${weight}_${slot}` as keyof typeof arm;
        const id = arm[key];
        if (!id) continue;
        recipes.push(
          recipe({
            skillType: weight === 'heavy' ? 'armorsmithing' : weight === 'medium' ? 'leatherworking' : 'tailoring',
            requiredLevel: td.level,
            resultTemplateId: id,
            turnCost: turnCosts[td.tier],
            xpReward: xpRewards[td.tier],
            materials: armorMats(td.tier, weight, slot),
          }),
        );
      }
    }
  }
  return recipes;
}

// ── Gem Refining Recipes (raw gem → cut gem via refining) ───────────────────

function gemRefiningRecipes() {
  return [
    // Mining gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutRuby, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.roughRuby, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutSapphire, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.roughSapphire, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutEmerald, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.roughEmerald, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutDiamond, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.roughDiamond, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutOpal, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.roughOpal, quantity: 2 }] }),
    // Foraging gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutAmber, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.rawAmber, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutPearl, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.rawPearl, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutJade, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.rawJade, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutMoonstone, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.rawMoonstone, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutStarcrystal, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.rawStarcrystal, quantity: 2 }] }),
    // Woodcutting gems
    recipe({ skillType: 'refining', requiredLevel: 1, resultTemplateId: gems.cutResin, turnCost: 5, xpReward: 6, materials: [{ itemTemplateId: gems.treeResin, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 5, resultTemplateId: gems.cutSap, turnCost: 8, xpReward: 12, materials: [{ itemTemplateId: gems.fossilizedSap, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 12, resultTemplateId: gems.cutBark, turnCost: 12, xpReward: 20, materials: [{ itemTemplateId: gems.crystalBark, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 20, resultTemplateId: gems.cutHeartwood, turnCost: 18, xpReward: 32, materials: [{ itemTemplateId: gems.heartwoodGem, quantity: 2 }] }),
    recipe({ skillType: 'refining', requiredLevel: 28, resultTemplateId: gems.cutAncientAmber, turnCost: 25, xpReward: 45, materials: [{ itemTemplateId: gems.ancientAmber, quantity: 2 }] }),
  ];
}

// ── Jewelcrafting Recipes ───────────────────────────────────────────────────

function jewelcraftingRecipes() {
  return [
    // Tier 1 — metal + gem only
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperRing, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutRuby, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperPendant, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutAmber, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 1, resultTemplateId: jewel.copperCharm, turnCost: 10, xpReward: 15, materials: [{ itemTemplateId: proc.copperIngot, quantity: 3 }, { itemTemplateId: gems.cutResin, quantity: 1 }] }),
    // Tier 2 — metal + gem
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironBand, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutSapphire, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironChain, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutPearl, quantity: 1 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: jewel.ironTalisman, turnCost: 18, xpReward: 28, materials: [{ itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: gems.cutSap, quantity: 1 }] }),
    // Tier 3 — metal + gem + mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronRing, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutEmerald, quantity: 2 }, { itemTemplateId: drop.crystalShard, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronAmulet, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutJade, quantity: 2 }, { itemTemplateId: drop.faeSilk, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: jewel.darkIronCharm, turnCost: 30, xpReward: 45, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 5 }, { itemTemplateId: gems.cutBark, quantity: 2 }, { itemTemplateId: drop.harpyFeather, quantity: 2 }] }),
    // Tier 4 — metal + gem + mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilRing, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutDiamond, quantity: 3 }, { itemTemplateId: drop.darkCrystal, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilNecklace, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutMoonstone, quantity: 3 }, { itemTemplateId: drop.bogHeart, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: jewel.mithrilTalisman, turnCost: 45, xpReward: 70, materials: [{ itemTemplateId: proc.mithrilIngot, quantity: 6 }, { itemTemplateId: gems.cutHeartwood, quantity: 3 }, { itemTemplateId: drop.wraithEssence, quantity: 3 }] }),
    // Tier 5 — metal + gem + rare mob drop
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientRing, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutOpal, quantity: 4 }, { itemTemplateId: drop.eldritchFragment, quantity: 4 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientAmulet, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutStarcrystal, quantity: 4 }, { itemTemplateId: drop.nagaPearl, quantity: 4 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 28, resultTemplateId: jewel.ancientCharm, turnCost: 70, xpReward: 110, materials: [{ itemTemplateId: proc.ancientIngot, quantity: 8 }, { itemTemplateId: gems.cutAncientAmber, quantity: 4 }, { itemTemplateId: drop.lichDust, quantity: 4 }] }),
  ];
}

// ── Advanced (Soulbound) Recipes ──────────────────────────────────────────────

function advancedRecipes() {
  return [
    // Tier 1 (Forest Edge families)
    recipe({ skillType: 'leatherworking', requiredLevel: 1, resultTemplateId: adv.ratHideGloves, turnCost: 15, xpReward: 20, isAdvanced: true, soulbound: true, mobFamilyId: fam.vermin, materials: [{ itemTemplateId: drop.ratTail, quantity: 8 }, { itemTemplateId: lth.ratLeather, quantity: 4 }, { itemTemplateId: proc.copperIngot, quantity: 3 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 1, resultTemplateId: adv.spiderSilkBelt, turnCost: 15, xpReward: 20, isAdvanced: true, soulbound: true, mobFamilyId: fam.spiders, materials: [{ itemTemplateId: drop.spiderSilk, quantity: 6 }, { itemTemplateId: lth.silkCloth, quantity: 3 }, { itemTemplateId: proc.oakPlank, quantity: 2 }] }),
    recipe({ skillType: 'leatherworking', requiredLevel: 1, resultTemplateId: adv.boarHideBoots, turnCost: 15, xpReward: 20, isAdvanced: true, soulbound: true, mobFamilyId: fam.boars, materials: [{ itemTemplateId: drop.boarHide, quantity: 6 }, { itemTemplateId: drop.boarTusk, quantity: 4 }, { itemTemplateId: proc.copperIngot, quantity: 2 }] }),
    // Tier 2 (Deep Forest / Cave Entrance families)
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: adv.wolfFangNecklace, turnCost: 24, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.wolves, materials: [{ itemTemplateId: drop.wolfFang, quantity: 8 }, { itemTemplateId: lth.wolfLeather, quantity: 4 }, { itemTemplateId: proc.tinIngot, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: adv.banditsLuckyRing, turnCost: 24, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.bandits, materials: [{ itemTemplateId: drop.stolenCoin, quantity: 6 }, { itemTemplateId: drop.crudeGemstone, quantity: 3 }, { itemTemplateId: proc.tinIngot, quantity: 2 }] }),
    recipe({ skillType: 'armorsmithing', requiredLevel: 5, resultTemplateId: adv.ironbarkGloves, turnCost: 24, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.treants, materials: [{ itemTemplateId: drop.ancientBark, quantity: 6 }, { itemTemplateId: proc.maplePlank, quantity: 4 }, { itemTemplateId: lth.wolfLeather, quantity: 2 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 5, resultTemplateId: adv.batWingBoots, turnCost: 24, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.bats, materials: [{ itemTemplateId: drop.batWing, quantity: 8 }, { itemTemplateId: lth.batLeather, quantity: 4 }, { itemTemplateId: proc.maplePlank, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 5, resultTemplateId: adv.goblinTrinketCharm, turnCost: 24, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.goblins, materials: [{ itemTemplateId: drop.crudeGemstone, quantity: 5 }, { itemTemplateId: drop.stolenCoin, quantity: 4 }, { itemTemplateId: proc.tinIngot, quantity: 3 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 8, resultTemplateId: wep.boarTuskMace, turnCost: 22, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.boars, materials: [{ itemTemplateId: proc.tinIngot, quantity: 2 }, { itemTemplateId: drop.boarTusk, quantity: 4 }, { itemTemplateId: proc.oakPlank, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 8, resultTemplateId: wep.batWingCrossbow, turnCost: 22, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.bats, materials: [{ itemTemplateId: proc.maplePlank, quantity: 2 }, { itemTemplateId: drop.batWing, quantity: 4 }, { itemTemplateId: proc.tinIngot, quantity: 1 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 8, resultTemplateId: wep.goblinHexStaff, turnCost: 22, xpReward: 35, isAdvanced: true, soulbound: true, mobFamilyId: fam.goblins, materials: [{ itemTemplateId: proc.fungalPlank, quantity: 2 }, { itemTemplateId: drop.crudeGemstone, quantity: 3 }, { itemTemplateId: drop.goblinRag, quantity: 2 }] }),
    // Tier 3 (Ancient Grove / Deep Mines / Whispering Plains families)
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: adv.spriteDustRing, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.spirits, materials: [{ itemTemplateId: drop.spriteDust, quantity: 8 }, { itemTemplateId: lth.faeFabric, quantity: 4 }, { itemTemplateId: proc.ironIngot, quantity: 2 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: adv.faeCrown, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.fae, materials: [{ itemTemplateId: drop.pixieWing, quantity: 6 }, { itemTemplateId: lth.faeFabric, quantity: 4 }, { itemTemplateId: proc.elderwoodPlank, quantity: 3 }] }),
    recipe({ skillType: 'armorsmithing', requiredLevel: 12, resultTemplateId: adv.heartwoodShield, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.treants, materials: [{ itemTemplateId: drop.ancientBark, quantity: 10 }, { itemTemplateId: proc.elderwoodPlank, quantity: 4 }, { itemTemplateId: proc.ironIngot, quantity: 2 }] }),
    recipe({ skillType: 'armorsmithing', requiredLevel: 12, resultTemplateId: adv.crystalCoreBelt, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.golems, materials: [{ itemTemplateId: drop.crystalShard, quantity: 6 }, { itemTemplateId: proc.ironIngot, quantity: 4 }, { itemTemplateId: proc.cutStone, quantity: 3 }] }),
    recipe({ skillType: 'leatherworking', requiredLevel: 12, resultTemplateId: adv.chitinGauntlets, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.crawlers, materials: [{ itemTemplateId: drop.crawlerChitin, quantity: 8 }, { itemTemplateId: lth.chitinPlate, quantity: 4 }, { itemTemplateId: proc.ironIngot, quantity: 2 }] }),
    recipe({ skillType: 'leatherworking', requiredLevel: 12, resultTemplateId: adv.wargRiderBelt, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.wolves, materials: [{ itemTemplateId: drop.wargHide, quantity: 6 }, { itemTemplateId: lth.wargLeather, quantity: 4 }, { itemTemplateId: proc.willowPlank, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: adv.warlordsSignet, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.bandits, materials: [{ itemTemplateId: drop.stolenCoin, quantity: 5 }, { itemTemplateId: drop.crudeGemstone, quantity: 4 }, { itemTemplateId: proc.ironIngot, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 12, resultTemplateId: adv.windcallersCharm, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.harpies, materials: [{ itemTemplateId: drop.harpyFeather, quantity: 8 }, { itemTemplateId: drop.harpyTalon, quantity: 4 }, { itemTemplateId: proc.willowPlank, quantity: 2 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 16, resultTemplateId: wep.crawlerFangBlade, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.crawlers, materials: [{ itemTemplateId: proc.ironIngot, quantity: 3 }, { itemTemplateId: drop.crawlerChitin, quantity: 5 }, { itemTemplateId: lth.chitinPlate, quantity: 2 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 16, resultTemplateId: wep.harpyTalonBow, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.harpies, materials: [{ itemTemplateId: proc.willowPlank, quantity: 3 }, { itemTemplateId: drop.harpyTalon, quantity: 5 }, { itemTemplateId: drop.harpyFeather, quantity: 3 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 16, resultTemplateId: wep.faeCrystalStaff, turnCost: 38, xpReward: 55, isAdvanced: true, soulbound: true, mobFamilyId: fam.fae, materials: [{ itemTemplateId: proc.elderwoodPlank, quantity: 3 }, { itemTemplateId: drop.spriteDust, quantity: 4 }, { itemTemplateId: lth.faeFabric, quantity: 2 }] }),
    // Tier 4 (Haunted Marsh / Crystal Caverns families)
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: adv.deathKnightsRing, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.undead, materials: [{ itemTemplateId: drop.boneFragment, quantity: 8 }, { itemTemplateId: drop.wraithEssence, quantity: 4 }, { itemTemplateId: proc.darkIronIngot, quantity: 3 }] }),
    recipe({ skillType: 'armorsmithing', requiredLevel: 20, resultTemplateId: adv.hydraScaleShield, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.swampBeasts, materials: [{ itemTemplateId: drop.hydraScale, quantity: 10 }, { itemTemplateId: lth.scaleMail, quantity: 4 }, { itemTemplateId: proc.bogwoodPlank, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: adv.covenAmulet, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.witches, materials: [{ itemTemplateId: drop.bogHeart, quantity: 6 }, { itemTemplateId: lth.cursedFabric, quantity: 4 }, { itemTemplateId: proc.darkIronIngot, quantity: 3 }] }),
    recipe({ skillType: 'jewelcrafting', requiredLevel: 20, resultTemplateId: adv.stormCrystalCharm, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.elementals, materials: [{ itemTemplateId: drop.darkCrystal, quantity: 8 }, { itemTemplateId: proc.crystalPlank, quantity: 4 }, { itemTemplateId: proc.mithrilIngot, quantity: 3 }] }),
    recipe({ skillType: 'armorsmithing', requiredLevel: 20, resultTemplateId: adv.diamondGolemBelt, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.golems, materials: [{ itemTemplateId: drop.darkCrystal, quantity: 6 }, { itemTemplateId: drop.cutGem, quantity: 4 }, { itemTemplateId: proc.mithrilIngot, quantity: 4 }] }),
    recipe({ skillType: 'leatherworking', requiredLevel: 20, resultTemplateId: adv.goblinKingsCrown, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.goblins, materials: [{ itemTemplateId: drop.goblinGold, quantity: 8 }, { itemTemplateId: drop.cutGem, quantity: 6 }, { itemTemplateId: proc.mithrilIngot, quantity: 4 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 25, resultTemplateId: wep.hydraFangSabre, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.swampBeasts, materials: [{ itemTemplateId: proc.darkIronIngot, quantity: 3 }, { itemTemplateId: drop.hydraScale, quantity: 5 }, { itemTemplateId: lth.scaleMail, quantity: 2 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 25, resultTemplateId: wep.wraithBow, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.undead, materials: [{ itemTemplateId: proc.bogwoodPlank, quantity: 3 }, { itemTemplateId: drop.wraithEssence, quantity: 5 }, { itemTemplateId: lth.etherealCloth, quantity: 2 }] }),
    recipe({ skillType: 'weaponsmithing', requiredLevel: 25, resultTemplateId: wep.witchsSceptre, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.witches, materials: [{ itemTemplateId: proc.crystalPlank, quantity: 3 }, { itemTemplateId: drop.bogHeart, quantity: 4 }, { itemTemplateId: lth.cursedFabric, quantity: 2 }] }),
    // Tier 5 (Abyssal Depths families)
    recipe({ skillType: 'weaponsmithing', requiredLevel: 30, resultTemplateId: wep.lichStaff, turnCost: 70, xpReward: 110, isAdvanced: true, soulbound: true, mobFamilyId: fam.undead, materials: [{ itemTemplateId: proc.petrifiedPlank, quantity: 4 }, { itemTemplateId: drop.lichDust, quantity: 4 }, { itemTemplateId: lth.spectralFabric, quantity: 2 }] }),
  ];
}

// ── Boss-Exclusive Recipes ────────────────────────────────────────────────────

function bossRecipes() {
  return [
    // Alpha Wolf (Tier 2)
    recipe({ skillType: 'weaponsmithing', requiredLevel: 8, resultTemplateId: bossGear.wolfsbaneBlade, turnCost: 24, xpReward: 40, isAdvanced: true, soulbound: true, mobFamilyId: fam.wolves, materials: [{ itemTemplateId: trophy.alphaWolfFang, quantity: 6 }, { itemTemplateId: proc.tinIngot, quantity: 4 }, { itemTemplateId: lth.wolfLeather, quantity: 3 }] }),
    recipe({ skillType: 'leatherworking', requiredLevel: 8, resultTemplateId: bossGear.alphaPeltChest, turnCost: 24, xpReward: 40, isAdvanced: true, soulbound: true, mobFamilyId: fam.wolves, materials: [{ itemTemplateId: trophy.alphaWolfFang, quantity: 4 }, { itemTemplateId: drop.wolfPelt, quantity: 6 }, { itemTemplateId: lth.wolfLeather, quantity: 4 }] }),
    // Ancient Spirit (Tier 4)
    recipe({ skillType: 'weaponsmithing', requiredLevel: 16, resultTemplateId: bossGear.spiritStaff, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.spirits, materials: [{ itemTemplateId: trophy.spiritEssence, quantity: 6 }, { itemTemplateId: proc.elderwoodPlank, quantity: 4 }, { itemTemplateId: drop.spriteDust, quantity: 5 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 16, resultTemplateId: bossGear.etherealRobes, turnCost: 55, xpReward: 85, isAdvanced: true, soulbound: true, mobFamilyId: fam.spirits, materials: [{ itemTemplateId: trophy.spiritEssence, quantity: 4 }, { itemTemplateId: drop.dryadThread, quantity: 6 }, { itemTemplateId: lth.faeFabric, quantity: 4 }] }),
  ];
}

// ── Backpack Recipes ──────────────────────────────────────────────────────────

function backpackRecipes() {
  return [
    recipe({ skillType: 'tailoring', requiredLevel: 5, resultTemplateId: backpack.clothSatchel, turnCost: 20, xpReward: 25, materials: [{ itemTemplateId: lth.silkCloth, quantity: 6 }, { itemTemplateId: lth.ratLeather, quantity: 3 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 15, resultTemplateId: backpack.reinforcedPack, turnCost: 35, xpReward: 45, materials: [{ itemTemplateId: lth.wovenCloth, quantity: 6 }, { itemTemplateId: lth.wolfLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 25, resultTemplateId: backpack.travellerRucksack, turnCost: 55, xpReward: 70, materials: [{ itemTemplateId: lth.faeFabric, quantity: 6 }, { itemTemplateId: lth.wargLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 35, resultTemplateId: backpack.rangerHaversack, turnCost: 80, xpReward: 100, materials: [{ itemTemplateId: lth.cursedFabric, quantity: 6 }, { itemTemplateId: lth.crocLeather, quantity: 4 }] }),
    recipe({ skillType: 'tailoring', requiredLevel: 45, resultTemplateId: backpack.adventurerExpeditionPack, turnCost: 110, xpReward: 140, materials: [{ itemTemplateId: lth.spectralFabric, quantity: 6 }, { itemTemplateId: lth.nagaLeather, quantity: 4 }] }),
  ];
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function getAllRecipes() {
  return [...processingRecipes(), ...gemRefiningRecipes(), ...weaponRecipes(), ...armorRecipes(), ...jewelcraftingRecipes(), ...advancedRecipes(), ...bossRecipes(), ...backpackRecipes()];
}
