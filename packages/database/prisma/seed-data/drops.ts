import { randomUUID } from 'crypto';
import { IDS } from './ids';

const m = IDS.mobs;
const r = IDS.res;
const d = IDS.drop;
const p = IDS.pots;
const g = IDS.gems;

// Helper: creates a drop table row { id, mobTemplateId, itemTemplateId, dropChance (decimal), minQuantity, maxQuantity }
function dr(mobId: string, itemId: string, chancePct: number, min: number, max: number) {
  return { id: randomUUID(), mobTemplateId: mobId, itemTemplateId: itemId, dropChance: chancePct / 100, minQuantity: min, maxQuantity: max };
}

export function getAllDropTables() {
  return [
    // ── Forest Edge ───────────────────────────────────────────────────────
    // Forest Rat
    dr(m.forestRat, d.ratTail, 60, 1, 2), dr(m.forestRat, d.ratPelt, 40, 1, 1), dr(m.forestRat, r.copperOre, 15, 1, 2),
    // Field Mouse
    dr(m.fieldMouse, d.ratTail, 50, 1, 1), dr(m.fieldMouse, d.ratPelt, 30, 1, 1),
    // Giant Rat
    dr(m.giantRat, d.ratTail, 70, 2, 3), dr(m.giantRat, d.ratPelt, 55, 1, 2), dr(m.giantRat, p.minorHealthPotion, 8, 1, 1),
    // Rat King
    dr(m.ratKing, d.ratTail, 80, 3, 5), dr(m.ratKing, d.ratPelt, 60, 2, 3), dr(m.ratKing, r.copperOre, 40, 2, 4), dr(m.ratKing, p.minorHealthPotion, 15, 1, 1),
    // Forest Spider
    dr(m.forestSpider, d.spiderSilk, 60, 1, 3), dr(m.forestSpider, r.forestSage, 10, 1, 1),
    // Web Spinner
    dr(m.webSpinner, d.spiderSilk, 55, 1, 2), dr(m.webSpinner, r.forestSage, 15, 1, 1),
    // Venomous Spider
    dr(m.venomousSpider, d.spiderSilk, 70, 2, 4), dr(m.venomousSpider, p.minorHealthPotion, 10, 1, 1),
    // Brood Mother
    dr(m.broodMother, d.spiderSilk, 80, 3, 6), dr(m.broodMother, r.forestSage, 30, 1, 2), dr(m.broodMother, p.minorHealthPotion, 20, 1, 1),
    // Wild Boar
    dr(m.wildBoar, d.boarHide, 50, 1, 1), dr(m.wildBoar, d.boarTusk, 45, 1, 2), dr(m.wildBoar, r.oakLog, 10, 1, 2),
    // Tusked Boar
    dr(m.tuskedBoar, d.boarHide, 60, 1, 2), dr(m.tuskedBoar, d.boarTusk, 55, 2, 3), dr(m.tuskedBoar, r.copperOre, 15, 1, 2),
    // Great Boar
    dr(m.greatBoar, d.boarHide, 70, 2, 3), dr(m.greatBoar, d.boarTusk, 65, 3, 4), dr(m.greatBoar, r.copperOre, 30, 2, 3), dr(m.greatBoar, p.minorHealthPotion, 15, 1, 1),

    // ── Deep Forest ───────────────────────────────────────────────────────
    // Young Wolf
    dr(m.youngWolf, d.wolfPelt, 45, 1, 1), dr(m.youngWolf, d.wolfFang, 30, 1, 1),
    // Forest Wolf
    dr(m.forestWolf, d.wolfPelt, 55, 1, 2), dr(m.forestWolf, d.wolfFang, 35, 1, 2),
    // Dire Wolf
    dr(m.direWolf, d.wolfPelt, 65, 2, 3), dr(m.direWolf, d.wolfFang, 50, 2, 3), dr(m.direWolf, p.healthPotion, 6, 1, 1),
    // Alpha Wolf
    dr(m.alphaWolf, d.wolfPelt, 75, 3, 4), dr(m.alphaWolf, d.wolfFang, 65, 3, 4), dr(m.alphaWolf, p.healthPotion, 12, 1, 1),
    // Woodland Bandit
    dr(m.woodlandBandit, d.banditCloth, 45, 1, 1), dr(m.woodlandBandit, d.stolenCoin, 40, 1, 2), dr(m.woodlandBandit, r.copperOre, 15, 1, 2),
    // Bandit Scout
    dr(m.banditScout, d.banditCloth, 40, 1, 1), dr(m.banditScout, d.stolenCoin, 35, 1, 1),
    // Bandit Enforcer
    dr(m.banditEnforcer, d.banditCloth, 55, 2, 3), dr(m.banditEnforcer, d.stolenCoin, 50, 2, 3), dr(m.banditEnforcer, d.crudeGemstone, 10, 1, 1),
    // Bandit Captain
    dr(m.banditCaptain, d.banditCloth, 65, 3, 4), dr(m.banditCaptain, d.stolenCoin, 60, 3, 5), dr(m.banditCaptain, d.crudeGemstone, 20, 1, 1), dr(m.banditCaptain, p.healthPotion, 10, 1, 1),
    // Twig Blight
    dr(m.twigBlight, d.ancientBark, 50, 1, 2), dr(m.twigBlight, r.oakLog, 20, 1, 2),
    // Bark Golem
    dr(m.barkGolem, d.ancientBark, 55, 2, 3), dr(m.barkGolem, r.mapleLog, 15, 1, 2),
    // Dark Treant
    dr(m.darkTreant, d.ancientBark, 65, 3, 4), dr(m.darkTreant, r.mapleLog, 25, 2, 3),
    // Elder Treant
    dr(m.elderTreant, d.ancientBark, 75, 4, 6), dr(m.elderTreant, r.mapleLog, 40, 3, 4), dr(m.elderTreant, p.healthPotion, 10, 1, 1),

    // ── Cave Entrance ─────────────────────────────────────────────────────
    // Cave Rat
    dr(m.caveRat, d.ratPelt, 45, 1, 1), dr(m.caveRat, d.ratTail, 40, 1, 1), dr(m.caveRat, r.copperOre, 20, 1, 2),
    // Cavern Beetle
    dr(m.cavernBeetle, d.crawlerChitin, 40, 1, 1), dr(m.cavernBeetle, r.copperOre, 25, 1, 2),
    // Giant Cave Spider
    dr(m.giantCaveSpider, d.spiderSilk, 55, 2, 3), dr(m.giantCaveSpider, d.crudeGemstone, 10, 1, 1),
    // Rat Matriarch
    dr(m.ratMatriarch, d.ratPelt, 60, 2, 3), dr(m.ratMatriarch, d.ratTail, 55, 2, 3), dr(m.ratMatriarch, d.crudeGemstone, 15, 1, 1), dr(m.ratMatriarch, p.healthPotion, 10, 1, 1),
    // Cave Bat
    dr(m.caveBat, d.batWing, 50, 1, 1), dr(m.caveBat, d.batFang, 35, 1, 1),
    // Dire Bat
    dr(m.direBat, d.batWing, 55, 1, 2), dr(m.direBat, d.batFang, 45, 1, 2),
    // Vampire Bat
    dr(m.vampireBat, d.batWing, 65, 2, 3), dr(m.vampireBat, d.batFang, 55, 2, 3), dr(m.vampireBat, p.healthPotion, 8, 1, 1),
    // Bat Swarm Lord
    dr(m.batSwarmLord, d.batWing, 75, 3, 5), dr(m.batSwarmLord, d.batFang, 65, 3, 4), dr(m.batSwarmLord, p.healthPotion, 15, 1, 1),
    // Goblin
    dr(m.goblin, d.goblinRag, 40, 1, 1), dr(m.goblin, d.stolenCoin, 35, 1, 2),
    // Goblin Archer
    dr(m.goblinArcher, d.goblinRag, 35, 1, 1), dr(m.goblinArcher, d.stolenCoin, 40, 1, 2), dr(m.goblinArcher, d.crudeGemstone, 8, 1, 1),
    // Goblin Warrior
    dr(m.goblinWarrior, d.goblinRag, 50, 2, 3), dr(m.goblinWarrior, d.stolenCoin, 50, 2, 4), dr(m.goblinWarrior, d.crudeGemstone, 15, 1, 1),
    // Goblin Shaman
    dr(m.goblinShaman, d.goblinRag, 55, 2, 3), dr(m.goblinShaman, d.stolenCoin, 55, 3, 5), dr(m.goblinShaman, d.crudeGemstone, 25, 1, 2), dr(m.goblinShaman, p.healthPotion, 12, 1, 1),

    // ── Deep Mines ────────────────────────────────────────────────────────
    // Goblin Miner
    dr(m.goblinMiner, d.stolenOre, 50, 1, 2), dr(m.goblinMiner, d.roughGem, 25, 1, 1), dr(m.goblinMiner, r.ironOre, 20, 1, 2),
    // Goblin Sapper
    dr(m.goblinSapper, d.stolenOre, 45, 1, 2), dr(m.goblinSapper, d.roughGem, 20, 1, 1), dr(m.goblinSapper, r.ironOre, 25, 1, 3),
    // Goblin Foreman
    dr(m.goblinForeman, d.stolenOre, 60, 2, 4), dr(m.goblinForeman, d.roughGem, 35, 1, 2), dr(m.goblinForeman, r.ironOre, 30, 2, 3),
    // Goblin Chieftain
    dr(m.goblinChieftain, d.stolenOre, 70, 3, 5), dr(m.goblinChieftain, d.roughGem, 50, 2, 3), dr(m.goblinChieftain, r.ironOre, 40, 3, 5), dr(m.goblinChieftain, p.greaterHealthPotion, 10, 1, 1),
    // Clay Golem
    dr(m.clayGolem, d.crystalShard, 35, 1, 1), dr(m.clayGolem, r.ironOre, 30, 1, 2),
    // Stone Golem
    dr(m.stoneGolem, d.crystalShard, 40, 1, 2), dr(m.stoneGolem, r.ironOre, 35, 1, 3),
    // Iron Golem
    dr(m.ironGolem, d.crystalShard, 55, 2, 3), dr(m.ironGolem, r.ironOre, 45, 2, 4),
    // Crystal Golem (Mines)
    dr(m.crystalGolemMob, d.crystalShard, 70, 3, 5), dr(m.crystalGolemMob, r.ironOre, 50, 3, 5), dr(m.crystalGolemMob, p.greaterHealthPotion, 10, 1, 1),
    // Rock Crawler
    dr(m.rockCrawler, d.crawlerChitin, 55, 1, 2), dr(m.rockCrawler, r.ironOre, 15, 1, 1),
    // Cave Lurker
    dr(m.caveLurker, d.crawlerChitin, 50, 1, 2), dr(m.caveLurker, r.ironOre, 20, 1, 2),
    // Burrower
    dr(m.burrower, d.crawlerChitin, 65, 2, 4), dr(m.burrower, r.ironOre, 25, 2, 3),
    // Tunnel Wyrm
    dr(m.tunnelWyrm, d.crawlerChitin, 75, 3, 5), dr(m.tunnelWyrm, d.crystalShard, 40, 2, 3), dr(m.tunnelWyrm, p.greaterHealthPotion, 12, 1, 1),

    // ── Whispering Plains ─────────────────────────────────────────────────
    // Plains Wolf
    dr(m.plainsWolf, d.wolfPelt, 50, 1, 2), dr(m.plainsWolf, d.wargHide, 15, 1, 1),
    // Coyote
    dr(m.coyote, d.wolfPelt, 45, 1, 1), dr(m.coyote, d.wolfFang, 35, 1, 1),
    // Warg
    dr(m.warg, d.wargHide, 55, 1, 2), dr(m.warg, d.wolfFang, 45, 2, 3),
    // Pack Alpha
    dr(m.packAlpha, d.wargHide, 65, 2, 3), dr(m.packAlpha, d.wolfFang, 60, 3, 4), dr(m.packAlpha, p.greaterHealthPotion, 8, 1, 1),
    // Highway Bandit
    dr(m.highwayBandit, d.banditCloth, 45, 1, 2), dr(m.highwayBandit, d.stolenCoin, 45, 2, 3),
    // Bandit Archer (Plains)
    dr(m.banditArcherPlains, d.banditCloth, 40, 1, 1), dr(m.banditArcherPlains, d.stolenCoin, 40, 1, 2), dr(m.banditArcherPlains, d.harpyFeather, 10, 1, 1),
    // Bandit Lieutenant
    dr(m.banditLieutenant, d.banditCloth, 55, 2, 3), dr(m.banditLieutenant, d.stolenCoin, 55, 3, 5), dr(m.banditLieutenant, d.crudeGemstone, 15, 1, 1),
    // Bandit Warlord
    dr(m.banditWarlord, d.banditCloth, 65, 3, 4), dr(m.banditWarlord, d.stolenCoin, 60, 4, 6), dr(m.banditWarlord, d.crudeGemstone, 25, 1, 2), dr(m.banditWarlord, p.greaterHealthPotion, 10, 1, 1),
    // Harpy
    dr(m.harpy, d.harpyFeather, 55, 1, 2), dr(m.harpy, d.harpyTalon, 35, 1, 1),
    // Harpy Scout
    dr(m.harpyScout, d.harpyFeather, 50, 1, 1), dr(m.harpyScout, d.harpyTalon, 30, 1, 1),
    // Harpy Windcaller
    dr(m.harpyWindcaller, d.harpyFeather, 65, 2, 3), dr(m.harpyWindcaller, d.harpyTalon, 50, 2, 3), dr(m.harpyWindcaller, r.windbloom, 15, 1, 1),
    // Harpy Matriarch
    dr(m.harpyMatriarch, d.harpyFeather, 75, 3, 5), dr(m.harpyMatriarch, d.harpyTalon, 60, 3, 4), dr(m.harpyMatriarch, r.windbloom, 25, 1, 2), dr(m.harpyMatriarch, p.greaterHealthPotion, 10, 1, 1),

    // ── Ancient Grove ─────────────────────────────────────────────────────
    // Forest Sprite
    dr(m.forestSprite, d.spriteDust, 55, 1, 2), dr(m.forestSprite, r.starbloom, 15, 1, 1),
    // Wisp
    dr(m.wisp, d.spriteDust, 45, 1, 1), dr(m.wisp, d.dryadThread, 20, 1, 1),
    // Dryad
    dr(m.dryad, d.spriteDust, 60, 2, 3), dr(m.dryad, d.dryadThread, 45, 1, 2), dr(m.dryad, r.starbloom, 20, 1, 1),
    // Ancient Spirit
    dr(m.ancientSpirit, d.spriteDust, 75, 3, 5), dr(m.ancientSpirit, d.dryadThread, 55, 2, 3), dr(m.ancientSpirit, r.starbloom, 35, 1, 2), dr(m.ancientSpirit, p.greaterHealthPotion, 12, 1, 1),
    // Dark Treant (Grove)
    dr(m.darkTreantGrove, d.ancientBark, 55, 2, 3), dr(m.darkTreantGrove, r.elderwoodLog, 20, 1, 2),
    // Moss Golem
    dr(m.mossGolem, d.ancientBark, 50, 2, 3), dr(m.mossGolem, r.elderwoodLog, 25, 1, 2),
    // Ancient Treant
    dr(m.ancientTreant, d.ancientBark, 65, 3, 5), dr(m.ancientTreant, r.elderwoodLog, 35, 2, 3),
    // Treant Patriarch
    dr(m.treantPatriarch, d.ancientBark, 80, 4, 6), dr(m.treantPatriarch, r.elderwoodLog, 50, 3, 5), dr(m.treantPatriarch, p.greaterHealthPotion, 10, 1, 1),
    // Pixie Swarm
    dr(m.pixieSwarm, d.pixieWing, 55, 1, 2), dr(m.pixieSwarm, d.faeSilk, 30, 1, 1),
    // Thorn Fairy
    dr(m.thornFairy, d.pixieWing, 45, 1, 1), dr(m.thornFairy, d.faeSilk, 40, 1, 2),
    // Fae Knight
    dr(m.faeKnight, d.pixieWing, 60, 2, 3), dr(m.faeKnight, d.faeSilk, 50, 2, 3), dr(m.faeKnight, r.starbloom, 15, 1, 1),
    // Fae Queen
    dr(m.faeQueen, d.pixieWing, 75, 3, 5), dr(m.faeQueen, d.faeSilk, 65, 3, 4), dr(m.faeQueen, r.starbloom, 30, 1, 2), dr(m.faeQueen, p.greaterHealthPotion, 12, 1, 1),

    // ── Haunted Marsh ─────────────────────────────────────────────────────
    // Skeleton
    dr(m.skeleton, d.boneFragment, 55, 1, 2), dr(m.skeleton, d.wraithEssence, 10, 1, 1),
    // Zombie
    dr(m.zombie, d.boneFragment, 50, 1, 2), dr(m.zombie, r.gravemoss, 15, 1, 1),
    // Wraith
    dr(m.wraith, d.wraithEssence, 55, 1, 2), dr(m.wraith, d.boneFragment, 40, 2, 3), dr(m.wraith, p.resistPotion, 8, 1, 1),
    // Death Knight
    dr(m.deathKnight, d.wraithEssence, 70, 2, 4), dr(m.deathKnight, d.boneFragment, 60, 3, 5), dr(m.deathKnight, p.resistPotion, 15, 1, 1),
    // Bog Toad
    dr(m.bogToad, d.crocHide, 30, 1, 1), dr(m.bogToad, d.bogHeart, 20, 1, 1),
    // Marsh Crawler
    dr(m.marshCrawlerMob, d.crocHide, 35, 1, 1), dr(m.marshCrawlerMob, d.hydraScale, 15, 1, 1),
    // Swamp Hydra
    dr(m.swampHydra, d.hydraScale, 55, 1, 2), dr(m.swampHydra, d.bogHeart, 40, 1, 2), dr(m.swampHydra, p.resistPotion, 8, 1, 1),
    // Ancient Crocodile
    dr(m.ancientCrocodile, d.crocHide, 65, 2, 3), dr(m.ancientCrocodile, d.hydraScale, 50, 2, 3), dr(m.ancientCrocodile, d.bogHeart, 45, 2, 3), dr(m.ancientCrocodile, p.resistPotion, 12, 1, 1),
    // Hag Servant
    dr(m.hagServant, d.witchCloth, 45, 1, 1), dr(m.hagServant, d.bogHeart, 15, 1, 1),
    // Cursed Villager
    dr(m.cursedVillager, d.witchCloth, 40, 1, 1), dr(m.cursedVillager, r.gravemoss, 20, 1, 1),
    // Bog Witch
    dr(m.bogWitch, d.witchCloth, 55, 2, 3), dr(m.bogWitch, d.bogHeart, 35, 1, 2), dr(m.bogWitch, r.gravemoss, 25, 1, 1),
    // Coven Mother
    dr(m.covenMother, d.witchCloth, 70, 3, 4), dr(m.covenMother, d.bogHeart, 55, 2, 3), dr(m.covenMother, r.gravemoss, 40, 2, 3), dr(m.covenMother, p.resistPotion, 15, 1, 1),

    // ── Crystal Caverns ───────────────────────────────────────────────────
    // Goblin Gem Hunter
    dr(m.goblinGemHunter, d.cutGem, 40, 1, 1), dr(m.goblinGemHunter, d.goblinGold, 35, 1, 2), dr(m.goblinGemHunter, r.mithrilOre, 15, 1, 1),
    // Goblin Tunneler
    dr(m.goblinTunneler, d.cutGem, 35, 1, 1), dr(m.goblinTunneler, d.goblinGold, 30, 1, 2), dr(m.goblinTunneler, r.mithrilOre, 20, 1, 2),
    // Goblin Artificer
    dr(m.goblinArtificer, d.cutGem, 55, 1, 2), dr(m.goblinArtificer, d.goblinGold, 50, 2, 4), dr(m.goblinArtificer, r.mithrilOre, 25, 1, 2),
    // Goblin King
    dr(m.goblinKingMob, d.cutGem, 70, 2, 4), dr(m.goblinKingMob, d.goblinGold, 65, 4, 6), dr(m.goblinKingMob, r.mithrilOre, 35, 2, 3), dr(m.goblinKingMob, p.manaPotion, 12, 1, 1),
    // Crystal Golem (Cav)
    dr(m.crystalGolemCav, d.darkCrystal, 45, 1, 2), dr(m.crystalGolemCav, r.mithrilOre, 25, 1, 2),
    // Gem Construct
    dr(m.gemConstruct, d.darkCrystal, 40, 1, 1), dr(m.gemConstruct, r.mithrilOre, 20, 1, 1),
    // Diamond Golem
    dr(m.diamondGolemMob, d.darkCrystal, 60, 2, 3), dr(m.diamondGolemMob, r.mithrilOre, 35, 2, 3),
    // Golem Overlord
    dr(m.golemOverlord, d.darkCrystal, 75, 3, 5), dr(m.golemOverlord, r.mithrilOre, 45, 3, 4), dr(m.golemOverlord, p.manaPotion, 10, 1, 1),
    // Shard Elemental
    dr(m.shardElemental, d.darkCrystal, 50, 1, 2), dr(m.shardElemental, r.crystalWood, 15, 1, 1),
    // Crystal Wisp
    dr(m.crystalWispMob, d.darkCrystal, 45, 1, 1), dr(m.crystalWispMob, r.shimmerFern, 20, 1, 1),
    // Storm Crystal
    dr(m.stormCrystalMob, d.darkCrystal, 60, 2, 3), dr(m.stormCrystalMob, r.crystalWood, 25, 1, 2), dr(m.stormCrystalMob, r.shimmerFern, 20, 1, 1),
    // Crystal Titan
    dr(m.crystalTitan, d.darkCrystal, 75, 3, 5), dr(m.crystalTitan, r.crystalWood, 35, 2, 3), dr(m.crystalTitan, r.shimmerFern, 30, 1, 2), dr(m.crystalTitan, p.manaPotion, 12, 1, 1),

    // ── Sunken Ruins ──────────────────────────────────────────────────────
    // Drowned Sailor
    dr(m.drownedSailor, d.boneFragment, 45, 1, 2), dr(m.drownedSailor, d.spectralSilk, 25, 1, 1),
    // Skeletal Knight
    dr(m.skeletalKnight, d.boneFragment, 50, 2, 3), dr(m.skeletalKnight, d.wraithEssence, 30, 1, 1), dr(m.skeletalKnight, d.ancientRelic, 5, 1, 1),
    // Spectral Captain
    dr(m.spectralCaptain, d.spectralSilk, 55, 2, 3), dr(m.spectralCaptain, d.wraithEssence, 45, 2, 3), dr(m.spectralCaptain, d.ancientRelic, 12, 1, 1),
    // Lich
    dr(m.lich, d.lichDust, 70, 2, 4), dr(m.lich, d.spectralSilk, 60, 3, 4), dr(m.lich, d.ancientRelic, 25, 1, 2), dr(m.lich, p.elixirOfPower, 10, 1, 1),
    // Sea Snake
    dr(m.seaSnake, d.nagaScale, 45, 1, 1), dr(m.seaSnake, d.nagaPearl, 10, 1, 1),
    // Marsh Viper
    dr(m.marshViper, d.nagaScale, 40, 1, 1), dr(m.marshViper, r.abyssalKelp, 20, 1, 1),
    // Naga Warrior
    dr(m.nagaWarrior, d.nagaScale, 60, 2, 3), dr(m.nagaWarrior, d.nagaPearl, 30, 1, 2), dr(m.nagaWarrior, r.abyssalKelp, 25, 1, 1),
    // Naga Queen
    dr(m.nagaQueenMob, d.nagaScale, 75, 3, 5), dr(m.nagaQueenMob, d.nagaPearl, 50, 2, 3), dr(m.nagaQueenMob, d.ancientRelic, 20, 1, 1), dr(m.nagaQueenMob, p.elixirOfPower, 10, 1, 1),
    // Ooze
    dr(m.ooze, d.oozeResidue, 55, 1, 2), dr(m.ooze, r.abyssalKelp, 15, 1, 1),
    // Tentacle Horror
    dr(m.tentacleHorror, d.oozeResidue, 50, 1, 2), dr(m.tentacleHorror, d.eldritchFragment, 20, 1, 1),
    // Flesh Golem
    dr(m.fleshGolem, d.oozeResidue, 60, 2, 3), dr(m.fleshGolem, d.eldritchFragment, 40, 1, 2),
    // Eldritch Abomination
    dr(m.eldritchAbomination, d.eldritchFragment, 70, 3, 5), dr(m.eldritchAbomination, d.oozeResidue, 55, 3, 4), dr(m.eldritchAbomination, d.ancientRelic, 20, 1, 2), dr(m.eldritchAbomination, p.elixirOfPower, 12, 1, 1),

    // ── Gem Drops ────────────────────────────────────────────────────────
    // T1 zones (Forest Edge) — T1 raw gems, ~5%
    dr(m.ratKing, g.roughRuby, 5, 1, 1), dr(m.broodMother, g.rawAmber, 5, 1, 1), dr(m.greatBoar, g.treeResin, 5, 1, 1),
    // T2 zones (Deep Forest / Cave Entrance) — T1-T2 raw gems, ~5-8%
    dr(m.alphaWolf, g.roughSapphire, 8, 1, 1), dr(m.banditCaptain, g.rawPearl, 6, 1, 1), dr(m.elderTreant, g.fossilizedSap, 6, 1, 1),
    dr(m.batSwarmLord, g.roughRuby, 5, 1, 1), dr(m.goblinShaman, g.rawAmber, 5, 1, 1),
    // T3 zones (Ancient Grove / Deep Mines / Whispering Plains) — T2-T3 raw gems, ~5-8%
    dr(m.ancientSpirit, g.roughEmerald, 8, 1, 1), dr(m.faeQueen, g.rawJade, 8, 1, 1), dr(m.treantPatriarch, g.crystalBark, 6, 1, 1),
    dr(m.goblinChieftain, g.roughSapphire, 6, 1, 1), dr(m.tunnelWyrm, g.fossilizedSap, 5, 1, 1),
    dr(m.harpyMatriarch, g.rawJade, 6, 1, 1), dr(m.banditWarlord, g.crystalBark, 5, 1, 1),
    // T4 zones (Haunted Marsh / Crystal Caverns) — T3-T4 raw gems, ~5-8%
    dr(m.deathKnight, g.roughDiamond, 8, 1, 1), dr(m.covenMother, g.rawMoonstone, 8, 1, 1), dr(m.ancientCrocodile, g.heartwoodGem, 6, 1, 1),
    dr(m.golemOverlord, g.roughEmerald, 6, 1, 1), dr(m.crystalTitan, g.roughDiamond, 8, 1, 1), dr(m.goblinKingMob, g.rawMoonstone, 6, 1, 1),
    // T5 zones (Sunken Ruins) — T4-T5 raw gems, ~5-10%
    dr(m.lich, g.roughOpal, 10, 1, 1), dr(m.nagaQueenMob, g.rawStarcrystal, 10, 1, 1), dr(m.eldritchAbomination, g.ancientAmber, 10, 1, 1),
    dr(m.spectralCaptain, g.roughDiamond, 6, 1, 1), dr(m.tentacleHorror, g.heartwoodGem, 5, 1, 1),
  ];
}
