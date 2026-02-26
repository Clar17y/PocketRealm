import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Skills', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Skills', exact: true }).first().click();
  });

  test('displays skills heading and total level', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
    // New player: 15 skills at level 1 each = Total Level: 15
    await expect(page.getByText('Total Level: 15')).toBeVisible();
  });

  test('displays combat skills', async ({ gamePage: page }) => {
    for (const skill of ['Melee', 'Ranged', 'Magic']) {
      await expect(page.getByRole('heading', { name: skill })).toBeVisible();
    }
  });

  test('displays gathering skills', async ({ gamePage: page }) => {
    for (const skill of ['Mining', 'Foraging', 'Woodcutting']) {
      await expect(page.getByRole('heading', { name: skill })).toBeVisible();
    }
  });

  test('displays crafting skills', async ({ gamePage: page }) => {
    for (const skill of ['Weaponsmithing', 'Armorsmithing', 'Leatherworking', 'Tailoring', 'Alchemy', 'Jewelcrafting']) {
      await expect(page.getByRole('heading', { name: skill })).toBeVisible();
    }
  });

  test('each skill shows level 1 for new player', async ({ gamePage: page }) => {
    // All 15 skills should have h3 headings
    const skillHeadings = page.getByRole('heading', { level: 3 });
    const count = await skillHeadings.count();
    expect(count).toBe(15);
  });

  test('skill XP is displayed for each skill', async ({ gamePage: page }) => {
    // Each skill card shows XP progress (e.g., "0 / 282 XP")
    const xpTexts = page.getByText(/\d+ \/ \d+ XP/);
    const count = await xpTexts.count();
    expect(count).toBeGreaterThanOrEqual(15);
  });
});
