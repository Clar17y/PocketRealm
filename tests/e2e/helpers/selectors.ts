import { Page } from '@playwright/test';

/* ---- Auth pages ---- */

export const auth = {
  emailInput: (page: Page) => page.locator('#email'),
  passwordInput: (page: Page) => page.locator('#password'),
  usernameInput: (page: Page) => page.locator('#username'),
  loginButton: (page: Page) => page.getByRole('button', { name: 'Login' }),
  registerButton: (page: Page) => page.getByRole('button', { name: 'Register' }),
  errorMessage: (page: Page) => page.locator('[class*="error"]'),
};

/* ---- Game navigation ---- */

export const nav = {
  tab: (page: Page, name: string) => page.getByRole('button', { name, exact: true }),
  screenButton: (page: Page, name: string) => page.getByRole('button', { name, exact: true }),
};

/* ---- Dashboard ---- */

export const dashboard = {
  exploreButton: (page: Page) => page.getByRole('button', { name: 'Explore' }),
  mineButton: (page: Page) => page.getByRole('button', { name: 'Mine' }),
  craftButton: (page: Page) => page.getByRole('button', { name: 'Craft' }),
  restButton: (page: Page) => page.getByRole('button', { name: /^(Rest|Recover)$/ }),
  quickRestButton: (page: Page) => page.getByRole('button', { name: /Quick Rest/ }),
  allocateButton: (page: Page) => page.getByRole('button', { name: '+1' }),
};

/* ---- Common patterns ---- */

export const common = {
  pixelButton: (page: Page, name: string) => page.getByRole('button', { name }),
  modal: (page: Page) => page.locator('[class*="fixed"][class*="inset-0"]'),
  closeModal: (page: Page) => page.locator('[class*="fixed"] button:has(svg)').first(),
  slider: (page: Page) => page.locator('input[type="range"]'),
  selectDropdown: (page: Page, label?: string) =>
    label ? page.getByLabel(label) : page.locator('select').first(),
};

/* ---- Exploration ---- */

export const exploration = {
  startButton: (page: Page) => page.getByRole('button', { name: 'Start Exploration' }),
  turnSlider: (page: Page) => page.locator('input[type="range"]').first(),
  presetButton: (page: Page, label: string) => page.getByRole('button', { name: label, exact: true }),
};

/* ---- Combat ---- */

export const combat = {
  startCombatButton: (page: Page) => page.getByRole('button', { name: /Start Combat/ }),
  continueButton: (page: Page) => page.getByRole('button', { name: 'Continue' }),
  retreatButton: (page: Page) => page.getByRole('button', { name: 'Retreat' }),
  tryAgainButton: (page: Page) => page.getByRole('button', { name: 'Try Again' }),
};

/* ---- Inventory ---- */

export const inventory = {
  equipButton: (page: Page) => page.getByRole('button', { name: 'Equip', exact: true }),
  unequipButton: (page: Page) => page.getByRole('button', { name: 'Unequip' }),
  repairButton: (page: Page) => page.getByRole('button', { name: /^(Repair|Fix)/ }),
  salvageButton: (page: Page) => page.getByRole('button', { name: 'Salvage' }),
  dropButton: (page: Page) => page.getByRole('button', { name: 'Drop' }),
  useButton: (page: Page) => page.getByRole('button', { name: 'Use' }),
};

/* ---- Equipment ---- */

export const equipment = {
  slot: (page: Page, slotName: string) => page.getByText(slotName, { exact: true }),
};

/* ---- Crafting ---- */

export const crafting = {
  craftButton: (page: Page) => page.getByRole('button', { name: /^Craft / }),
  quantityPlus: (page: Page) => page.locator('button:has(svg[class*="plus"])'),
  quantityMinus: (page: Page) => page.locator('button:has(svg[class*="minus"])'),
  maxButton: (page: Page) => page.getByRole('button', { name: /^Max/ }),
};

/* ---- Forge ---- */

export const forge = {
  upgradeButton: (page: Page) => page.getByRole('button', { name: 'Upgrade Rarity' }),
  rerollButton: (page: Page) => page.getByRole('button', { name: 'Reroll Bonus Stats' }),
};

/* ---- Gathering ---- */

export const gathering = {
  startButton: (page: Page) => page.getByRole('button', { name: /^Start / }),
};

/* ---- Rest ---- */

export const rest = {
  restButton: (page: Page) => page.getByRole('button', { name: 'Rest', exact: true }),
  recoverButton: (page: Page) => page.getByRole('button', { name: 'Recover', exact: true }),
};

/* ---- Zone map ---- */

export const zones = {
  travelButton: (page: Page, zoneName: string) =>
    page.getByRole('button', { name: new RegExp(`Travel to ${zoneName}`) }),
  exploreButton: (page: Page, zoneName: string) =>
    page.getByRole('button', { name: new RegExp(`Explore ${zoneName}`) }),
};

/* ---- Achievements ---- */

export const achievements = {
  claimButton: (page: Page) => page.getByRole('button', { name: 'Claim' }),
  categoryButton: (page: Page, category: string) =>
    page.getByRole('button', { name: category, exact: true }),
};
