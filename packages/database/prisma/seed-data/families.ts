import { IDS } from './ids';

const f = IDS.families;
const z = IDS.zones;
const m = IDS.mobs;

export function getAllMobFamilies() {
  return [
    { id: f.vermin, name: 'Vermin', siteNounSmall: 'Nest', siteNounMedium: 'Warren', siteNounLarge: 'Burrow' },
    { id: f.spiders, name: 'Spiders', siteNounSmall: 'Web', siteNounMedium: 'Nest', siteNounLarge: 'Lair' },
    { id: f.boars, name: 'Boars', siteNounSmall: 'Herd', siteNounMedium: 'Mud Wallow', siteNounLarge: 'Territory' },
    { id: f.wolves, name: 'Wolves', siteNounSmall: 'Pack', siteNounMedium: 'Den', siteNounLarge: 'Territory' },
    { id: f.bandits, name: 'Bandits', siteNounSmall: 'Patrol', siteNounMedium: 'Camp', siteNounLarge: 'Stronghold' },
    { id: f.treants, name: 'Treants', siteNounSmall: 'Thicket', siteNounMedium: 'Grove', siteNounLarge: 'Heart' },
    { id: f.spirits, name: 'Spirits', siteNounSmall: 'Cluster', siteNounMedium: 'Circle', siteNounLarge: 'Sanctum' },
    { id: f.fae, name: 'Fae', siteNounSmall: 'Glade', siteNounMedium: 'Court', siteNounLarge: 'Throne' },
    { id: f.bats, name: 'Bats', siteNounSmall: 'Roost', siteNounMedium: 'Colony', siteNounLarge: 'Cavern' },
    { id: f.goblins, name: 'Goblins', siteNounSmall: 'Patrol', siteNounMedium: 'Camp', siteNounLarge: 'Warren' },
    { id: f.golems, name: 'Golems', siteNounSmall: 'Vein', siteNounMedium: 'Cavern', siteNounLarge: 'Core' },
    { id: f.crawlers, name: 'Crawlers', siteNounSmall: 'Tunnel', siteNounMedium: 'Nest', siteNounLarge: 'Deep Burrow' },
    { id: f.harpies, name: 'Harpies', siteNounSmall: 'Roost', siteNounMedium: 'Aerie', siteNounLarge: 'Eyrie' },
    { id: f.undead, name: 'Undead', siteNounSmall: 'Grave', siteNounMedium: 'Crypt', siteNounLarge: 'Tomb' },
    { id: f.swampBeasts, name: 'Swamp Beasts', siteNounSmall: 'Pool', siteNounMedium: 'Mire', siteNounLarge: 'Depths' },
    { id: f.witches, name: 'Witches', siteNounSmall: 'Hut', siteNounMedium: 'Circle', siteNounLarge: 'Coven' },
    { id: f.elementals, name: 'Elementals', siteNounSmall: 'Cluster', siteNounMedium: 'Nexus', siteNounLarge: 'Core' },
    { id: f.serpents, name: 'Serpents', siteNounSmall: 'Nest', siteNounMedium: 'Temple', siteNounLarge: 'Throne' },
    { id: f.abominations, name: 'Abominations', siteNounSmall: 'Pool', siteNounMedium: 'Cavern', siteNounLarge: 'Abyss' },
  ];
}

// Links each mob template to its family with a role (trash/elite/boss)
export function getAllMobFamilyMembers() {
  return [
    // Vermin — Forest Edge
    { mobFamilyId: f.vermin, mobTemplateId: m.forestRat, role: 'trash' },
    { mobFamilyId: f.vermin, mobTemplateId: m.fieldMouse, role: 'trash' },
    { mobFamilyId: f.vermin, mobTemplateId: m.giantRat, role: 'elite' },
    { mobFamilyId: f.vermin, mobTemplateId: m.ratKing, role: 'boss' },
    // Vermin — Cave Entrance
    { mobFamilyId: f.vermin, mobTemplateId: m.caveRat, role: 'trash' },
    { mobFamilyId: f.vermin, mobTemplateId: m.cavernBeetle, role: 'trash' },
    { mobFamilyId: f.vermin, mobTemplateId: m.giantCaveSpider, role: 'elite' },
    { mobFamilyId: f.vermin, mobTemplateId: m.ratMatriarch, role: 'boss' },
    // Spiders — Forest Edge
    { mobFamilyId: f.spiders, mobTemplateId: m.forestSpider, role: 'trash' },
    { mobFamilyId: f.spiders, mobTemplateId: m.webSpinner, role: 'trash' },
    { mobFamilyId: f.spiders, mobTemplateId: m.venomousSpider, role: 'elite' },
    { mobFamilyId: f.spiders, mobTemplateId: m.broodMother, role: 'boss' },
    // Boars — Forest Edge
    { mobFamilyId: f.boars, mobTemplateId: m.wildBoar, role: 'trash' },
    { mobFamilyId: f.boars, mobTemplateId: m.tuskedBoar, role: 'elite' },
    { mobFamilyId: f.boars, mobTemplateId: m.greatBoar, role: 'boss' },
    // Wolves — Deep Forest
    { mobFamilyId: f.wolves, mobTemplateId: m.youngWolf, role: 'trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.forestWolf, role: 'trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.direWolf, role: 'elite' },
    { mobFamilyId: f.wolves, mobTemplateId: m.alphaWolf, role: 'boss' },
    // Wolves — Whispering Plains
    { mobFamilyId: f.wolves, mobTemplateId: m.plainsWolf, role: 'trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.coyote, role: 'trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.warg, role: 'elite' },
    { mobFamilyId: f.wolves, mobTemplateId: m.packAlpha, role: 'boss' },
    // Bandits — Deep Forest
    { mobFamilyId: f.bandits, mobTemplateId: m.woodlandBandit, role: 'trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditScout, role: 'trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditEnforcer, role: 'elite' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditCaptain, role: 'boss' },
    // Bandits — Whispering Plains
    { mobFamilyId: f.bandits, mobTemplateId: m.highwayBandit, role: 'trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditArcherPlains, role: 'trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditLieutenant, role: 'elite' },
    { mobFamilyId: f.bandits, mobTemplateId: m.banditWarlord, role: 'boss' },
    // Treants — Deep Forest
    { mobFamilyId: f.treants, mobTemplateId: m.twigBlight, role: 'trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.barkGolem, role: 'trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.darkTreant, role: 'elite' },
    { mobFamilyId: f.treants, mobTemplateId: m.elderTreant, role: 'boss' },
    // Treants — Ancient Grove
    { mobFamilyId: f.treants, mobTemplateId: m.darkTreantGrove, role: 'trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.mossGolem, role: 'trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.ancientTreant, role: 'elite' },
    { mobFamilyId: f.treants, mobTemplateId: m.treantPatriarch, role: 'boss' },
    // Spirits — Ancient Grove
    { mobFamilyId: f.spirits, mobTemplateId: m.forestSprite, role: 'trash' },
    { mobFamilyId: f.spirits, mobTemplateId: m.wisp, role: 'trash' },
    { mobFamilyId: f.spirits, mobTemplateId: m.dryad, role: 'elite' },
    { mobFamilyId: f.spirits, mobTemplateId: m.ancientSpirit, role: 'boss' },
    // Fae — Ancient Grove
    { mobFamilyId: f.fae, mobTemplateId: m.pixieSwarm, role: 'trash' },
    { mobFamilyId: f.fae, mobTemplateId: m.thornFairy, role: 'trash' },
    { mobFamilyId: f.fae, mobTemplateId: m.faeKnight, role: 'elite' },
    { mobFamilyId: f.fae, mobTemplateId: m.faeQueen, role: 'boss' },
    // Bats — Cave Entrance
    { mobFamilyId: f.bats, mobTemplateId: m.caveBat, role: 'trash' },
    { mobFamilyId: f.bats, mobTemplateId: m.direBat, role: 'trash' },
    { mobFamilyId: f.bats, mobTemplateId: m.vampireBat, role: 'elite' },
    { mobFamilyId: f.bats, mobTemplateId: m.batSwarmLord, role: 'boss' },
    // Goblins — Cave Entrance
    { mobFamilyId: f.goblins, mobTemplateId: m.goblin, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinArcher, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinWarrior, role: 'elite' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinShaman, role: 'boss' },
    // Goblins — Deep Mines
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinMiner, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinSapper, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinForeman, role: 'elite' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinChieftain, role: 'boss' },
    // Goblins — Crystal Caverns
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinGemHunter, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinTunneler, role: 'trash' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinArtificer, role: 'elite' },
    { mobFamilyId: f.goblins, mobTemplateId: m.goblinKingMob, role: 'boss' },
    // Golems — Deep Mines
    { mobFamilyId: f.golems, mobTemplateId: m.clayGolem, role: 'trash' },
    { mobFamilyId: f.golems, mobTemplateId: m.stoneGolem, role: 'trash' },
    { mobFamilyId: f.golems, mobTemplateId: m.ironGolem, role: 'elite' },
    { mobFamilyId: f.golems, mobTemplateId: m.crystalGolemMob, role: 'boss' },
    // Golems — Crystal Caverns
    { mobFamilyId: f.golems, mobTemplateId: m.crystalGolemCav, role: 'trash' },
    { mobFamilyId: f.golems, mobTemplateId: m.gemConstruct, role: 'trash' },
    { mobFamilyId: f.golems, mobTemplateId: m.diamondGolemMob, role: 'elite' },
    { mobFamilyId: f.golems, mobTemplateId: m.golemOverlord, role: 'boss' },
    // Crawlers — Deep Mines
    { mobFamilyId: f.crawlers, mobTemplateId: m.rockCrawler, role: 'trash' },
    { mobFamilyId: f.crawlers, mobTemplateId: m.caveLurker, role: 'trash' },
    { mobFamilyId: f.crawlers, mobTemplateId: m.burrower, role: 'elite' },
    { mobFamilyId: f.crawlers, mobTemplateId: m.tunnelWyrm, role: 'boss' },
    // Harpies — Whispering Plains
    { mobFamilyId: f.harpies, mobTemplateId: m.harpy, role: 'trash' },
    { mobFamilyId: f.harpies, mobTemplateId: m.harpyScout, role: 'trash' },
    { mobFamilyId: f.harpies, mobTemplateId: m.harpyWindcaller, role: 'elite' },
    { mobFamilyId: f.harpies, mobTemplateId: m.harpyMatriarch, role: 'boss' },
    // Undead — Haunted Marsh
    { mobFamilyId: f.undead, mobTemplateId: m.skeleton, role: 'trash' },
    { mobFamilyId: f.undead, mobTemplateId: m.zombie, role: 'trash' },
    { mobFamilyId: f.undead, mobTemplateId: m.wraith, role: 'elite' },
    { mobFamilyId: f.undead, mobTemplateId: m.deathKnight, role: 'boss' },
    // Undead — Sunken Ruins
    { mobFamilyId: f.undead, mobTemplateId: m.drownedSailor, role: 'trash' },
    { mobFamilyId: f.undead, mobTemplateId: m.skeletalKnight, role: 'trash' },
    { mobFamilyId: f.undead, mobTemplateId: m.spectralCaptain, role: 'elite' },
    { mobFamilyId: f.undead, mobTemplateId: m.lich, role: 'boss' },
    // Swamp Beasts — Haunted Marsh
    { mobFamilyId: f.swampBeasts, mobTemplateId: m.bogToad, role: 'trash' },
    { mobFamilyId: f.swampBeasts, mobTemplateId: m.marshCrawlerMob, role: 'trash' },
    { mobFamilyId: f.swampBeasts, mobTemplateId: m.swampHydra, role: 'elite' },
    { mobFamilyId: f.swampBeasts, mobTemplateId: m.ancientCrocodile, role: 'boss' },
    // Witches — Haunted Marsh
    { mobFamilyId: f.witches, mobTemplateId: m.hagServant, role: 'trash' },
    { mobFamilyId: f.witches, mobTemplateId: m.cursedVillager, role: 'trash' },
    { mobFamilyId: f.witches, mobTemplateId: m.bogWitch, role: 'elite' },
    { mobFamilyId: f.witches, mobTemplateId: m.covenMother, role: 'boss' },
    // Elementals — Crystal Caverns
    { mobFamilyId: f.elementals, mobTemplateId: m.shardElemental, role: 'trash' },
    { mobFamilyId: f.elementals, mobTemplateId: m.crystalWispMob, role: 'trash' },
    { mobFamilyId: f.elementals, mobTemplateId: m.stormCrystalMob, role: 'elite' },
    { mobFamilyId: f.elementals, mobTemplateId: m.crystalTitan, role: 'boss' },
    // Serpents — Sunken Ruins
    { mobFamilyId: f.serpents, mobTemplateId: m.seaSnake, role: 'trash' },
    { mobFamilyId: f.serpents, mobTemplateId: m.marshViper, role: 'trash' },
    { mobFamilyId: f.serpents, mobTemplateId: m.nagaWarrior, role: 'elite' },
    { mobFamilyId: f.serpents, mobTemplateId: m.nagaQueenMob, role: 'boss' },
    // Abominations — Sunken Ruins
    { mobFamilyId: f.abominations, mobTemplateId: m.ooze, role: 'trash' },
    { mobFamilyId: f.abominations, mobTemplateId: m.tentacleHorror, role: 'trash' },
    { mobFamilyId: f.abominations, mobTemplateId: m.fleshGolem, role: 'elite' },
    { mobFamilyId: f.abominations, mobTemplateId: m.eldritchAbomination, role: 'boss' },
    // Expedition: Spider Nest → Spiders family
    { mobFamilyId: f.spiders, mobTemplateId: m.expCavernSpider, role: 'expedition_trash' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expWebweaver, role: 'expedition_trash' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expBroodguard, role: 'expedition_elite' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expSilkStalker, role: 'expedition_elite' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expSpiderMatriarch, role: 'expedition_mini_boss' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expSpiderling, role: 'expedition_add' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expVenomousSpitter, role: 'expedition_caster' },
    { mobFamilyId: f.spiders, mobTemplateId: m.expBroodqueen, role: 'expedition_boss' },
    // Expedition: Wolf Pack → Wolves family
    { mobFamilyId: f.wolves, mobTemplateId: m.expTimberWolf, role: 'expedition_trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expSnarler, role: 'expedition_trash' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expDireWolfExp, role: 'expedition_elite' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expShadowWolf, role: 'expedition_elite' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expPackAlphaExp, role: 'expedition_mini_boss' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expFrenziedWolf, role: 'expedition_add' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expHowlingSpirit, role: 'expedition_caster' },
    { mobFamilyId: f.wolves, mobTemplateId: m.expFenris, role: 'expedition_boss' },
    // Expedition: Bandit Camp → Bandits family
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditThug, role: 'expedition_trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditArcherExp, role: 'expedition_trash' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditAssassin, role: 'expedition_elite' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditShaman, role: 'expedition_elite' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expWarChief, role: 'expedition_mini_boss' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditGrunt, role: 'expedition_add' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expKnifeThrower, role: 'expedition_caster' },
    { mobFamilyId: f.bandits, mobTemplateId: m.expBanditKing, role: 'expedition_boss' },
    // Expedition: Corrupted Grove → Treants family
    { mobFamilyId: f.treants, mobTemplateId: m.expBlightedSapling, role: 'expedition_trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.expFungalSpore, role: 'expedition_trash' },
    { mobFamilyId: f.treants, mobTemplateId: m.expCorruptedTreant, role: 'expedition_elite' },
    { mobFamilyId: f.treants, mobTemplateId: m.expBlightedDryad, role: 'expedition_elite' },
    { mobFamilyId: f.treants, mobTemplateId: m.expGroveWarden, role: 'expedition_mini_boss' },
    { mobFamilyId: f.treants, mobTemplateId: m.expThornVine, role: 'expedition_add' },
    { mobFamilyId: f.treants, mobTemplateId: m.expBlightedSpore, role: 'expedition_caster' },
    { mobFamilyId: f.treants, mobTemplateId: m.expRotHeart, role: 'expedition_boss' },
  ];
}

// Zone ↔ MobFamily mappings with discovery weights and size ranges
export function getAllZoneMobFamilies() {
  return [
    // Forest Edge
    { zoneId: z.forestEdge, mobFamilyId: f.vermin, discoveryWeight: 110, minSize: 'small', maxSize: 'medium' },
    { zoneId: z.forestEdge, mobFamilyId: f.spiders, discoveryWeight: 90, minSize: 'small', maxSize: 'medium' },
    { zoneId: z.forestEdge, mobFamilyId: f.boars, discoveryWeight: 80, minSize: 'small', maxSize: 'medium' },
    // Deep Forest
    { zoneId: z.deepForest, mobFamilyId: f.wolves, discoveryWeight: 100, minSize: 'small', maxSize: 'large' },
    { zoneId: z.deepForest, mobFamilyId: f.bandits, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    { zoneId: z.deepForest, mobFamilyId: f.treants, discoveryWeight: 70, minSize: 'small', maxSize: 'medium' },
    // Ancient Grove
    { zoneId: z.ancientGrove, mobFamilyId: f.spirits, discoveryWeight: 90, minSize: 'small', maxSize: 'large' },
    { zoneId: z.ancientGrove, mobFamilyId: f.treants, discoveryWeight: 80, minSize: 'medium', maxSize: 'large' },
    { zoneId: z.ancientGrove, mobFamilyId: f.fae, discoveryWeight: 70, minSize: 'small', maxSize: 'large' },
    // Cave Entrance
    { zoneId: z.caveEntrance, mobFamilyId: f.vermin, discoveryWeight: 100, minSize: 'small', maxSize: 'medium' },
    { zoneId: z.caveEntrance, mobFamilyId: f.bats, discoveryWeight: 90, minSize: 'small', maxSize: 'large' },
    { zoneId: z.caveEntrance, mobFamilyId: f.goblins, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    // Deep Mines
    { zoneId: z.deepMines, mobFamilyId: f.goblins, discoveryWeight: 100, minSize: 'small', maxSize: 'large' },
    { zoneId: z.deepMines, mobFamilyId: f.golems, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    { zoneId: z.deepMines, mobFamilyId: f.crawlers, discoveryWeight: 70, minSize: 'small', maxSize: 'large' },
    // Whispering Plains
    { zoneId: z.whisperingPlains, mobFamilyId: f.wolves, discoveryWeight: 90, minSize: 'small', maxSize: 'large' },
    { zoneId: z.whisperingPlains, mobFamilyId: f.bandits, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    { zoneId: z.whisperingPlains, mobFamilyId: f.harpies, discoveryWeight: 70, minSize: 'small', maxSize: 'large' },
    // Haunted Marsh
    { zoneId: z.hauntedMarsh, mobFamilyId: f.undead, discoveryWeight: 100, minSize: 'small', maxSize: 'large' },
    { zoneId: z.hauntedMarsh, mobFamilyId: f.swampBeasts, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    { zoneId: z.hauntedMarsh, mobFamilyId: f.witches, discoveryWeight: 70, minSize: 'small', maxSize: 'large' },
    // Crystal Caverns
    { zoneId: z.crystalCaverns, mobFamilyId: f.goblins, discoveryWeight: 90, minSize: 'small', maxSize: 'large' },
    { zoneId: z.crystalCaverns, mobFamilyId: f.golems, discoveryWeight: 80, minSize: 'medium', maxSize: 'large' },
    { zoneId: z.crystalCaverns, mobFamilyId: f.elementals, discoveryWeight: 70, minSize: 'small', maxSize: 'large' },
    // Sunken Ruins
    { zoneId: z.sunkenRuins, mobFamilyId: f.undead, discoveryWeight: 100, minSize: 'medium', maxSize: 'large' },
    { zoneId: z.sunkenRuins, mobFamilyId: f.serpents, discoveryWeight: 80, minSize: 'small', maxSize: 'large' },
    { zoneId: z.sunkenRuins, mobFamilyId: f.abominations, discoveryWeight: 70, minSize: 'medium', maxSize: 'large' },
  ];
}
