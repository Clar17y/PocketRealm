import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';

import { IDS } from './seed-data/ids';
import { getAllItemTemplates } from './seed-data/items';
import { ITEM_FLAVOR_TEXT } from './seed-data/flavorText';
import { getAllMobTemplates } from './seed-data/mobs';
import { MOB_FLAVOR_TEXT, MOB_FAMILY_FLAVOR } from './seed-data/mobFlavorText';
import { getAllMobFamilies, getAllMobFamilyMembers, getAllZoneMobFamilies } from './seed-data/families';
import { getAllResourceNodes } from './seed-data/resources';
import { getAllDropTables } from './seed-data/drops';
import { getAllRecipes } from './seed-data/recipes';
import { getAllChestDropTables } from './seed-data/chests';
import { generateBotPlayers } from './seed-data/bots';

const prisma = new PrismaClient();

// ============================================================================
// Cleanup — delete all template data (preserves player accounts)
// ============================================================================

async function cleanTemplateData() {
  console.log('  Cleaning template data...');
  const p = prisma as any;

  // Clean bot players and their related data first (before items/equipment)
  const botPlayers = await prisma.player.findMany({ where: { isBot: true }, select: { id: true } });
  if (botPlayers.length > 0) {
    const botIds = botPlayers.map((b) => b.id);
    await p.pvpMatch.deleteMany({ where: { OR: [{ attackerId: { in: botIds } }, { defenderId: { in: botIds } }] } });
    await p.pvpCooldown.deleteMany({ where: { OR: [{ attackerId: { in: botIds } }, { defenderId: { in: botIds } }] } });
    await p.pvpRating.deleteMany({ where: { playerId: { in: botIds } } });
    await prisma.playerEquipment.deleteMany({ where: { playerId: { in: botIds } } });
    await prisma.item.deleteMany({ where: { ownerId: { in: botIds } } });
    await prisma.player.deleteMany({ where: { isBot: true } });
    console.log(`  ${botPlayers.length} bot players cleaned.`);
  }

  await p.playerRecipe.deleteMany({});
  await p.chestDropTable.deleteMany({});
  await prisma.dropTable.deleteMany({});
  await prisma.craftingRecipe.deleteMany({});
  await p.mobFamilyMember.deleteMany({});
  await p.zoneMobFamily.deleteMany({});
  await p.encounterSite.deleteMany({});
  await prisma.playerResourceNode.deleteMany({});
  await prisma.playerEquipment.deleteMany({});
  await prisma.item.deleteMany({});
  await p.bossParticipant.deleteMany({});
  await p.bossEncounter.deleteMany({});
  await p.persistedMob.deleteMany({});
  await p.worldEvent.deleteMany({});
  await p.mobFamily.deleteMany({});
  await prisma.mobTemplate.deleteMany({});
  await prisma.resourceNode.deleteMany({});
  await prisma.itemTemplate.deleteMany({});
  await p.zoneConnection.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await p.playerZoneDiscovery.deleteMany({});
  await prisma.player.updateMany({
    data: { currentZoneId: null, lastTravelledFromZoneId: null, homeTownId: null },
  });
  await prisma.zone.deleteMany({});

  console.log('  Template data cleaned.');
}

// ============================================================================
// Zones
// ============================================================================

async function seedZones() {
  console.log('  Seeding zones...');

  const explorationTiers = { '1': 0, '2': 25, '3': 50, '4': 75 };

  const zones: Prisma.ZoneCreateManyInput[] = [
    { id: IDS.zones.millbrook, name: 'Millbrook', description: 'A peaceful town nestled at the forest edge. Crafters and merchants ply their trade here.', difficulty: 0, travelCost: 0, isStarter: true, zoneType: 'town', zoneExitChance: null, maxCraftingLevel: 20 },
    { id: IDS.zones.forestEdge, name: 'Forest Edge', description: 'A bright woodland border with gentle paths. Creatures stir among the undergrowth.', difficulty: 1, travelCost: 50, isStarter: false, zoneType: 'wild', zoneExitChance: 0.0001, turnsToExplore: 30000, explorationTiers },
    { id: IDS.zones.deepForest, name: 'Deep Forest', description: 'Dense and shadowed. Predators stalk between the ancient trees.', difficulty: 2, travelCost: 150, isStarter: false, zoneType: 'wild', zoneExitChance: 0.000033, turnsToExplore: 45000, explorationTiers },
    { id: IDS.zones.caveEntrance, name: 'Cave Entrance', description: 'A yawning cavern mouth. Strange sounds echo from within.', difficulty: 2, travelCost: 150, isStarter: false, zoneType: 'wild', zoneExitChance: 0.000033, turnsToExplore: 45000, explorationTiers },
    { id: IDS.zones.ancientGrove, name: 'Ancient Grove', description: 'A sacred woodland where spirits dwell among towering trees.', difficulty: 3, travelCost: 300, isStarter: false, zoneType: 'wild', zoneExitChance: null, turnsToExplore: 60000, explorationTiers },
    { id: IDS.zones.deepMines, name: 'Deep Mines', description: 'Abandoned mine shafts descending into darkness. Something lurks below.', difficulty: 3, travelCost: 300, isStarter: false, zoneType: 'wild', zoneExitChance: null, turnsToExplore: 60000, explorationTiers },
    { id: IDS.zones.whisperingPlains, name: 'Whispering Plains', description: 'Vast grasslands where the wind carries distant cries.', difficulty: 3, travelCost: 250, isStarter: false, zoneType: 'wild', zoneExitChance: 0.000013, turnsToExplore: 60000, explorationTiers },
    { id: IDS.zones.thornwall, name: 'Thornwall', description: 'A fortified frontier settlement. Advanced crafting facilities line the main road.', difficulty: 0, travelCost: 0, isStarter: false, zoneType: 'town', zoneExitChance: null, maxCraftingLevel: null },
    { id: IDS.zones.hauntedMarsh, name: 'Haunted Marsh', description: 'Fetid swampland shrouded in mist. The dead do not rest here.', difficulty: 4, travelCost: 400, isStarter: false, zoneType: 'wild', zoneExitChance: 0.0000067, turnsToExplore: 80000, explorationTiers },
    { id: IDS.zones.crystalCaverns, name: 'Crystal Caverns', description: 'Glittering underground chambers pulsing with arcane energy.', difficulty: 4, travelCost: 400, isStarter: false, zoneType: 'wild', zoneExitChance: null, turnsToExplore: 80000, explorationTiers },
    { id: IDS.zones.sunkenRuins, name: 'Sunken Ruins', description: 'Ancient ruins half-submerged in brackish water. Unspeakable things dwell in the depths.', difficulty: 5, travelCost: 600, isStarter: false, zoneType: 'wild', zoneExitChance: null, turnsToExplore: 100000, explorationTiers },
  ];

  await prisma.zone.createMany({ data: zones });
  console.log(`  ${zones.length} zones created.`);
}

// ============================================================================
// Zone Connections (bidirectional)
// ============================================================================

async function seedZoneConnections() {
  console.log('  Seeding zone connections...');
  const p = prisma as any;

  // [fromZone, toZone, explorationThreshold for forward direction]
  // Reverse directions default to 0 (no threshold)
  const pairs: [string, string, number][] = [
    [IDS.zones.millbrook, IDS.zones.forestEdge, 0],
    [IDS.zones.forestEdge, IDS.zones.deepForest, 40],
    [IDS.zones.forestEdge, IDS.zones.caveEntrance, 60],
    [IDS.zones.deepForest, IDS.zones.ancientGrove, 50],
    [IDS.zones.deepForest, IDS.zones.whisperingPlains, 70],
    [IDS.zones.caveEntrance, IDS.zones.deepMines, 60],
    [IDS.zones.whisperingPlains, IDS.zones.thornwall, 50],
    [IDS.zones.thornwall, IDS.zones.hauntedMarsh, 40],
    [IDS.zones.thornwall, IDS.zones.crystalCaverns, 60],
    [IDS.zones.hauntedMarsh, IDS.zones.sunkenRuins, 70],
  ];

  const rows = pairs.flatMap(([a, b, threshold]) => [
    { id: randomUUID(), fromId: a, toId: b, explorationThreshold: threshold },
    { id: randomUUID(), fromId: b, toId: a, explorationThreshold: 0 },
  ]);

  await p.zoneConnection.createMany({ data: rows });
  console.log(`  ${rows.length} zone connections created (${pairs.length} bidirectional pairs).`);
}

// ============================================================================
// Item Templates
// ============================================================================

async function seedItemTemplates() {
  console.log('  Seeding item templates...');
  const items = getAllItemTemplates().map(item => ({
    ...item,
    flavorText: ITEM_FLAVOR_TEXT[item.name] ?? null,
  }));
  await prisma.itemTemplate.createMany({ data: items });
  console.log(`  ${items.length} item templates created.`);

  // Log unmatched flavour text entries
  const itemNames = new Set(items.map(i => i.name));
  for (const name of Object.keys(ITEM_FLAVOR_TEXT)) {
    if (!itemNames.has(name)) console.warn(`  ⚠ Unmatched item flavour text: "${name}"`);
  }
}

// ============================================================================
// Mob Templates
// ============================================================================

async function seedMobs() {
  console.log('  Seeding mob templates...');
  const mobs = getAllMobTemplates().map(mob => {
    const flavor = MOB_FLAVOR_TEXT[mob.name];
    return {
      ...mob,
      flavorAppearance: flavor?.appearance ?? null,
      flavorBehavior: flavor?.behavior ?? null,
      flavorLore: flavor?.lore ?? null,
    };
  });
  await prisma.mobTemplate.createMany({ data: mobs });
  console.log(`  ${mobs.length} mob templates created.`);

  // Log unmatched mob flavour text entries
  const mobNames = new Set(mobs.map(m => m.name));
  for (const name of Object.keys(MOB_FLAVOR_TEXT)) {
    if (!mobNames.has(name)) console.warn(`  ⚠ Unmatched mob flavour text: "${name}"`);
  }
}

// ============================================================================
// Mob Families, Members, Zone Mappings
// ============================================================================

async function seedMobFamilies() {
  console.log('  Seeding mob families...');
  const p = prisma as any;

  const families = getAllMobFamilies().map(f => ({
    ...f,
    flavorOverview: MOB_FAMILY_FLAVOR[f.name] ?? null,
  }));
  await p.mobFamily.createMany({ data: families });
  console.log(`  ${families.length} mob families created.`);

  // Log unmatched family flavour text entries
  const familyNames = new Set(families.map(f => f.name));
  for (const name of Object.keys(MOB_FAMILY_FLAVOR)) {
    if (!familyNames.has(name)) console.warn(`  ⚠ Unmatched family flavour text: "${name}"`);
  }

  const members = getAllMobFamilyMembers();
  await p.mobFamilyMember.createMany({ data: members });
  console.log(`  ${members.length} mob family members linked.`);

  const zoneFamilies = getAllZoneMobFamilies();
  await p.zoneMobFamily.createMany({ data: zoneFamilies });
  console.log(`  ${zoneFamilies.length} zone-family mappings created.`);
}

// ============================================================================
// Resource Nodes
// ============================================================================

async function seedResourceNodes() {
  console.log('  Seeding resource nodes...');
  const nodes = getAllResourceNodes();
  await prisma.resourceNode.createMany({ data: nodes });
  console.log(`  ${nodes.length} resource nodes created.`);
}

// ============================================================================
// Drop Tables
// ============================================================================

async function seedDropTables() {
  console.log('  Seeding drop tables...');
  const drops = getAllDropTables();
  await prisma.dropTable.createMany({ data: drops });
  console.log(`  ${drops.length} drop table entries created.`);
}

// ============================================================================
// Crafting Recipes
// ============================================================================

async function seedRecipes() {
  console.log('  Seeding crafting recipes...');
  const recipes = getAllRecipes();
  await prisma.craftingRecipe.createMany({ data: recipes });
  console.log(`  ${recipes.length} crafting recipes created.`);
}

// ============================================================================
// Chest Drop Tables
// ============================================================================

async function seedChestDropTables() {
  console.log('  Seeding chest drop tables...');
  const p = prisma as any;
  const chests = getAllChestDropTables();
  await p.chestDropTable.createMany({ data: chests });
  console.log(`  ${chests.length} chest drop table entries created.`);
}

// ============================================================================
// PvP Arena Bots
// ============================================================================

async function seedBots() {
  console.log('  Seeding PvP arena bots...');
  const p = prisma as any;

  const starterZone = await prisma.zone.findFirst({ where: { isStarter: true } });
  if (!starterZone) {
    console.log('  No starter zone found — skipping bots.');
    return;
  }

  const bots = generateBotPlayers();
  const now = new Date();

  for (const bot of bots) {
    // Create player with nested turnBank and skills
    const player = await prisma.player.create({
      data: {
        id: bot.player.id,
        username: bot.player.username,
        email: bot.player.email,
        passwordHash: bot.player.passwordHash,
        isBot: true,
        characterLevel: bot.player.characterLevel,
        attributes: bot.player.attributes,
        currentHp: bot.player.currentHp,
        currentZoneId: starterZone.id,
        homeTownId: starterZone.id,
        gold: 500,
        turnBank: {
          create: { currentTurns: 0, lastRegenAt: now },
        },
        skills: {
          create: bot.skills.map((s) => ({
            skillType: s.skillType,
            level: s.level,
            xp: s.xp,
          })),
        },
      },
    });

    // Create items (weapon + armor)
    const itemsToCreate: Array<{ id: string; templateId: string; slot: string }> = [];

    const weaponItemId = randomUUID();
    await prisma.item.create({
      data: {
        id: weaponItemId,
        templateId: bot.weaponTemplateId,
        ownerId: player.id,
        rarity: bot.rarity,
        currentDurability: 100,
        maxDurability: 100,
      },
    });
    itemsToCreate.push({ id: weaponItemId, templateId: bot.weaponTemplateId, slot: 'main_hand' });

    for (const armor of bot.armorTemplateIds) {
      const armorItemId = randomUUID();
      await prisma.item.create({
        data: {
          id: armorItemId,
          templateId: armor.templateId,
          ownerId: player.id,
          rarity: bot.rarity,
          currentDurability: 100,
          maxDurability: 100,
        },
      });
      itemsToCreate.push({ id: armorItemId, templateId: armor.templateId, slot: armor.slot });
    }

    // Create equipment slots for all items
    for (const item of itemsToCreate) {
      await prisma.playerEquipment.create({
        data: {
          playerId: player.id,
          slot: item.slot,
          itemId: item.id,
        },
      });
    }

    // Create PvP rating
    await p.pvpRating.create({
      data: {
        playerId: player.id,
        rating: bot.pvpRating,
        bestRating: bot.pvpRating,
      },
    });
  }

  console.log(`  ${bots.length} PvP arena bots created.`);
}

// ============================================================================
// Shop Items
// ============================================================================

async function seedShopItems() {
  console.log('  Seeding shop items...');

  const items = [
    // Reset Scrolls
    { key: 'attribute_reset_scroll', name: 'Attribute Reset Scroll', description: 'Reset all attribute points for reallocation', cost: 40, category: 'reset', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 10 },
    { key: 'talent_reset_scroll', name: 'Talent Reset Scroll', description: 'Reset all skill point allocations without turn cost', cost: 40, category: 'reset', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 11 },
    { key: 'efficiency_reset_scroll', name: 'Efficiency Reset Scroll', description: 'Reset all skill XP efficiencies to 100%', cost: 35, category: 'reset', weeklyLimit: 2, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 12 },
    // Upgrade Scrolls
    { key: 'forge_luck_scroll', name: 'Forge Luck Scroll', description: 'Double forge upgrade chance for next 3 upgrades', cost: 35, category: 'upgrade', weeklyLimit: 2, lifetimeLimit: null, buffType: 'forge_luck', buffValue: 2.0, buffUses: 3, sortOrder: 20 },
    { key: 'forge_protection_scroll', name: 'Forge Protection Scroll', description: 'Protects your item from destruction on next failed forge upgrade', cost: 75, category: 'upgrade', weeklyLimit: 2, lifetimeLimit: null, buffType: 'forge_protection', buffValue: 1.0, buffUses: 1, sortOrder: 21 },
    // Buff Scrolls
    { key: 'xp_boost_scroll', name: 'XP Boost Scroll', description: '+10% XP for next 100 XP-granting actions', cost: 25, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'xp_boost', buffValue: 0.10, buffUses: 100, sortOrder: 30 },
    { key: 'gathering_yield_scroll', name: 'Gathering Yield Scroll', description: '+15% gathering yield for next 50 gathers', cost: 25, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'gathering_yield', buffValue: 0.15, buffUses: 50, sortOrder: 31 },
    { key: 'crafting_fortune_scroll', name: 'Crafting Fortune Scroll', description: '+10% crafting crit for next 30 crafts', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'crafting_crit', buffValue: 0.10, buffUses: 30, sortOrder: 32 },
    { key: 'combat_power_scroll', name: 'Combat Power Scroll', description: '+10% damage for next 50 combats', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'combat_damage', buffValue: 0.10, buffUses: 50, sortOrder: 33 },
    { key: 'iron_skin_scroll', name: 'Iron Skin Scroll', description: '+10% defence for next 50 combats', cost: 30, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'combat_defence', buffValue: 0.10, buffUses: 50, sortOrder: 34 },
    { key: 'durability_shield_scroll', name: 'Durability Shield Scroll', description: 'No durability loss for next 50 combats', cost: 20, category: 'buff', weeklyLimit: 2, lifetimeLimit: null, buffType: 'durability_shield', buffValue: 1.0, buffUses: 50, sortOrder: 35 },
    // Utility
    { key: 'teleport_scroll', name: 'Teleport Scroll', description: 'Instantly travel to any discovered zone', cost: 15, category: 'utility', weeklyLimit: 3, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 40 },
    { key: 'hearthstone', name: 'Hearthstone', description: 'Instantly teleport to your home town', cost: 10, category: 'utility', weeklyLimit: 5, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 41 },
    { key: 'bestiary_tome', name: 'Bestiary Tome', description: 'Fully unlock bestiary entry for one chosen mob', cost: 35, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 42 },
    { key: 'recipe_scroll', name: 'Recipe Scroll', description: 'Unlock a random unlearned recipe you can craft', cost: 30, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 43 },
    { key: 'guild_contract_reroll', name: 'Guild Contract Reroll', description: 'Reroll one guild contract (leader/officer only)', cost: 20, category: 'utility', weeklyLimit: 1, lifetimeLimit: null, buffType: null, buffValue: null, buffUses: null, sortOrder: 44 },
    // Prestige
    { key: 'title_questmaster', name: 'Title: Questmaster', description: 'Exclusive cosmetic title for dedicated questers', cost: 500, category: 'prestige', weeklyLimit: null, lifetimeLimit: 1, buffType: null, buffValue: null, buffUses: null, sortOrder: 50 },
    { key: 'title_token_hoarder', name: 'Title: Token Hoarder', description: 'Exclusive cosmetic title for the most dedicated', cost: 1000, category: 'prestige', weeklyLimit: null, lifetimeLimit: 1, buffType: null, buffValue: null, buffUses: null, sortOrder: 51 },
  ];

  for (const item of items) {
    await prisma.shopItem.upsert({
      where: { key: item.key },
      create: item,
      update: { name: item.name, description: item.description, cost: item.cost, category: item.category, weeklyLimit: item.weeklyLimit, lifetimeLimit: item.lifetimeLimit, buffType: item.buffType, buffValue: item.buffValue, buffUses: item.buffUses, sortOrder: item.sortOrder },
    });
  }

  console.log(`  Seeded ${items.length} shop items`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('Seeding PocketRealm...');

  await cleanTemplateData();

  // Batch 1: World geography
  await seedZones();
  await seedZoneConnections();

  // Batch 2: Items & creatures
  await seedItemTemplates();
  await seedMobs();
  await seedMobFamilies();

  // Batch 3: Economy
  await seedResourceNodes();
  await seedDropTables();
  await seedRecipes();

  // Batch 4: Advanced loot
  await seedChestDropTables();

  // Batch 5: PvP Arena bots
  await seedBots();

  // Batch 6: Quest shop
  await seedShopItems();

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
