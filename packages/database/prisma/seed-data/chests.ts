import { randomUUID } from 'crypto';
import { IDS } from './ids';

const r = IDS.res;
const d = IDS.drop;
const p = IDS.pots;
const z = IDS.zones;

// Helper: chest drop row
function cd(familyId: string, rarity: string, itemId: string, chancePct: number, min: number, max: number, zoneId: string | null = null) {
  return { id: randomUUID(), mobFamilyId: familyId, zoneId, chestRarity: rarity, itemTemplateId: itemId, dropChance: chancePct / 100, minQuantity: min, maxQuantity: max };
}

const f = IDS.families;

export function getAllChestDropTables() {
  const rows = [
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
    cd(f.bats, 'uncommon', r.tinOre, 60, 2, 4), cd(f.bats, 'uncommon', r.fungalWood, 50, 2, 3), cd(f.bats, 'uncommon', r.caveMoss, 50, 2, 3), cd(f.bats, 'uncommon', d.batWing, 70, 3, 6), cd(f.bats, 'uncommon', p.healthPotion, 40, 1, 1),
    // Bats — Large
    cd(f.bats, 'rare', r.tinOre, 70, 3, 5), cd(f.bats, 'rare', r.fungalWood, 60, 3, 4), cd(f.bats, 'rare', r.caveMoss, 60, 3, 4), cd(f.bats, 'rare', d.batWing, 80, 5, 8), cd(f.bats, 'rare', p.healthPotion, 50, 1, 2),

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
    cd(f.serpents, 'uncommon', r.ancientOre, 65, 2, 4), cd(f.serpents, 'uncommon', r.petrifiedWood, 50, 2, 3), cd(f.serpents, 'uncommon', r.abyssalKelp, 55, 2, 3), cd(f.serpents, 'uncommon', d.nagaScale, 65, 3, 5), cd(f.serpents, 'uncommon', d.nagaPearl, 45, 1, 2), cd(f.serpents, 'uncommon', p.elixirOfPower, 30, 1, 1),
    // Serpents — Large
    cd(f.serpents, 'rare', r.ancientOre, 75, 3, 6), cd(f.serpents, 'rare', r.petrifiedWood, 60, 3, 4), cd(f.serpents, 'rare', r.abyssalKelp, 65, 3, 5), cd(f.serpents, 'rare', d.nagaScale, 75, 4, 7), cd(f.serpents, 'rare', d.nagaPearl, 60, 2, 4), cd(f.serpents, 'rare', p.elixirOfPower, 45, 1, 2),

    // Abominations — Small
    cd(f.abominations, 'common', r.ancientOre, 60, 1, 3), cd(f.abominations, 'common', r.petrifiedWood, 40, 1, 2), cd(f.abominations, 'common', r.abyssalKelp, 50, 1, 2), cd(f.abominations, 'common', p.elixirOfPower, 15, 1, 1),
    // Abominations — Medium
    cd(f.abominations, 'uncommon', r.ancientOre, 60, 2, 4), cd(f.abominations, 'uncommon', r.petrifiedWood, 45, 2, 3), cd(f.abominations, 'uncommon', r.abyssalKelp, 55, 2, 3), cd(f.abominations, 'uncommon', d.eldritchFragment, 65, 2, 4), cd(f.abominations, 'uncommon', p.elixirOfPower, 30, 1, 1),
    // Abominations — Large
    cd(f.abominations, 'rare', r.ancientOre, 70, 3, 5), cd(f.abominations, 'rare', r.petrifiedWood, 55, 2, 4), cd(f.abominations, 'rare', r.abyssalKelp, 65, 3, 4), cd(f.abominations, 'rare', d.eldritchFragment, 75, 4, 7), cd(f.abominations, 'rare', p.elixirOfPower, 45, 1, 2),

    // ══════════════════════════════════════════════════════════════════════
    // EPIC DROP TABLES (4+ rooms)
    // ══════════════════════════════════════════════════════════════════════

    // Vermin — Epic
    cd(f.vermin, 'epic', r.copperOre, 95, 6, 10), cd(f.vermin, 'epic', r.oakLog, 80, 4, 8), cd(f.vermin, 'epic', r.forestSage, 70, 4, 6), cd(f.vermin, 'epic', d.ratTail, 90, 6, 10), cd(f.vermin, 'epic', d.ratPelt, 80, 5, 8), cd(f.vermin, 'epic', p.minorHealthPotion, 70, 3, 5),

    // Spiders — Epic
    cd(f.spiders, 'epic', r.copperOre, 90, 4, 8), cd(f.spiders, 'epic', r.oakLog, 70, 4, 6), cd(f.spiders, 'epic', r.forestSage, 80, 4, 7), cd(f.spiders, 'epic', d.spiderSilk, 95, 7, 14), cd(f.spiders, 'epic', p.minorHealthPotion, 70, 3, 5),

    // Boars — Epic
    cd(f.boars, 'epic', r.copperOre, 95, 5, 10), cd(f.boars, 'epic', r.oakLog, 80, 4, 7), cd(f.boars, 'epic', r.forestSage, 60, 3, 6), cd(f.boars, 'epic', d.boarTusk, 90, 6, 10), cd(f.boars, 'epic', d.boarHide, 80, 5, 8), cd(f.boars, 'epic', p.minorHealthPotion, 70, 3, 5),

    // Wolves — Epic
    cd(f.wolves, 'epic', r.tinOre, 90, 5, 9), cd(f.wolves, 'epic', r.mapleLog, 80, 4, 7), cd(f.wolves, 'epic', r.moonpetal, 70, 4, 6), cd(f.wolves, 'epic', d.wolfFang, 90, 6, 10), cd(f.wolves, 'epic', d.wolfPelt, 80, 5, 8), cd(f.wolves, 'epic', p.healthPotion, 60, 2, 4),

    // Bandits — Epic
    cd(f.bandits, 'epic', r.tinOre, 80, 4, 7), cd(f.bandits, 'epic', r.mapleLog, 70, 3, 6), cd(f.bandits, 'epic', r.moonpetal, 60, 3, 5), cd(f.bandits, 'epic', d.stolenCoin, 95, 7, 14), cd(f.bandits, 'epic', d.crudeGemstone, 75, 3, 6), cd(f.bandits, 'epic', d.banditCloth, 75, 4, 7), cd(f.bandits, 'epic', p.healthPotion, 60, 2, 4),

    // Treants — Epic
    cd(f.treants, 'epic', r.tinOre, 80, 4, 7), cd(f.treants, 'epic', r.mapleLog, 95, 5, 10), cd(f.treants, 'epic', r.moonpetal, 70, 4, 6), cd(f.treants, 'epic', d.ancientBark, 90, 6, 12), cd(f.treants, 'epic', p.healthPotion, 60, 2, 4), cd(f.treants, 'epic', p.manaPotion2, 40, 2, 3),

    // Bats — Epic
    cd(f.bats, 'epic', r.tinOre, 80, 4, 7), cd(f.bats, 'epic', r.fungalWood, 70, 4, 6), cd(f.bats, 'epic', r.caveMoss, 70, 4, 6), cd(f.bats, 'epic', d.batWing, 90, 6, 10), cd(f.bats, 'epic', p.healthPotion, 60, 2, 4),

    // Goblins — Epic
    cd(f.goblins, 'epic', r.tinOre, 90, 4, 8), cd(f.goblins, 'epic', r.fungalWood, 60, 3, 6), cd(f.goblins, 'epic', r.caveMoss, 60, 3, 5), cd(f.goblins, 'epic', d.stolenCoin, 95, 7, 14), cd(f.goblins, 'epic', d.crudeGemstone, 75, 3, 6), cd(f.goblins, 'epic', d.goblinRag, 70, 4, 7), cd(f.goblins, 'epic', p.healthPotion, 60, 2, 4), cd(f.goblins, 'epic', p.manaPotion2, 40, 2, 3),

    // Spirits — Epic
    cd(f.spirits, 'epic', r.elderwoodLog, 80, 4, 7), cd(f.spirits, 'epic', r.starbloom, 80, 4, 7), cd(f.spirits, 'epic', d.spriteDust, 90, 6, 12), cd(f.spirits, 'epic', d.dryadThread, 70, 4, 7), cd(f.spirits, 'epic', p.greaterHealthPotion, 60, 2, 4), cd(f.spirits, 'epic', p.manaPotion3, 45, 2, 3),

    // Fae — Epic
    cd(f.fae, 'epic', r.elderwoodLog, 70, 4, 6), cd(f.fae, 'epic', r.starbloom, 80, 4, 7), cd(f.fae, 'epic', d.pixieWing, 90, 6, 10), cd(f.fae, 'epic', d.faeSilk, 80, 5, 8), cd(f.fae, 'epic', p.greaterHealthPotion, 60, 2, 4), cd(f.fae, 'epic', p.manaPotion3, 45, 2, 3),

    // Golems — Epic
    cd(f.golems, 'epic', r.ironOre, 95, 6, 10), cd(f.golems, 'epic', r.glowcapMushroom, 60, 3, 5), cd(f.golems, 'epic', d.crystalShard, 90, 6, 10), cd(f.golems, 'epic', p.greaterHealthPotion, 60, 2, 4),

    // Crawlers — Epic
    cd(f.crawlers, 'epic', r.ironOre, 90, 4, 8), cd(f.crawlers, 'epic', r.glowcapMushroom, 60, 3, 5), cd(f.crawlers, 'epic', d.crawlerChitin, 90, 6, 12), cd(f.crawlers, 'epic', p.greaterHealthPotion, 60, 2, 4),

    // Harpies — Epic
    cd(f.harpies, 'epic', r.sandstone, 70, 3, 6), cd(f.harpies, 'epic', r.willowLog, 70, 3, 6), cd(f.harpies, 'epic', r.windbloom, 70, 4, 6), cd(f.harpies, 'epic', d.harpyFeather, 90, 6, 10), cd(f.harpies, 'epic', d.harpyTalon, 75, 4, 7), cd(f.harpies, 'epic', p.greaterHealthPotion, 60, 2, 4),

    // Undead — Epic
    cd(f.undead, 'epic', r.darkIronOre, 95, 6, 10), cd(f.undead, 'epic', r.bogwoodLog, 75, 4, 7), cd(f.undead, 'epic', r.gravemoss, 70, 4, 6), cd(f.undead, 'epic', d.boneFragment, 90, 6, 12), cd(f.undead, 'epic', d.wraithEssence, 75, 4, 7), cd(f.undead, 'epic', p.resistPotion, 60, 2, 4),

    // Swamp Beasts — Epic
    cd(f.swampBeasts, 'epic', r.darkIronOre, 85, 4, 8), cd(f.swampBeasts, 'epic', r.bogwoodLog, 75, 4, 7), cd(f.swampBeasts, 'epic', r.gravemoss, 70, 4, 6), cd(f.swampBeasts, 'epic', d.hydraScale, 85, 5, 8), cd(f.swampBeasts, 'epic', d.bogHeart, 75, 4, 7), cd(f.swampBeasts, 'epic', p.resistPotion, 60, 2, 4),

    // Witches — Epic
    cd(f.witches, 'epic', r.darkIronOre, 75, 4, 7), cd(f.witches, 'epic', r.bogwoodLog, 75, 4, 6), cd(f.witches, 'epic', r.gravemoss, 80, 4, 7), cd(f.witches, 'epic', d.witchCloth, 85, 5, 9), cd(f.witches, 'epic', d.bogHeart, 75, 4, 7), cd(f.witches, 'epic', p.resistPotion, 60, 2, 4),

    // Elementals — Epic
    cd(f.elementals, 'epic', r.mithrilOre, 85, 4, 8), cd(f.elementals, 'epic', r.crystalWood, 75, 4, 7), cd(f.elementals, 'epic', r.shimmerFern, 75, 4, 6), cd(f.elementals, 'epic', d.darkCrystal, 90, 6, 12), cd(f.elementals, 'epic', p.manaPotion, 60, 2, 4),

    // Serpents — Epic
    cd(f.serpents, 'epic', r.ancientOre, 85, 4, 8), cd(f.serpents, 'epic', r.petrifiedWood, 70, 4, 6), cd(f.serpents, 'epic', r.abyssalKelp, 75, 4, 7), cd(f.serpents, 'epic', d.nagaScale, 85, 5, 9), cd(f.serpents, 'epic', d.nagaPearl, 70, 3, 6), cd(f.serpents, 'epic', p.elixirOfPower, 55, 2, 4),

    // Abominations — Epic
    cd(f.abominations, 'epic', r.ancientOre, 80, 4, 7), cd(f.abominations, 'epic', r.petrifiedWood, 65, 3, 6), cd(f.abominations, 'epic', r.abyssalKelp, 75, 4, 6), cd(f.abominations, 'epic', d.eldritchFragment, 85, 5, 9), cd(f.abominations, 'epic', p.elixirOfPower, 55, 2, 4),

    // ══════════════════════════════════════════════════════════════════════
    // LEGENDARY DROP TABLES (5+ rooms)
    // ══════════════════════════════════════════════════════════════════════

    // Vermin — Legendary
    cd(f.vermin, 'legendary', r.copperOre, 95, 7, 12), cd(f.vermin, 'legendary', r.oakLog, 85, 5, 10), cd(f.vermin, 'legendary', r.forestSage, 75, 5, 8), cd(f.vermin, 'legendary', d.ratTail, 95, 7, 12), cd(f.vermin, 'legendary', d.ratPelt, 85, 6, 10), cd(f.vermin, 'legendary', p.minorHealthPotion, 75, 4, 7),

    // Spiders — Legendary
    cd(f.spiders, 'legendary', r.copperOre, 95, 5, 10), cd(f.spiders, 'legendary', r.oakLog, 75, 5, 8), cd(f.spiders, 'legendary', r.forestSage, 85, 5, 9), cd(f.spiders, 'legendary', d.spiderSilk, 95, 8, 16), cd(f.spiders, 'legendary', p.minorHealthPotion, 75, 4, 7),

    // Boars — Legendary
    cd(f.boars, 'legendary', r.copperOre, 95, 6, 12), cd(f.boars, 'legendary', r.oakLog, 85, 5, 9), cd(f.boars, 'legendary', r.forestSage, 65, 4, 8), cd(f.boars, 'legendary', d.boarTusk, 95, 7, 12), cd(f.boars, 'legendary', d.boarHide, 85, 6, 10), cd(f.boars, 'legendary', p.minorHealthPotion, 75, 4, 7),

    // Wolves — Legendary
    cd(f.wolves, 'legendary', r.tinOre, 95, 6, 11), cd(f.wolves, 'legendary', r.mapleLog, 85, 5, 9), cd(f.wolves, 'legendary', r.moonpetal, 75, 5, 8), cd(f.wolves, 'legendary', d.wolfFang, 95, 7, 12), cd(f.wolves, 'legendary', d.wolfPelt, 85, 6, 10), cd(f.wolves, 'legendary', p.healthPotion, 65, 3, 6),

    // Bandits — Legendary
    cd(f.bandits, 'legendary', r.tinOre, 85, 5, 9), cd(f.bandits, 'legendary', r.mapleLog, 75, 4, 8), cd(f.bandits, 'legendary', r.moonpetal, 65, 4, 7), cd(f.bandits, 'legendary', d.stolenCoin, 95, 8, 16), cd(f.bandits, 'legendary', d.crudeGemstone, 80, 4, 8), cd(f.bandits, 'legendary', d.banditCloth, 80, 5, 9), cd(f.bandits, 'legendary', p.healthPotion, 65, 3, 6),

    // Treants — Legendary
    cd(f.treants, 'legendary', r.tinOre, 85, 5, 9), cd(f.treants, 'legendary', r.mapleLog, 95, 6, 12), cd(f.treants, 'legendary', r.moonpetal, 75, 5, 8), cd(f.treants, 'legendary', d.ancientBark, 95, 7, 14), cd(f.treants, 'legendary', p.healthPotion, 65, 3, 6), cd(f.treants, 'legendary', p.manaPotion2, 45, 3, 5),

    // Bats — Legendary
    cd(f.bats, 'legendary', r.tinOre, 85, 5, 9), cd(f.bats, 'legendary', r.fungalWood, 75, 5, 8), cd(f.bats, 'legendary', r.caveMoss, 75, 5, 8), cd(f.bats, 'legendary', d.batWing, 95, 7, 12), cd(f.bats, 'legendary', p.healthPotion, 65, 3, 6),

    // Goblins — Legendary
    cd(f.goblins, 'legendary', r.tinOre, 95, 5, 10), cd(f.goblins, 'legendary', r.fungalWood, 65, 4, 8), cd(f.goblins, 'legendary', r.caveMoss, 65, 4, 7), cd(f.goblins, 'legendary', d.stolenCoin, 95, 8, 16), cd(f.goblins, 'legendary', d.crudeGemstone, 80, 4, 8), cd(f.goblins, 'legendary', d.goblinRag, 75, 5, 9), cd(f.goblins, 'legendary', p.healthPotion, 65, 3, 6), cd(f.goblins, 'legendary', p.manaPotion2, 45, 3, 5),

    // Spirits — Legendary
    cd(f.spirits, 'legendary', r.elderwoodLog, 85, 5, 9), cd(f.spirits, 'legendary', r.starbloom, 85, 5, 9), cd(f.spirits, 'legendary', d.spriteDust, 95, 7, 14), cd(f.spirits, 'legendary', d.dryadThread, 75, 5, 9), cd(f.spirits, 'legendary', p.greaterHealthPotion, 65, 3, 6), cd(f.spirits, 'legendary', p.manaPotion3, 50, 3, 5),

    // Fae — Legendary
    cd(f.fae, 'legendary', r.elderwoodLog, 75, 5, 8), cd(f.fae, 'legendary', r.starbloom, 85, 5, 9), cd(f.fae, 'legendary', d.pixieWing, 95, 7, 12), cd(f.fae, 'legendary', d.faeSilk, 85, 6, 10), cd(f.fae, 'legendary', p.greaterHealthPotion, 65, 3, 6), cd(f.fae, 'legendary', p.manaPotion3, 50, 3, 5),

    // Golems — Legendary
    cd(f.golems, 'legendary', r.ironOre, 95, 7, 12), cd(f.golems, 'legendary', r.glowcapMushroom, 65, 4, 7), cd(f.golems, 'legendary', d.crystalShard, 95, 7, 12), cd(f.golems, 'legendary', p.greaterHealthPotion, 65, 3, 6),

    // Crawlers — Legendary
    cd(f.crawlers, 'legendary', r.ironOre, 95, 5, 10), cd(f.crawlers, 'legendary', r.glowcapMushroom, 65, 4, 7), cd(f.crawlers, 'legendary', d.crawlerChitin, 95, 7, 14), cd(f.crawlers, 'legendary', p.greaterHealthPotion, 65, 3, 6),

    // Harpies — Legendary
    cd(f.harpies, 'legendary', r.sandstone, 75, 4, 8), cd(f.harpies, 'legendary', r.willowLog, 75, 4, 8), cd(f.harpies, 'legendary', r.windbloom, 75, 5, 8), cd(f.harpies, 'legendary', d.harpyFeather, 95, 7, 12), cd(f.harpies, 'legendary', d.harpyTalon, 80, 5, 9), cd(f.harpies, 'legendary', p.greaterHealthPotion, 65, 3, 6),

    // Undead — Legendary
    cd(f.undead, 'legendary', r.darkIronOre, 95, 7, 12), cd(f.undead, 'legendary', r.bogwoodLog, 80, 5, 9), cd(f.undead, 'legendary', r.gravemoss, 75, 5, 8), cd(f.undead, 'legendary', d.boneFragment, 95, 7, 14), cd(f.undead, 'legendary', d.wraithEssence, 80, 5, 9), cd(f.undead, 'legendary', p.resistPotion, 65, 3, 6),

    // Swamp Beasts — Legendary
    cd(f.swampBeasts, 'legendary', r.darkIronOre, 90, 5, 10), cd(f.swampBeasts, 'legendary', r.bogwoodLog, 80, 5, 9), cd(f.swampBeasts, 'legendary', r.gravemoss, 75, 5, 8), cd(f.swampBeasts, 'legendary', d.hydraScale, 90, 6, 10), cd(f.swampBeasts, 'legendary', d.bogHeart, 80, 5, 9), cd(f.swampBeasts, 'legendary', p.resistPotion, 65, 3, 6),

    // Witches — Legendary
    cd(f.witches, 'legendary', r.darkIronOre, 80, 5, 9), cd(f.witches, 'legendary', r.bogwoodLog, 80, 5, 8), cd(f.witches, 'legendary', r.gravemoss, 85, 5, 9), cd(f.witches, 'legendary', d.witchCloth, 90, 6, 11), cd(f.witches, 'legendary', d.bogHeart, 80, 5, 9), cd(f.witches, 'legendary', p.resistPotion, 65, 3, 6),

    // Elementals — Legendary
    cd(f.elementals, 'legendary', r.mithrilOre, 90, 5, 10), cd(f.elementals, 'legendary', r.crystalWood, 80, 5, 9), cd(f.elementals, 'legendary', r.shimmerFern, 80, 5, 8), cd(f.elementals, 'legendary', d.darkCrystal, 95, 7, 14), cd(f.elementals, 'legendary', p.manaPotion, 65, 3, 6),

    // Serpents — Legendary
    cd(f.serpents, 'legendary', r.ancientOre, 90, 5, 10), cd(f.serpents, 'legendary', r.petrifiedWood, 75, 5, 8), cd(f.serpents, 'legendary', r.abyssalKelp, 80, 5, 9), cd(f.serpents, 'legendary', d.nagaScale, 90, 6, 11), cd(f.serpents, 'legendary', d.nagaPearl, 75, 4, 8), cd(f.serpents, 'legendary', p.elixirOfPower, 60, 3, 6),

    // Abominations — Legendary
    cd(f.abominations, 'legendary', r.ancientOre, 85, 5, 9), cd(f.abominations, 'legendary', r.petrifiedWood, 70, 4, 8), cd(f.abominations, 'legendary', r.abyssalKelp, 80, 5, 8), cd(f.abominations, 'legendary', d.eldritchFragment, 90, 6, 11), cd(f.abominations, 'legendary', p.elixirOfPower, 60, 3, 6),

    // ══════════════════════════════════════════════════════════════════════
    // ZONE-SPECIFIC CRAFTING ALIGNMENT TABLES
    // ══════════════════════════════════════════════════════════════════════

    // Bandits — Deep Forest: Bandit Cloth first, Stolen Coin secondary
    cd(f.bandits, 'common', d.banditCloth, 100, 3, 5, z.deepForest), cd(f.bandits, 'common', d.stolenCoin, 25, 1, 2, z.deepForest), cd(f.bandits, 'common', d.crudeGemstone, 15, 1, 1, z.deepForest), cd(f.bandits, 'common', p.healthPotion, 20, 1, 1, z.deepForest),
    cd(f.bandits, 'uncommon', d.banditCloth, 95, 5, 8, z.deepForest), cd(f.bandits, 'uncommon', d.stolenCoin, 30, 2, 4, z.deepForest), cd(f.bandits, 'uncommon', d.crudeGemstone, 45, 1, 2, z.deepForest), cd(f.bandits, 'uncommon', p.healthPotion, 35, 1, 1, z.deepForest),
    cd(f.bandits, 'rare', d.banditCloth, 95, 8, 14, z.deepForest), cd(f.bandits, 'rare', d.stolenCoin, 35, 3, 7, z.deepForest), cd(f.bandits, 'rare', d.crudeGemstone, 55, 2, 4, z.deepForest), cd(f.bandits, 'rare', p.healthPotion, 45, 1, 2, z.deepForest),
    cd(f.bandits, 'epic', d.banditCloth, 100, 12, 18, z.deepForest), cd(f.bandits, 'epic', d.stolenCoin, 40, 4, 8, z.deepForest), cd(f.bandits, 'epic', d.crudeGemstone, 65, 3, 5, z.deepForest), cd(f.bandits, 'epic', p.healthPotion, 55, 2, 3, z.deepForest),
    cd(f.bandits, 'legendary', d.banditCloth, 100, 15, 22, z.deepForest), cd(f.bandits, 'legendary', d.stolenCoin, 45, 5, 10, z.deepForest), cd(f.bandits, 'legendary', d.crudeGemstone, 70, 4, 7, z.deepForest), cd(f.bandits, 'legendary', p.healthPotion, 60, 3, 5, z.deepForest),

    // Bandits — Whispering Plains
    cd(f.bandits, 'common', d.banditCloth, 100, 3, 5, z.whisperingPlains), cd(f.bandits, 'common', d.stolenCoin, 30, 1, 3, z.whisperingPlains), cd(f.bandits, 'common', d.crudeGemstone, 15, 1, 1, z.whisperingPlains), cd(f.bandits, 'common', p.healthPotion, 20, 1, 1, z.whisperingPlains),
    cd(f.bandits, 'uncommon', d.banditCloth, 95, 5, 9, z.whisperingPlains), cd(f.bandits, 'uncommon', d.stolenCoin, 35, 2, 5, z.whisperingPlains), cd(f.bandits, 'uncommon', d.crudeGemstone, 45, 1, 3, z.whisperingPlains), cd(f.bandits, 'uncommon', p.healthPotion, 35, 1, 1, z.whisperingPlains),
    cd(f.bandits, 'rare', d.banditCloth, 95, 9, 15, z.whisperingPlains), cd(f.bandits, 'rare', d.stolenCoin, 40, 3, 7, z.whisperingPlains), cd(f.bandits, 'rare', d.crudeGemstone, 55, 2, 4, z.whisperingPlains), cd(f.bandits, 'rare', p.healthPotion, 45, 1, 2, z.whisperingPlains),
    cd(f.bandits, 'epic', d.banditCloth, 100, 12, 19, z.whisperingPlains), cd(f.bandits, 'epic', d.stolenCoin, 45, 4, 8, z.whisperingPlains), cd(f.bandits, 'epic', d.crudeGemstone, 65, 3, 5, z.whisperingPlains), cd(f.bandits, 'epic', p.healthPotion, 55, 2, 3, z.whisperingPlains),
    cd(f.bandits, 'legendary', d.banditCloth, 100, 16, 24, z.whisperingPlains), cd(f.bandits, 'legendary', d.stolenCoin, 50, 5, 10, z.whisperingPlains), cd(f.bandits, 'legendary', d.crudeGemstone, 70, 4, 7, z.whisperingPlains), cd(f.bandits, 'legendary', p.healthPotion, 60, 3, 5, z.whisperingPlains),

    // Wolves — Deep Forest stays Wolf Pelt focused
    cd(f.wolves, 'common', d.wolfPelt, 75, 2, 3, z.deepForest), cd(f.wolves, 'common', d.wolfFang, 45, 1, 2, z.deepForest), cd(f.wolves, 'common', p.healthPotion, 20, 1, 1, z.deepForest),
    cd(f.wolves, 'uncommon', d.wolfPelt, 85, 4, 6, z.deepForest), cd(f.wolves, 'uncommon', d.wolfFang, 65, 3, 5, z.deepForest), cd(f.wolves, 'uncommon', p.healthPotion, 35, 1, 1, z.deepForest),
    cd(f.wolves, 'rare', d.wolfPelt, 90, 6, 10, z.deepForest), cd(f.wolves, 'rare', d.wolfFang, 75, 4, 7, z.deepForest), cd(f.wolves, 'rare', p.healthPotion, 45, 1, 2, z.deepForest),
    cd(f.wolves, 'epic', d.wolfPelt, 95, 8, 14, z.deepForest), cd(f.wolves, 'epic', d.wolfFang, 85, 6, 10, z.deepForest), cd(f.wolves, 'epic', p.healthPotion, 55, 2, 3, z.deepForest),
    cd(f.wolves, 'legendary', d.wolfPelt, 100, 10, 16, z.deepForest), cd(f.wolves, 'legendary', d.wolfFang, 90, 7, 12, z.deepForest), cd(f.wolves, 'legendary', p.healthPotion, 60, 3, 5, z.deepForest),

    // Wolves — Whispering Plains shifts to Warg Hide
    cd(f.wolves, 'common', d.wargHide, 70, 2, 3, z.whisperingPlains), cd(f.wolves, 'common', d.wolfFang, 40, 1, 2, z.whisperingPlains), cd(f.wolves, 'common', d.wolfPelt, 25, 1, 2, z.whisperingPlains), cd(f.wolves, 'common', p.greaterHealthPotion, 15, 1, 1, z.whisperingPlains),
    cd(f.wolves, 'uncommon', d.wargHide, 85, 4, 6, z.whisperingPlains), cd(f.wolves, 'uncommon', d.wolfFang, 55, 2, 4, z.whisperingPlains), cd(f.wolves, 'uncommon', d.wolfPelt, 35, 2, 3, z.whisperingPlains), cd(f.wolves, 'uncommon', p.greaterHealthPotion, 30, 1, 1, z.whisperingPlains),
    cd(f.wolves, 'rare', d.wargHide, 95, 6, 10, z.whisperingPlains), cd(f.wolves, 'rare', d.wolfFang, 65, 3, 5, z.whisperingPlains), cd(f.wolves, 'rare', d.wolfPelt, 40, 3, 4, z.whisperingPlains), cd(f.wolves, 'rare', p.greaterHealthPotion, 40, 1, 2, z.whisperingPlains),
    cd(f.wolves, 'epic', d.wargHide, 100, 8, 14, z.whisperingPlains), cd(f.wolves, 'epic', d.wolfFang, 75, 4, 7, z.whisperingPlains), cd(f.wolves, 'epic', d.wolfPelt, 45, 4, 6, z.whisperingPlains), cd(f.wolves, 'epic', p.greaterHealthPotion, 50, 2, 3, z.whisperingPlains),
    cd(f.wolves, 'legendary', d.wargHide, 100, 10, 16, z.whisperingPlains), cd(f.wolves, 'legendary', d.wolfFang, 80, 5, 9, z.whisperingPlains), cd(f.wolves, 'legendary', d.wolfPelt, 50, 5, 8, z.whisperingPlains), cd(f.wolves, 'legendary', p.greaterHealthPotion, 55, 3, 5, z.whisperingPlains),

    // Fae — Fae Silk primary, Pixie Wing secondary
    cd(f.fae, 'common', d.faeSilk, 70, 2, 3, z.ancientGrove), cd(f.fae, 'common', d.pixieWing, 35, 1, 2, z.ancientGrove), cd(f.fae, 'common', p.greaterHealthPotion, 20, 1, 1, z.ancientGrove),
    cd(f.fae, 'uncommon', d.faeSilk, 85, 4, 7, z.ancientGrove), cd(f.fae, 'uncommon', d.pixieWing, 55, 2, 4, z.ancientGrove), cd(f.fae, 'uncommon', p.greaterHealthPotion, 35, 1, 1, z.ancientGrove), cd(f.fae, 'uncommon', p.manaPotion3, 25, 1, 1, z.ancientGrove),
    cd(f.fae, 'rare', d.faeSilk, 95, 6, 10, z.ancientGrove), cd(f.fae, 'rare', d.pixieWing, 65, 3, 5, z.ancientGrove), cd(f.fae, 'rare', p.greaterHealthPotion, 45, 1, 2, z.ancientGrove), cd(f.fae, 'rare', p.manaPotion3, 35, 1, 1, z.ancientGrove),
    cd(f.fae, 'epic', d.faeSilk, 100, 8, 14, z.ancientGrove), cd(f.fae, 'epic', d.pixieWing, 75, 4, 7, z.ancientGrove), cd(f.fae, 'epic', p.greaterHealthPotion, 55, 2, 3, z.ancientGrove), cd(f.fae, 'epic', p.manaPotion3, 45, 2, 3, z.ancientGrove),
    cd(f.fae, 'legendary', d.faeSilk, 100, 10, 16, z.ancientGrove), cd(f.fae, 'legendary', d.pixieWing, 80, 5, 9, z.ancientGrove), cd(f.fae, 'legendary', p.greaterHealthPotion, 60, 3, 5, z.ancientGrove), cd(f.fae, 'legendary', p.manaPotion3, 50, 3, 5, z.ancientGrove),

    // Undead — Haunted Marsh: Wraith Essence and Bone Fragment
    cd(f.undead, 'common', d.wraithEssence, 65, 2, 3, z.hauntedMarsh), cd(f.undead, 'common', d.boneFragment, 55, 2, 3, z.hauntedMarsh), cd(f.undead, 'common', p.resistPotion, 20, 1, 1, z.hauntedMarsh),
    cd(f.undead, 'uncommon', d.wraithEssence, 80, 4, 6, z.hauntedMarsh), cd(f.undead, 'uncommon', d.boneFragment, 75, 4, 7, z.hauntedMarsh), cd(f.undead, 'uncommon', p.resistPotion, 35, 1, 1, z.hauntedMarsh),
    cd(f.undead, 'rare', d.wraithEssence, 90, 6, 10, z.hauntedMarsh), cd(f.undead, 'rare', d.boneFragment, 85, 6, 10, z.hauntedMarsh), cd(f.undead, 'rare', p.resistPotion, 45, 1, 2, z.hauntedMarsh),
    cd(f.undead, 'epic', d.wraithEssence, 95, 8, 14, z.hauntedMarsh), cd(f.undead, 'epic', d.boneFragment, 90, 8, 14, z.hauntedMarsh), cd(f.undead, 'epic', p.resistPotion, 55, 2, 3, z.hauntedMarsh),
    cd(f.undead, 'legendary', d.wraithEssence, 100, 10, 16, z.hauntedMarsh), cd(f.undead, 'legendary', d.boneFragment, 95, 10, 16, z.hauntedMarsh), cd(f.undead, 'legendary', p.resistPotion, 60, 3, 5, z.hauntedMarsh),

    // Undead — Sunken Ruins: Spectral Silk and Lich Dust
    cd(f.undead, 'common', d.spectralSilk, 65, 2, 3, z.sunkenRuins), cd(f.undead, 'common', d.lichDust, 20, 1, 1, z.sunkenRuins), cd(f.undead, 'common', d.wraithEssence, 35, 1, 2, z.sunkenRuins), cd(f.undead, 'common', p.elixirOfPower, 15, 1, 1, z.sunkenRuins),
    cd(f.undead, 'uncommon', d.spectralSilk, 80, 4, 6, z.sunkenRuins), cd(f.undead, 'uncommon', d.lichDust, 35, 1, 2, z.sunkenRuins), cd(f.undead, 'uncommon', d.wraithEssence, 45, 2, 3, z.sunkenRuins), cd(f.undead, 'uncommon', p.elixirOfPower, 25, 1, 1, z.sunkenRuins),
    cd(f.undead, 'rare', d.spectralSilk, 90, 6, 10, z.sunkenRuins), cd(f.undead, 'rare', d.lichDust, 50, 2, 3, z.sunkenRuins), cd(f.undead, 'rare', d.wraithEssence, 55, 3, 5, z.sunkenRuins), cd(f.undead, 'rare', p.elixirOfPower, 35, 1, 2, z.sunkenRuins),
    cd(f.undead, 'epic', d.spectralSilk, 95, 8, 14, z.sunkenRuins), cd(f.undead, 'epic', d.lichDust, 65, 3, 5, z.sunkenRuins), cd(f.undead, 'epic', d.wraithEssence, 60, 4, 7, z.sunkenRuins), cd(f.undead, 'epic', p.elixirOfPower, 45, 2, 3, z.sunkenRuins),
    cd(f.undead, 'legendary', d.spectralSilk, 100, 10, 16, z.sunkenRuins), cd(f.undead, 'legendary', d.lichDust, 75, 4, 7, z.sunkenRuins), cd(f.undead, 'legendary', d.wraithEssence, 65, 5, 9, z.sunkenRuins), cd(f.undead, 'legendary', p.elixirOfPower, 55, 3, 5, z.sunkenRuins),

    // Swamp Beasts — Croc Hide at least equal to Hydra Scale
    cd(f.swampBeasts, 'common', d.crocHide, 70, 2, 3, z.hauntedMarsh), cd(f.swampBeasts, 'common', d.hydraScale, 40, 1, 2, z.hauntedMarsh), cd(f.swampBeasts, 'common', d.bogHeart, 25, 1, 1, z.hauntedMarsh), cd(f.swampBeasts, 'common', p.resistPotion, 20, 1, 1, z.hauntedMarsh),
    cd(f.swampBeasts, 'uncommon', d.crocHide, 85, 4, 6, z.hauntedMarsh), cd(f.swampBeasts, 'uncommon', d.hydraScale, 60, 2, 4, z.hauntedMarsh), cd(f.swampBeasts, 'uncommon', d.bogHeart, 45, 1, 3, z.hauntedMarsh), cd(f.swampBeasts, 'uncommon', p.resistPotion, 35, 1, 1, z.hauntedMarsh),
    cd(f.swampBeasts, 'rare', d.crocHide, 95, 6, 10, z.hauntedMarsh), cd(f.swampBeasts, 'rare', d.hydraScale, 75, 4, 6, z.hauntedMarsh), cd(f.swampBeasts, 'rare', d.bogHeart, 55, 2, 4, z.hauntedMarsh), cd(f.swampBeasts, 'rare', p.resistPotion, 45, 1, 2, z.hauntedMarsh),
    cd(f.swampBeasts, 'epic', d.crocHide, 100, 8, 14, z.hauntedMarsh), cd(f.swampBeasts, 'epic', d.hydraScale, 85, 5, 8, z.hauntedMarsh), cd(f.swampBeasts, 'epic', d.bogHeart, 65, 3, 5, z.hauntedMarsh), cd(f.swampBeasts, 'epic', p.resistPotion, 55, 2, 3, z.hauntedMarsh),
    cd(f.swampBeasts, 'legendary', d.crocHide, 100, 10, 16, z.hauntedMarsh), cd(f.swampBeasts, 'legendary', d.hydraScale, 90, 6, 10, z.hauntedMarsh), cd(f.swampBeasts, 'legendary', d.bogHeart, 70, 4, 7, z.hauntedMarsh), cd(f.swampBeasts, 'legendary', p.resistPotion, 60, 3, 5, z.hauntedMarsh),

    // Goblins — Crystal Caverns: Goblin Gold and Cut Gem
    cd(f.goblins, 'common', d.goblinGold, 60, 2, 3, z.crystalCaverns), cd(f.goblins, 'common', d.cutGem, 40, 1, 2, z.crystalCaverns), cd(f.goblins, 'common', d.crudeGemstone, 35, 1, 2, z.crystalCaverns), cd(f.goblins, 'common', r.mithrilOre, 35, 1, 2, z.crystalCaverns), cd(f.goblins, 'common', p.manaPotion, 15, 1, 1, z.crystalCaverns),
    cd(f.goblins, 'uncommon', d.goblinGold, 75, 4, 6, z.crystalCaverns), cd(f.goblins, 'uncommon', d.cutGem, 60, 2, 4, z.crystalCaverns), cd(f.goblins, 'uncommon', d.crudeGemstone, 45, 2, 3, z.crystalCaverns), cd(f.goblins, 'uncommon', r.mithrilOre, 50, 2, 4, z.crystalCaverns), cd(f.goblins, 'uncommon', p.manaPotion, 30, 1, 1, z.crystalCaverns),
    cd(f.goblins, 'rare', d.goblinGold, 85, 6, 10, z.crystalCaverns), cd(f.goblins, 'rare', d.cutGem, 75, 3, 5, z.crystalCaverns), cd(f.goblins, 'rare', d.crudeGemstone, 55, 3, 4, z.crystalCaverns), cd(f.goblins, 'rare', r.mithrilOre, 60, 3, 6, z.crystalCaverns), cd(f.goblins, 'rare', p.manaPotion, 40, 1, 2, z.crystalCaverns),
    cd(f.goblins, 'epic', d.goblinGold, 95, 8, 14, z.crystalCaverns), cd(f.goblins, 'epic', d.cutGem, 85, 4, 7, z.crystalCaverns), cd(f.goblins, 'epic', d.crudeGemstone, 60, 4, 6, z.crystalCaverns), cd(f.goblins, 'epic', r.mithrilOre, 70, 4, 8, z.crystalCaverns), cd(f.goblins, 'epic', p.manaPotion, 50, 2, 3, z.crystalCaverns),
    cd(f.goblins, 'legendary', d.goblinGold, 100, 10, 16, z.crystalCaverns), cd(f.goblins, 'legendary', d.cutGem, 90, 5, 9, z.crystalCaverns), cd(f.goblins, 'legendary', d.crudeGemstone, 65, 5, 8, z.crystalCaverns), cd(f.goblins, 'legendary', r.mithrilOre, 75, 5, 10, z.crystalCaverns), cd(f.goblins, 'legendary', p.manaPotion, 55, 3, 5, z.crystalCaverns),

    // Golems — Crystal Caverns: Dark Crystal and Cut Gem
    cd(f.golems, 'common', d.darkCrystal, 60, 2, 3, z.crystalCaverns), cd(f.golems, 'common', d.cutGem, 35, 1, 2, z.crystalCaverns), cd(f.golems, 'common', d.crystalShard, 35, 1, 2, z.crystalCaverns), cd(f.golems, 'common', r.mithrilOre, 45, 2, 3, z.crystalCaverns), cd(f.golems, 'common', p.manaPotion, 15, 1, 1, z.crystalCaverns),
    cd(f.golems, 'uncommon', d.darkCrystal, 75, 4, 6, z.crystalCaverns), cd(f.golems, 'uncommon', d.cutGem, 55, 2, 4, z.crystalCaverns), cd(f.golems, 'uncommon', d.crystalShard, 45, 2, 4, z.crystalCaverns), cd(f.golems, 'uncommon', r.mithrilOre, 65, 3, 6, z.crystalCaverns), cd(f.golems, 'uncommon', p.manaPotion, 30, 1, 1, z.crystalCaverns),
    cd(f.golems, 'rare', d.darkCrystal, 90, 6, 10, z.crystalCaverns), cd(f.golems, 'rare', d.cutGem, 70, 3, 5, z.crystalCaverns), cd(f.golems, 'rare', d.crystalShard, 50, 3, 5, z.crystalCaverns), cd(f.golems, 'rare', r.mithrilOre, 80, 5, 8, z.crystalCaverns), cd(f.golems, 'rare', p.manaPotion, 40, 1, 2, z.crystalCaverns),
    cd(f.golems, 'epic', d.darkCrystal, 100, 8, 14, z.crystalCaverns), cd(f.golems, 'epic', d.cutGem, 80, 4, 7, z.crystalCaverns), cd(f.golems, 'epic', d.crystalShard, 55, 4, 7, z.crystalCaverns), cd(f.golems, 'epic', r.mithrilOre, 90, 6, 10, z.crystalCaverns), cd(f.golems, 'epic', p.manaPotion, 50, 2, 3, z.crystalCaverns),
    cd(f.golems, 'legendary', d.darkCrystal, 100, 10, 16, z.crystalCaverns), cd(f.golems, 'legendary', d.cutGem, 85, 5, 9, z.crystalCaverns), cd(f.golems, 'legendary', d.crystalShard, 60, 5, 8, z.crystalCaverns), cd(f.golems, 'legendary', r.mithrilOre, 95, 7, 12, z.crystalCaverns), cd(f.golems, 'legendary', p.manaPotion, 55, 3, 5, z.crystalCaverns),
  ];

  return rows.filter(isAllowedChestDropTableRow);
}

type ChestDropTableSeedRow = ReturnType<typeof cd>;

const AMBIENT_CHEST_RESOURCE_IDS = new Set([
  r.copperOre,
  r.tinOre,
  r.ironOre,
  r.sandstone,
  r.darkIronOre,
  r.mithrilOre,
  r.ancientOre,
  r.oakLog,
  r.mapleLog,
  r.fungalWood,
  r.elderwoodLog,
  r.willowLog,
  r.bogwoodLog,
  r.crystalWood,
  r.petrifiedWood,
  r.forestSage,
  r.moonpetal,
  r.caveMoss,
  r.starbloom,
  r.glowcapMushroom,
  r.windbloom,
  r.gravemoss,
  r.shimmerFern,
  r.abyssalKelp,
]);

const ORE_RESOURCE_IDS = new Set([
  r.copperOre,
  r.tinOre,
  r.ironOre,
  r.darkIronOre,
  r.mithrilOre,
  r.ancientOre,
]);

const LOG_RESOURCE_IDS = new Set([
  r.oakLog,
  r.mapleLog,
  r.fungalWood,
  r.elderwoodLog,
  r.willowLog,
  r.bogwoodLog,
  r.crystalWood,
  r.petrifiedWood,
]);

const THEMATIC_AMBIENT_RESOURCE_IDS_BY_FAMILY = new Map<string, Set<string>>([
  [f.treants, LOG_RESOURCE_IDS],
  [f.golems, ORE_RESOURCE_IDS],
  [f.goblins, ORE_RESOURCE_IDS],
]);

function isAllowedChestDropTableRow(row: ChestDropTableSeedRow): boolean {
  if (!AMBIENT_CHEST_RESOURCE_IDS.has(row.itemTemplateId)) return true;
  return THEMATIC_AMBIENT_RESOURCE_IDS_BY_FAMILY.get(row.mobFamilyId)?.has(row.itemTemplateId) ?? false;
}
