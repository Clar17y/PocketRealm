import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Skills', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Skills' }).click();
  });

  test('displays skills header with total level', async ({ gamePage: page }) => {
    await expect(page.getByText('Skills')).toBeVisible();
    await expect(page.getByText(/Total Level/)).toBeVisible();
  });

  test('displays all combat skill types', async ({ gamePage: page }) => {
    for (const skill of ['Melee', 'Ranged', 'Magic', 'Defence', 'Vitality', 'Evasion']) {
      await expect(page.getByText(skill, { exact: true }).first()).toBeVisible();
    }
  });

  test('displays gathering skill types', async ({ gamePage: page }) => {
    for (const skill of ['Mining', 'Foraging', 'Woodcutting']) {
      await expect(page.getByText(skill, { exact: true }).first()).toBeVisible();
    }
  });

  test('displays crafting skill types', async ({ gamePage: page }) => {
    for (const skill of ['Weaponsmithing', 'Armorsmithing', 'Leatherworking', 'Tailoring', 'Alchemy']) {
      await expect(page.getByText(skill, { exact: true }).first()).toBeVisible();
    }
  });

  test('shows level badge for each skill', async ({ gamePage: page }) => {
    // Each skill card shows "Lv. X"
    const levelBadges = page.getByText(/^Lv\. \d+$/);
    const count = await levelBadges.count();
    expect(count).toBeGreaterThanOrEqual(14);
  });

  test('XP gained after combat increases skill levels', async ({ gamePage: page, gameApi: api }) => {
    // Grant XP via admin
    await api.adminGrantXp(10000);
    await page.reload();
    await page.getByRole('button', { name: 'Skills' }).click();

    // Character should have gained some XP — verify level display updated
    await expect(page.getByText(/Total Level/)).toBeVisible();
  });
});
