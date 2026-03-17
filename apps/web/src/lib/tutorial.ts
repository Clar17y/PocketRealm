import {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_STARTER_WEAPON,
  TUTORIAL_STEP_SKILL_POINTS,
  TUTORIAL_STEP_ATTRIBUTE_POINTS,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
} from '@pocketrealm/shared';

export {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_STARTER_WEAPON,
  TUTORIAL_STEP_SKILL_POINTS,
  TUTORIAL_STEP_ATTRIBUTE_POINTS,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
};

export type BottomTab = 'home' | 'explore' | 'inventory' | 'combat' | 'profile';

export interface TutorialStepDef {
  banner: string;
  dialog: { title: string; body: string };
  pulseTab: BottomTab | null;
  navigateTo: string | null;
}

export const TUTORIAL_STEPS: Record<number, TutorialStepDef> = {
  [TUTORIAL_STEP_WELCOME]: {
    banner: 'Welcome! You have 64,800 turns to spend. Let\u2019s learn the basics.',
    dialog: {
      title: 'Welcome, Adventurer!',
      body: 'Everything in this world costs turns. You earn 1 turn per second, and you start with a full bank of 64,800 (18 hours\u2019 worth). Turns are used to explore, fight, gather resources, and craft gear. Let\u2019s walk through the basics!',
    },
    pulseTab: null,
    navigateTo: null,
  },
  [TUTORIAL_STEP_STARTER_WEAPON]: {
    banner: 'Kessa Ironweld has a weapon for you. Choose wisely!',
    dialog: {
      title: 'A Gift from the Forge',
      body: "Kessa Ironweld, Millbrook\u2019s blacksmith, won\u2019t let you leave town bare-handed. Pick a weapon \u2014 sword, bow, or staff \u2014 and she\u2019ll see you off.",
    },
    pulseTab: null,
    navigateTo: null,
  },
  [TUTORIAL_STEP_SKILL_POINTS]: {
    banner: 'You have 5 skill points! Open your abilities and unlock a combat skill.',
    dialog: {
      title: 'Skill Points',
      body: 'You start with 5 skill points to spend on combat abilities. Open the Combat tab and visit Talents to unlock a powerful ability like Fireball, Aimed Shot, or Power Strike. This will transform your first fight!',
    },
    pulseTab: 'combat',
    navigateTo: 'combat',
  },
  [TUTORIAL_STEP_ATTRIBUTE_POINTS]: {
    banner: 'You have 5 attribute points! Allocate them to shape your build.',
    dialog: {
      title: 'Attribute Points',
      body: 'You start with 5 attribute points to allocate. Invest in Strength for melee power, Dexterity for ranged accuracy, Intelligence for magic damage, or spread them around. Your choices shape your character\u2019s strengths!',
    },
    pulseTab: 'profile',
    navigateTo: 'profile',
  },
  [TUTORIAL_STEP_EXPLORE]: {
    banner: 'Use the turn slider to invest turns and explore your zone.',
    dialog: {
      title: 'Exploration',
      body: 'Use the turn slider to choose how many turns to invest in exploring your zone. The more turns you spend, the higher your chances of discovering encounter sites, resource nodes, and hidden treasure.',
    },
    pulseTab: 'explore',
    navigateTo: 'explore',
  },
  [TUTORIAL_STEP_COMBAT]: {
    banner: 'You have an encounter site! Select it and fight the mobs inside.',
    dialog: {
      title: 'Combat',
      body: 'Encounter sites contain groups of mobs to fight. Your character follows the combat template you\'ve set — visit the Templates screen under the Combat tab to customise your action rotation. Winning earns XP for your combat skills and drops loot!',
    },
    pulseTab: 'combat',
    navigateTo: 'combat',
  },
  [TUTORIAL_STEP_GATHER]: {
    banner: 'Select a resource node and invest turns to mine materials.',
    dialog: {
      title: 'Gathering',
      body: 'Resource nodes let you mine ore and other materials. These materials are used for crafting equipment. Select a node and invest turns to gather resources.',
    },
    pulseTab: 'explore',
    navigateTo: 'gathering',
  },
  [TUTORIAL_STEP_TRAVEL]: {
    banner: 'Open the World Map and travel to the nearest town.',
    dialog: {
      title: 'Zone Travel',
      body: 'Crafting can only be done in towns. Open the World Map to see connected zones and travel to Millbrook, the nearest town. Travelling costs turns based on distance.',
    },
    pulseTab: 'home',
    navigateTo: 'zones',
  },
  [TUTORIAL_STEP_REFINE]: {
    banner: 'Raw logs can\u2019t be used directly. Refine them into planks first!',
    dialog: {
      title: 'Refining',
      body: 'Raw materials like logs and ore must be refined before they can be used in crafting. Select a refining recipe and process your Oak Logs into Planks.',
    },
    pulseTab: 'explore',
    navigateTo: 'crafting',
  },
  [TUTORIAL_STEP_CRAFT]: {
    banner: 'Now use your refined materials to craft some gear!',
    dialog: {
      title: 'Crafting',
      body: 'Use refined materials to craft equipment. Select a recipe you have materials for and craft it. Higher crafting skill levels unlock better recipes and increase your chance of a critical craft.',
    },
    pulseTab: 'explore',
    navigateTo: 'crafting',
  },
  [TUTORIAL_STEP_EQUIP]: {
    banner: 'Equip the weapon Kessa gave you!',
    dialog: {
      title: 'Equipment',
      body: 'Open your inventory and equip the weapon Kessa gave you. Equipment boosts your stats for combat and improves your chances of survival.',
    },
    pulseTab: 'inventory',
    navigateTo: 'inventory',
  },
  [TUTORIAL_STEP_DONE]: {
    banner: 'Tutorial complete! You\u2019ve learned the core loop. Good luck out there!',
    dialog: {
      title: 'Tutorial Complete!',
      body: 'You now know the core gameplay loop: Equip \u2192 Build \u2192 Explore \u2192 Fight \u2192 Gather \u2192 Travel \u2192 Refine \u2192 Craft. Keep progressing your skills, discover new zones, and take on tougher challenges!',
    },
    pulseTab: null,
    navigateTo: null,
  },
};

export function isTutorialActive(step: number): boolean {
  return step >= 0 && step < TUTORIAL_COMPLETED;
}
