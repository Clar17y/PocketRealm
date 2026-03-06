"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const IDS = {
    zones: {
        forestEdge: '11111111-1111-1111-1111-111111111111',
        deepForest: '22222222-2222-2222-2222-222222222222',
    },
    mobs: {
        forestRat: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        wildBoar: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        forestWolf: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    },
    items: {
        copperOre: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        woodenSword: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        leatherCap: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    },
    resourceNodes: {
        copperNodeForestEdge: '99999999-9999-9999-9999-999999999999',
    },
    dropTables: {
        ratCopper: '12345678-1111-1111-1111-111111111111',
        boarCopper: '12345678-2222-2222-2222-222222222222',
        boarSword: '12345678-3333-3333-3333-333333333333',
        wolfCap: '12345678-4444-4444-4444-444444444444',
    },
    recipes: {
        woodenSword: '77777777-7777-7777-7777-777777777777',
    },
};
async function seedZones() {
    await prisma.zone.upsert({
        where: { id: IDS.zones.forestEdge },
        create: {
            id: IDS.zones.forestEdge,
            name: 'Forest Edge',
            description: 'A bright woodland border with gentle paths. A safe place to begin.',
            difficulty: 1,
            travelCost: 50,
            isStarter: true,
        },
        update: {
            name: 'Forest Edge',
            description: 'A bright woodland border with gentle paths. A safe place to begin.',
            difficulty: 1,
            travelCost: 50,
            isStarter: true,
        },
    });
    await prisma.zone.upsert({
        where: { id: IDS.zones.deepForest },
        create: {
            id: IDS.zones.deepForest,
            name: 'Deep Forest',
            description: 'Dense and shadowed. Predators stalk between the trees.',
            difficulty: 2,
            travelCost: 150,
            isStarter: false,
        },
        update: {
            name: 'Deep Forest',
            description: 'Dense and shadowed. Predators stalk between the trees.',
            difficulty: 2,
            travelCost: 150,
            isStarter: false,
        },
    });
}
async function seedItemTemplates() {
    await prisma.itemTemplate.upsert({
        where: { id: IDS.items.copperOre },
        create: {
            id: IDS.items.copperOre,
            name: 'Copper Ore',
            itemType: 'resource',
            slot: null,
            tier: 1,
            baseStats: {},
            requiredSkill: null,
            requiredLevel: 1,
            maxDurability: 0,
            stackable: true,
        },
        update: {
            name: 'Copper Ore',
            itemType: 'resource',
            slot: null,
            tier: 1,
            baseStats: {},
            requiredSkill: null,
            requiredLevel: 1,
            maxDurability: 0,
            stackable: true,
        },
    });
    await prisma.itemTemplate.upsert({
        where: { id: IDS.items.woodenSword },
        create: {
            id: IDS.items.woodenSword,
            name: 'Wooden Sword',
            itemType: 'weapon',
            slot: 'main_hand',
            tier: 1,
            baseStats: { attack: 5 },
            requiredSkill: 'melee',
            requiredLevel: 1,
            maxDurability: 100,
            stackable: false,
        },
        update: {
            name: 'Wooden Sword',
            itemType: 'weapon',
            slot: 'main_hand',
            tier: 1,
            baseStats: { attack: 5 },
            requiredSkill: 'melee',
            requiredLevel: 1,
            maxDurability: 100,
            stackable: false,
        },
    });
    await prisma.itemTemplate.upsert({
        where: { id: IDS.items.leatherCap },
        create: {
            id: IDS.items.leatherCap,
            name: 'Leather Cap',
            itemType: 'armor',
            slot: 'head',
            tier: 1,
            baseStats: { armor: 3 },
            requiredSkill: null,
            requiredLevel: 1,
            maxDurability: 80,
            stackable: false,
        },
        update: {
            name: 'Leather Cap',
            itemType: 'armor',
            slot: 'head',
            tier: 1,
            baseStats: { armor: 3 },
            requiredSkill: null,
            requiredLevel: 1,
            maxDurability: 80,
            stackable: false,
        },
    });
}
async function seedMobs() {
    await prisma.mobTemplate.upsert({
        where: { id: IDS.mobs.forestRat },
        create: {
            id: IDS.mobs.forestRat,
            name: 'Forest Rat',
            zoneId: IDS.zones.forestEdge,
            hp: 15,
            attack: 8,
            defence: 3,
            evasion: 2,
            damageMin: 1,
            damageMax: 4,
            xpReward: 10,
            encounterWeight: 120,
            spellPattern: [],
        },
        update: {
            name: 'Forest Rat',
            zoneId: IDS.zones.forestEdge,
            hp: 15,
            attack: 8,
            defence: 3,
            evasion: 2,
            damageMin: 1,
            damageMax: 4,
            xpReward: 10,
            encounterWeight: 120,
            spellPattern: [],
        },
    });
    await prisma.mobTemplate.upsert({
        where: { id: IDS.mobs.wildBoar },
        create: {
            id: IDS.mobs.wildBoar,
            name: 'Wild Boar',
            zoneId: IDS.zones.forestEdge,
            hp: 25,
            attack: 12,
            defence: 8,
            evasion: 1,
            damageMin: 2,
            damageMax: 6,
            xpReward: 20,
            encounterWeight: 80,
            spellPattern: [],
        },
        update: {
            name: 'Wild Boar',
            zoneId: IDS.zones.forestEdge,
            hp: 25,
            attack: 12,
            defence: 8,
            evasion: 1,
            damageMin: 2,
            damageMax: 6,
            xpReward: 20,
            encounterWeight: 80,
            spellPattern: [],
        },
    });
    await prisma.mobTemplate.upsert({
        where: { id: IDS.mobs.forestWolf },
        create: {
            id: IDS.mobs.forestWolf,
            name: 'Forest Wolf',
            zoneId: IDS.zones.deepForest,
            hp: 35,
            attack: 18,
            defence: 12,
            evasion: 5,
            damageMin: 4,
            damageMax: 9,
            xpReward: 40,
            encounterWeight: 100,
            spellPattern: [],
        },
        update: {
            name: 'Forest Wolf',
            zoneId: IDS.zones.deepForest,
            hp: 35,
            attack: 18,
            defence: 12,
            evasion: 5,
            damageMin: 4,
            damageMax: 9,
            xpReward: 40,
            encounterWeight: 100,
            spellPattern: [],
        },
    });
}
async function seedResourceNodes() {
    await prisma.resourceNode.upsert({
        where: { id: IDS.resourceNodes.copperNodeForestEdge },
        create: {
            id: IDS.resourceNodes.copperNodeForestEdge,
            zoneId: IDS.zones.forestEdge,
            resourceType: 'copper_ore',
            skillRequired: 'mining',
            levelRequired: 1,
            baseYield: 1,
            discoveryChance: new client_1.Prisma.Decimal('0.25'),
        },
        update: {
            zoneId: IDS.zones.forestEdge,
            resourceType: 'copper_ore',
            skillRequired: 'mining',
            levelRequired: 1,
            baseYield: 1,
            discoveryChance: new client_1.Prisma.Decimal('0.25'),
        },
    });
}
async function seedDropTables() {
    await prisma.dropTable.upsert({
        where: { id: IDS.dropTables.ratCopper },
        create: {
            id: IDS.dropTables.ratCopper,
            mobTemplateId: IDS.mobs.forestRat,
            itemTemplateId: IDS.items.copperOre,
            dropChance: new client_1.Prisma.Decimal('0.50'),
            minQuantity: 1,
            maxQuantity: 3,
        },
        update: {
            mobTemplateId: IDS.mobs.forestRat,
            itemTemplateId: IDS.items.copperOre,
            dropChance: new client_1.Prisma.Decimal('0.50'),
            minQuantity: 1,
            maxQuantity: 3,
        },
    });
    await prisma.dropTable.upsert({
        where: { id: IDS.dropTables.boarCopper },
        create: {
            id: IDS.dropTables.boarCopper,
            mobTemplateId: IDS.mobs.wildBoar,
            itemTemplateId: IDS.items.copperOre,
            dropChance: new client_1.Prisma.Decimal('0.30'),
            minQuantity: 1,
            maxQuantity: 2,
        },
        update: {
            mobTemplateId: IDS.mobs.wildBoar,
            itemTemplateId: IDS.items.copperOre,
            dropChance: new client_1.Prisma.Decimal('0.30'),
            minQuantity: 1,
            maxQuantity: 2,
        },
    });
    await prisma.dropTable.upsert({
        where: { id: IDS.dropTables.boarSword },
        create: {
            id: IDS.dropTables.boarSword,
            mobTemplateId: IDS.mobs.wildBoar,
            itemTemplateId: IDS.items.woodenSword,
            dropChance: new client_1.Prisma.Decimal('0.10'),
            minQuantity: 1,
            maxQuantity: 1,
        },
        update: {
            mobTemplateId: IDS.mobs.wildBoar,
            itemTemplateId: IDS.items.woodenSword,
            dropChance: new client_1.Prisma.Decimal('0.10'),
            minQuantity: 1,
            maxQuantity: 1,
        },
    });
    await prisma.dropTable.upsert({
        where: { id: IDS.dropTables.wolfCap },
        create: {
            id: IDS.dropTables.wolfCap,
            mobTemplateId: IDS.mobs.forestWolf,
            itemTemplateId: IDS.items.leatherCap,
            dropChance: new client_1.Prisma.Decimal('0.12'),
            minQuantity: 1,
            maxQuantity: 1,
        },
        update: {
            mobTemplateId: IDS.mobs.forestWolf,
            itemTemplateId: IDS.items.leatherCap,
            dropChance: new client_1.Prisma.Decimal('0.12'),
            minQuantity: 1,
            maxQuantity: 1,
        },
    });
}
async function seedRecipes() {
    await prisma.craftingRecipe.upsert({
        where: { id: IDS.recipes.woodenSword },
        create: {
            id: IDS.recipes.woodenSword,
            skillType: 'weaponsmithing',
            requiredLevel: 1,
            resultTemplateId: IDS.items.woodenSword,
            turnCost: 50,
            materials: [
                { templateId: IDS.items.copperOre, quantity: 5 },
            ],
            xpReward: 25,
        },
        update: {
            skillType: 'weaponsmithing',
            requiredLevel: 1,
            resultTemplateId: IDS.items.woodenSword,
            turnCost: 50,
            materials: [
                { templateId: IDS.items.copperOre, quantity: 5 },
            ],
            xpReward: 25,
        },
    });
}
async function main() {
    console.log('Seeding PocketRealm...');
    await seedZones();
    await seedItemTemplates();
    await seedMobs();
    await seedResourceNodes();
    await seedDropTables();
    await seedRecipes();
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
