import { randomUUID } from 'crypto';
import { IDS } from './ids';

const r = IDS.res;
const d = IDS.drop;
const p = IDS.pots;
const lth = IDS.leather;

// Helper: chest drop row
function cd(familyId: string, rarity: string, itemId: string, chancePct: number, min: number, max: number) {
  return { id: randomUUID(), mobFamilyId: familyId, chestRarity: rarity, itemTemplateId: itemId, dropChance: chancePct / 100, minQuantity: min, maxQuantity: max };
}

const f = IDS.families;

export function getAllChestDropTables() {
  return [
    // ══════════════════════════════════════════════════════════════════════
    // TIER 1 — Forest Edge
    // ══════════════════════════════════════════════════════════════════════

    // Vermin — Small (common)
    cd(f.vermin, 'common', r.copperOre, 80, 2, 4), cd(f.vermin, 'common', r.oakLog, 60, 1, 3), cd(f.vermin, 'common', r.forestSage, 40, 1, 2), cd(f.vermin, 'common', p.minorHealthPotion, 30, 1, 1),
    // Vermin — Medium (uncommon)
    cd(f.vermin, 'uncommon', r.copperOre, 80, 3, 6), cd(f.vermin, 'uncommon', r.oakLog, 60, 2, 4), cd(f.vermin, 'uncommon', r.forestSage, 50, 2, 3), cd(f.vermin, 'uncommon', d.ratTail, 70, 3, 5), cd(f.vermin, 'uncommon', d.ratPelt, 60, 2, 4), cd(f.vermin, 'uncommon', p.minorHealthPotion, 50, 1, 2),
    // Vermin — Large (rare)
    cd(f.vermin, 'rare', r.copperOre, 90, 5, 8), cd(f.vermin, 'rare', r.oakLog, 70, 3, 6), cd(f.vermin, 'rare', r.forestSage, 60, 3, 4), cd(f.vermin, 'rare', d.ratTail, 80, 5, 8), cd(f.vermin, 'rare', d.ratPelt, 70, 4, 6), cd(f.vermin, 'rare', p.minorHealthPotion, 60, 2, 3),

    // Spiders — Small
    cd(f.spiders, 'common', r.copperOre, 70, 1, 3), cd(f.spiders, 'common', r.oakLog, 50, 1, 2), cd(f.spiders, 'common', r.forestSage, 50, 1, 2), cd(f.spiders, 'common', p.minorHealthPotion, 30, 1, 1),
    // Spiders — Medium
    cd(f.spiders, 'uncommon', r.copperOre, 70, 2, 4), cd(f.spiders, 'uncommon', r.oakLog, 50, 2, 3), cd(f.spiders, 'uncommon', r.forestSage, 60, 2, 3), cd(f.spiders, 'uncommon', d.spiderSilk, 75, 4, 8), cd(f.spiders, 'uncommon', p.minorHealthPotion, 50, 1, 2),
    // Spiders — Large
    cd(f.spiders, 'rare', r.copperOre, 80, 3, 6), cd(f.spiders, 'rare', r.oakLog, 60, 3, 4), cd(f.spiders, 'rare', r.forestSage, 70, 3, 5), cd(f.spiders, 'rare', d.spiderSilk, 85, 6, 12), cd(f.spiders, 'rare', p.minorHealthPotion, 60, 2, 3),

    // Boars — Small
    cd(f.boars, 'common', r.copperOre, 80, 2, 4), cd(f.boars, 'common', r.oakLog, 60, 1, 3), cd(f.boars, 'common', r.forestSage, 40, 1, 2), cd(f.boars, 'common', p.minorHealthPotion, 30, 1, 1),
    // Boars — Medium
    cd(f.boars, 'uncommon', r.copperOre, 80, 3, 5), cd(f.boars, 'uncommon', r.oakLog, 60, 2, 4), cd(f.boars, 'uncommon', r.forestSage, 40, 1, 3), cd(f.boars, 'uncommon', d.boarTusk, 70, 3, 5), cd(f.boars, 'uncommon', d.boarHide, 60, 2, 4), cd(f.boars, 'uncommon', p.minorHealthPotion, 50, 1, 2),
    // Boars — Large
    cd(f.boars, 'rare', r.copperOre, 90, 4, 8), cd(f.boars, 'rare', r.oakLog, 70, 3, 5), cd(f.boars, 'rare', r.forestSage, 50, 2, 4), cd(f.boars, 'rare', d.boarTusk, 80, 5, 8), cd(f.boars, 'rare', d.boarHide, 70, 4, 6), cd(f.boars, 'rare', p.minorHealthPotion, 60, 2, 3),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 2 — Deep Forest
    // ══════════════════════════════════════════════════════════════════════

    // Wolves (Deep Forest) — Small
    cd(f.wolves, 'common', r.tinOre, 70, 2, 4), cd(f.wolves, 'common', r.mapleLog, 60, 1, 3), cd(f.wolves, 'common', r.moonpetal, 40, 1, 2), cd(f.wolves, 'common', p.healthPotion, 20, 1, 1),
    // Wolves — Medium
    cd(f.wolves, 'uncommon', r.tinOre, 70, 3, 5), cd(f.wolves, 'uncommon', r.mapleLog, 60, 2, 4), cd(f.wolves, 'uncommon', r.moonpetal, 50, 2, 3), cd(f.wolves, 'uncommon', d.wolfFang, 70, 3, 6), cd(f.wolves, 'uncommon', d.wolfPelt, 60, 2, 4), cd(f.wolves, 'uncommon', p.healthPotion, 40, 1, 1),
    // Wolves — Large
    cd(f.wolves, 'rare', r.tinOre, 80, 4, 7), cd(f.wolves, 'rare', r.mapleLog, 70, 3, 5), cd(f.wolves, 'rare', r.moonpetal, 60, 3, 4), cd(f.wolves, 'rare', d.wolfFang, 80, 5, 8), cd(f.wolves, 'rare', d.wolfPelt, 70, 4, 6), cd(f.wolves, 'rare', p.healthPotion, 50, 1, 2),

    // Bandits (Deep Forest) — Small
    cd(f.bandits, 'common', r.tinOre, 60, 1, 3), cd(f.bandits, 'common', r.mapleLog, 50, 1, 2), cd(f.bandits, 'common', r.moonpetal, 40, 1, 2), cd(f.bandits, 'common', p.healthPotion, 20, 1, 1),
    // Bandits — Medium
    cd(f.bandits, 'uncommon', r.tinOre, 60, 2, 4), cd(f.bandits, 'uncommon', r.mapleLog, 50, 2, 3), cd(f.bandits, 'uncommon', r.moonpetal, 40, 1, 2), cd(f.bandits, 'uncommon', d.stolenCoin, 75, 4, 8), cd(f.bandits, 'uncommon', d.crudeGemstone, 50, 1, 3), cd(f.bandits, 'uncommon', d.banditCloth, 55, 2, 4), cd(f.bandits, 'uncommon', p.healthPotion, 40, 1, 1),
    // Bandits — Large
    cd(f.bandits, 'rare', r.tinOre, 70, 3, 5), cd(f.bandits, 'rare', r.mapleLog, 60, 2, 4), cd(f.bandits, 'rare', r.moonpetal, 50, 2, 3), cd(f.bandits, 'rare', d.stolenCoin, 85, 6, 12), cd(f.bandits, 'rare', d.crudeGemstone, 65, 2, 4), cd(f.bandits, 'rare', d.banditCloth, 65, 3, 5), cd(f.bandits, 'rare', p.healthPotion, 50, 1, 2),

    // Treants (Deep Forest) — Small
    cd(f.treants, 'common', r.tinOre, 60, 1, 3), cd(f.treants, 'common', r.mapleLog, 70, 2, 4), cd(f.treants, 'common', r.moonpetal, 50, 1, 2), cd(f.treants, 'common', p.healthPotion, 20, 1, 1),
    // Treants — Medium
    cd(f.treants, 'uncommon', r.tinOre, 60, 2, 3), cd(f.treants, 'uncommon', r.mapleLog, 75, 3, 5), cd(f.treants, 'uncommon', r.moonpetal, 50, 2, 3), cd(f.treants, 'uncommon', d.ancientBark, 70, 3, 6), cd(f.treants, 'uncommon', p.healthPotion, 40, 1, 1),
    // Treants — Large
    cd(f.treants, 'rare', r.tinOre, 70, 3, 5), cd(f.treants, 'rare', r.mapleLog, 85, 4, 8), cd(f.treants, 'rare', r.moonpetal, 60, 3, 4), cd(f.treants, 'rare', d.ancientBark, 80, 5, 10), cd(f.treants, 'rare', p.healthPotion, 50, 1, 2), cd(f.treants, 'rare', p.manaPotion2, 30, 1, 1),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 2 — Cave Entrance (Bats, Goblins)
    // ══════════════════════════════════════════════════════════════════════

    // Bats — Small
    cd(f.bats, 'common', r.tinOre, 60, 1, 3), cd(f.bats, 'common', r.fungalWood, 50, 1, 2), cd(f.bats, 'common', r.caveMoss, 40, 1, 2), cd(f.bats, 'common', p.healthPotion, 20, 1, 1),
    // Bats — Medium
    cd(f.bats, 'uncommon', r.tinOre, 60, 2, 4), cd(f.bats, 'uncommon', r.fungalWood, 50, 2, 3), cd(f.bats, 'uncommon', r.caveMoss, 50, 2, 3), cd(f.bats, 'uncommon', d.batWing, 70, 3, 6), cd(f.bats, 'uncommon', d.batFang, 60, 2, 4), cd(f.bats, 'uncommon', p.healthPotion, 40, 1, 1),
    // Bats — Large
    cd(f.bats, 'rare', r.tinOre, 70, 3, 5), cd(f.bats, 'rare', r.fungalWood, 60, 3, 4), cd(f.bats, 'rare', r.caveMoss, 60, 3, 4), cd(f.bats, 'rare', d.batWing, 80, 5, 8), cd(f.bats, 'rare', d.batFang, 70, 4, 6), cd(f.bats, 'rare', p.healthPotion, 50, 1, 2),

    // Goblins (Cave) — Small
    cd(f.goblins, 'common', r.tinOre, 70, 2, 3), cd(f.goblins, 'common', r.fungalWood, 40, 1, 2), cd(f.goblins, 'common', r.caveMoss, 40, 1, 2), cd(f.goblins, 'common', p.healthPotion, 20, 1, 1),
    // Goblins (Cave) — Medium
    cd(f.goblins, 'uncommon', r.tinOre, 70, 2, 4), cd(f.goblins, 'uncommon', r.fungalWood, 40, 1, 3), cd(f.goblins, 'uncommon', r.caveMoss, 40, 1, 2), cd(f.goblins, 'uncommon', d.stolenCoin, 75, 4, 8), cd(f.goblins, 'uncommon', d.crudeGemstone, 50, 1, 3), cd(f.goblins, 'uncommon', d.goblinRag, 50, 2, 3), cd(f.goblins, 'uncommon', p.healthPotion, 40, 1, 1),
    // Goblins (Cave) — Large
    cd(f.goblins, 'rare', r.tinOre, 80, 3, 6), cd(f.goblins, 'rare', r.fungalWood, 50, 2, 4), cd(f.goblins, 'rare', r.caveMoss, 50, 2, 3), cd(f.goblins, 'rare', d.stolenCoin, 85, 6, 12), cd(f.goblins, 'rare', d.crudeGemstone, 65, 2, 4), cd(f.goblins, 'rare', d.goblinRag, 60, 3, 5), cd(f.goblins, 'rare', p.healthPotion, 50, 1, 2), cd(f.goblins, 'rare', p.manaPotion2, 30, 1, 1),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 3 — Ancient Grove (Spirits, Fae)
    // ══════════════════════════════════════════════════════════════════════

    // Spirits — Small
    cd(f.spirits, 'common', r.elderwoodLog, 60, 1, 3), cd(f.spirits, 'common', r.starbloom, 50, 1, 2), cd(f.spirits, 'common', p.greaterHealthPotion, 20, 1, 1),
    // Spirits — Medium
    cd(f.spirits, 'uncommon', r.elderwoodLog, 60, 2, 4), cd(f.spirits, 'uncommon', r.starbloom, 60, 2, 3), cd(f.spirits, 'uncommon', d.spriteDust, 70, 3, 6), cd(f.spirits, 'uncommon', d.dryadThread, 50, 2, 3), cd(f.spirits, 'uncommon', p.greaterHealthPotion, 40, 1, 1),
    // Spirits — Large
    cd(f.spirits, 'rare', r.elderwoodLog, 70, 3, 5), cd(f.spirits, 'rare', r.starbloom, 70, 3, 5), cd(f.spirits, 'rare', d.spriteDust, 80, 5, 10), cd(f.spirits, 'rare', d.dryadThread, 60, 3, 5), cd(f.spirits, 'rare', p.greaterHealthPotion, 50, 1, 2), cd(f.spirits, 'rare', p.manaPotion3, 35, 1, 1),

    // Fae — Small
    cd(f.fae, 'common', r.elderwoodLog, 50, 1, 2), cd(f.fae, 'common', r.starbloom, 60, 1, 3), cd(f.fae, 'common', p.greaterHealthPotion, 20, 1, 1),
    // Fae — Medium
    cd(f.fae, 'uncommon', r.elderwoodLog, 50, 2, 3), cd(f.fae, 'uncommon', r.starbloom, 60, 2, 4), cd(f.fae, 'uncommon', d.pixieWing, 70, 3, 6), cd(f.fae, 'uncommon', d.faeSilk, 60, 2, 4), cd(f.fae, 'uncommon', p.greaterHealthPotion, 40, 1, 1),
    // Fae — Large
    cd(f.fae, 'rare', r.elderwoodLog, 60, 3, 4), cd(f.fae, 'rare', r.starbloom, 70, 3, 5), cd(f.fae, 'rare', d.pixieWing, 80, 5, 8), cd(f.fae, 'rare', d.faeSilk, 70, 4, 6), cd(f.fae, 'rare', p.greaterHealthPotion, 50, 1, 2), cd(f.fae, 'rare', p.manaPotion3, 35, 1, 1),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 3 — Deep Mines (Golems, Crawlers)
    // ══════════════════════════════════════════════════════════════════════

    // Golems (Mines) — Small
    cd(f.golems, 'common', r.ironOre, 80, 2, 4), cd(f.golems, 'common', r.glowcapMushroom, 30, 1, 1), cd(f.golems, 'common', p.greaterHealthPotion, 20, 1, 1),
    // Golems (Mines) — Medium
    cd(f.golems, 'uncommon', r.ironOre, 80, 3, 6), cd(f.golems, 'uncommon', r.glowcapMushroom, 40, 1, 2), cd(f.golems, 'uncommon', d.crystalShard, 70, 3, 5), cd(f.golems, 'uncommon', p.greaterHealthPotion, 40, 1, 1),
    // Golems (Mines) — Large
    cd(f.golems, 'rare', r.ironOre, 90, 5, 8), cd(f.golems, 'rare', r.glowcapMushroom, 50, 2, 3), cd(f.golems, 'rare', d.crystalShard, 80, 5, 8), cd(f.golems, 'rare', p.greaterHealthPotion, 50, 1, 2),

    // Crawlers — Small
    cd(f.crawlers, 'common', r.ironOre, 70, 2, 3), cd(f.crawlers, 'common', r.glowcapMushroom, 40, 1, 2), cd(f.crawlers, 'common', p.greaterHealthPotion, 20, 1, 1),
    // Crawlers — Medium
    cd(f.crawlers, 'uncommon', r.ironOre, 70, 2, 4), cd(f.crawlers, 'uncommon', r.glowcapMushroom, 40, 1, 2), cd(f.crawlers, 'uncommon', d.crawlerChitin, 70, 3, 6), cd(f.crawlers, 'uncommon', p.greaterHealthPotion, 40, 1, 1),
    // Crawlers — Large
    cd(f.crawlers, 'rare', r.ironOre, 80, 3, 6), cd(f.crawlers, 'rare', r.glowcapMushroom, 50, 2, 3), cd(f.crawlers, 'rare', d.crawlerChitin, 80, 5, 10), cd(f.crawlers, 'rare', p.greaterHealthPotion, 50, 1, 2),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 3 — Whispering Plains (Harpies)
    // ══════════════════════════════════════════════════════════════════════

    // Harpies — Small
    cd(f.harpies, 'common', r.sandstone, 50, 1, 2), cd(f.harpies, 'common', r.willowLog, 50, 1, 2), cd(f.harpies, 'common', r.windbloom, 50, 1, 2), cd(f.harpies, 'common', p.greaterHealthPotion, 20, 1, 1),
    // Harpies — Medium
    cd(f.harpies, 'uncommon', r.sandstone, 50, 2, 3), cd(f.harpies, 'uncommon', r.willowLog, 50, 2, 3), cd(f.harpies, 'uncommon', r.windbloom, 50, 2, 3), cd(f.harpies, 'uncommon', d.harpyFeather, 70, 3, 6), cd(f.harpies, 'uncommon', d.harpyTalon, 55, 2, 4), cd(f.harpies, 'uncommon', p.greaterHealthPotion, 40, 1, 1),
    // Harpies — Large
    cd(f.harpies, 'rare', r.sandstone, 60, 2, 4), cd(f.harpies, 'rare', r.willowLog, 60, 2, 4), cd(f.harpies, 'rare', r.windbloom, 60, 3, 4), cd(f.harpies, 'rare', d.harpyFeather, 80, 5, 8), cd(f.harpies, 'rare', d.harpyTalon, 65, 3, 5), cd(f.harpies, 'rare', p.greaterHealthPotion, 50, 1, 2),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 4 — Haunted Marsh (Undead, Swamp Beasts, Witches)
    // ══════════════════════════════════════════════════════════════════════

    // Undead (Marsh) — Small
    cd(f.undead, 'common', r.darkIronOre, 70, 2, 4), cd(f.undead, 'common', r.bogwoodLog, 50, 1, 3), cd(f.undead, 'common', r.gravemoss, 40, 1, 2), cd(f.undead, 'common', p.resistPotion, 20, 1, 1),
    // Undead — Medium
    cd(f.undead, 'uncommon', r.darkIronOre, 75, 3, 5), cd(f.undead, 'uncommon', r.bogwoodLog, 55, 2, 4), cd(f.undead, 'uncommon', r.gravemoss, 50, 2, 3), cd(f.undead, 'uncommon', d.boneFragment, 70, 3, 6), cd(f.undead, 'uncommon', d.wraithEssence, 55, 2, 3), cd(f.undead, 'uncommon', p.resistPotion, 40, 1, 1),
    // Undead — Large
    cd(f.undead, 'rare', r.darkIronOre, 85, 5, 8), cd(f.undead, 'rare', r.bogwoodLog, 65, 3, 5), cd(f.undead, 'rare', r.gravemoss, 60, 3, 4), cd(f.undead, 'rare', d.boneFragment, 80, 5, 10), cd(f.undead, 'rare', d.wraithEssence, 65, 3, 5), cd(f.undead, 'rare', p.resistPotion, 50, 1, 2),

    // Swamp Beasts — Small
    cd(f.swampBeasts, 'common', r.darkIronOre, 60, 1, 3), cd(f.swampBeasts, 'common', r.bogwoodLog, 50, 1, 2), cd(f.swampBeasts, 'common', r.gravemoss, 50, 1, 2), cd(f.swampBeasts, 'common', p.resistPotion, 20, 1, 1),
    // Swamp Beasts — Medium
    cd(f.swampBeasts, 'uncommon', r.darkIronOre, 65, 2, 4), cd(f.swampBeasts, 'uncommon', r.bogwoodLog, 55, 2, 3), cd(f.swampBeasts, 'uncommon', r.gravemoss, 50, 2, 3), cd(f.swampBeasts, 'uncommon', d.hydraScale, 65, 2, 4), cd(f.swampBeasts, 'uncommon', d.bogHeart, 55, 2, 3), cd(f.swampBeasts, 'uncommon', p.resistPotion, 40, 1, 1),
    // Swamp Beasts — Large
    cd(f.swampBeasts, 'rare', r.darkIronOre, 75, 3, 6), cd(f.swampBeasts, 'rare', r.bogwoodLog, 65, 3, 5), cd(f.swampBeasts, 'rare', r.gravemoss, 60, 3, 4), cd(f.swampBeasts, 'rare', d.hydraScale, 75, 4, 6), cd(f.swampBeasts, 'rare', d.bogHeart, 65, 3, 5), cd(f.swampBeasts, 'rare', p.resistPotion, 50, 1, 2),

    // Witches — Small
    cd(f.witches, 'common', r.darkIronOre, 50, 1, 2), cd(f.witches, 'common', r.bogwoodLog, 50, 1, 2), cd(f.witches, 'common', r.gravemoss, 60, 1, 3), cd(f.witches, 'common', p.resistPotion, 20, 1, 1),
    // Witches — Medium
    cd(f.witches, 'uncommon', r.darkIronOre, 55, 2, 3), cd(f.witches, 'uncommon', r.bogwoodLog, 55, 2, 3), cd(f.witches, 'uncommon', r.gravemoss, 60, 2, 4), cd(f.witches, 'uncommon', d.witchCloth, 65, 3, 5), cd(f.witches, 'uncommon', d.bogHeart, 55, 2, 3), cd(f.witches, 'uncommon', p.resistPotion, 40, 1, 1),
    // Witches — Large
    cd(f.witches, 'rare', r.darkIronOre, 65, 3, 5), cd(f.witches, 'rare', r.bogwoodLog, 65, 3, 4), cd(f.witches, 'rare', r.gravemoss, 70, 3, 5), cd(f.witches, 'rare', d.witchCloth, 75, 4, 7), cd(f.witches, 'rare', d.bogHeart, 65, 3, 5), cd(f.witches, 'rare', p.resistPotion, 50, 1, 2),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 4 — Crystal Caverns (Elementals)
    // ══════════════════════════════════════════════════════════════════════

    // Elementals — Small
    cd(f.elementals, 'common', r.mithrilOre, 60, 1, 3), cd(f.elementals, 'common', r.crystalWood, 50, 1, 2), cd(f.elementals, 'common', r.shimmerFern, 50, 1, 2), cd(f.elementals, 'common', p.manaPotion, 20, 1, 1),
    // Elementals — Medium
    cd(f.elementals, 'uncommon', r.mithrilOre, 65, 2, 4), cd(f.elementals, 'uncommon', r.crystalWood, 55, 2, 3), cd(f.elementals, 'uncommon', r.shimmerFern, 55, 2, 3), cd(f.elementals, 'uncommon', d.darkCrystal, 70, 3, 6), cd(f.elementals, 'uncommon', p.manaPotion, 40, 1, 1),
    // Elementals — Large
    cd(f.elementals, 'rare', r.mithrilOre, 75, 3, 6), cd(f.elementals, 'rare', r.crystalWood, 65, 3, 5), cd(f.elementals, 'rare', r.shimmerFern, 65, 3, 4), cd(f.elementals, 'rare', d.darkCrystal, 80, 5, 10), cd(f.elementals, 'rare', p.manaPotion, 50, 1, 2),

    // ══════════════════════════════════════════════════════════════════════
    // TIER 5 — Sunken Ruins (Serpents, Abominations)
    // ══════════════════════════════════════════════════════════════════════

    // Serpents — Small
    cd(f.serpents, 'common', r.ancientOre, 60, 1, 3), cd(f.serpents, 'common', r.petrifiedWood, 50, 1, 2), cd(f.serpents, 'common', r.abyssalKelp, 50, 1, 2), cd(f.serpents, 'common', p.elixirOfPower, 15, 1, 1),
    // Serpents — Medium
    cd(f.serpents, 'uncommon', r.ancientOre, 65, 2, 4), cd(f.serpents, 'uncommon', r.petrifiedWood, 50, 2, 3), cd(f.serpents, 'uncommon', r.abyssalKelp, 55, 2, 3), cd(f.serpents, 'uncommon', d.nagaScale, 65, 3, 5), cd(f.serpents, 'uncommon', d.nagaPearl, 45, 1, 2), cd(f.serpents, 'uncommon', d.ancientRelic, 15, 1, 1), cd(f.serpents, 'uncommon', p.elixirOfPower, 30, 1, 1),
    // Serpents — Large
    cd(f.serpents, 'rare', r.ancientOre, 75, 3, 6), cd(f.serpents, 'rare', r.petrifiedWood, 60, 3, 4), cd(f.serpents, 'rare', r.abyssalKelp, 65, 3, 5), cd(f.serpents, 'rare', d.nagaScale, 75, 4, 7), cd(f.serpents, 'rare', d.nagaPearl, 60, 2, 4), cd(f.serpents, 'rare', d.ancientRelic, 30, 1, 2), cd(f.serpents, 'rare', p.elixirOfPower, 45, 1, 2),

    // Abominations — Small
    cd(f.abominations, 'common', r.ancientOre, 60, 1, 3), cd(f.abominations, 'common', r.petrifiedWood, 40, 1, 2), cd(f.abominations, 'common', r.abyssalKelp, 50, 1, 2), cd(f.abominations, 'common', p.elixirOfPower, 15, 1, 1),
    // Abominations — Medium
    cd(f.abominations, 'uncommon', r.ancientOre, 60, 2, 4), cd(f.abominations, 'uncommon', r.petrifiedWood, 45, 2, 3), cd(f.abominations, 'uncommon', r.abyssalKelp, 55, 2, 3), cd(f.abominations, 'uncommon', d.eldritchFragment, 65, 2, 4), cd(f.abominations, 'uncommon', d.oozeResidue, 55, 2, 4), cd(f.abominations, 'uncommon', d.ancientRelic, 15, 1, 1), cd(f.abominations, 'uncommon', p.elixirOfPower, 30, 1, 1),
    // Abominations — Large
    cd(f.abominations, 'rare', r.ancientOre, 70, 3, 5), cd(f.abominations, 'rare', r.petrifiedWood, 55, 2, 4), cd(f.abominations, 'rare', r.abyssalKelp, 65, 3, 4), cd(f.abominations, 'rare', d.eldritchFragment, 75, 4, 7), cd(f.abominations, 'rare', d.oozeResidue, 65, 4, 6), cd(f.abominations, 'rare', d.ancientRelic, 30, 1, 2), cd(f.abominations, 'rare', p.elixirOfPower, 45, 1, 2),
  ];
}
