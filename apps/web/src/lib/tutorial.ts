export const TUTORIAL_STEP_WELCOME = 0;
export const TUTORIAL_STEP_EXPLORE = 1;
export const TUTORIAL_STEP_COMBAT = 2;
export const TUTORIAL_STEP_GATHER = 3;
export const TUTORIAL_STEP_TRAVEL = 4;
export const TUTORIAL_STEP_REFINE = 5;
export const TUTORIAL_STEP_CRAFT = 6;
export const TUTORIAL_STEP_EQUIP = 7;
export const TUTORIAL_STEP_DONE = 8;
export const TUTORIAL_COMPLETED = 9;
export const TUTORIAL_SKIPPED = -1;

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
      body: 'Encounter sites contain groups of mobs to fight. Select a site and engage in combat to earn XP for your combat skills and collect loot drops. Winning makes you stronger!',
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
    banner: 'Tap your crafted gear and equip it to a slot.',
    dialog: {
      title: 'Equipment',
      body: 'Go to your inventory and equip the gear you\u2019ve crafted or looted. Equipment boosts your stats for combat and improves your chances of survival in tougher zones.',
    },
    pulseTab: 'inventory',
    navigateTo: 'inventory',
  },
  [TUTORIAL_STEP_DONE]: {
    banner: 'Tutorial complete! You\u2019ve learned the core loop. Good luck out there!',
    dialog: {
      title: 'Tutorial Complete!',
      body: 'You now know the core gameplay loop: Explore \u2192 Fight \u2192 Gather \u2192 Travel \u2192 Refine \u2192 Craft \u2192 Equip. Keep progressing your skills, discover new zones, and take on tougher challenges!',
    },
    pulseTab: null,
    navigateTo: null,
  },
};

export function isTutorialActive(step: number): boolean {
  return step >= 0 && step < TUTORIAL_COMPLETED;
}
