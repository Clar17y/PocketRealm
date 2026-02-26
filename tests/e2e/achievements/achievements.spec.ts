import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Achievements', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Achievements', exact: true }).click();
  });

  test('displays achievement count header', async ({ gamePage: page }) => {
    await expect(page.getByText(/\d+ \/ \d+ Achievements/)).toBeVisible();
  });

  test('displays category filter buttons', async ({ gamePage: page }) => {
    // Core categories (avoid "Skills" which collides with the sub-tab)
    for (const category of ['All', 'Combat', 'Exploration', 'Crafting', 'General']) {
      await expect(page.getByRole('button', { name: category, exact: true }).first()).toBeVisible();
    }
  });

  test('filtering by category changes visible achievements', async ({ gamePage: page }) => {
    // Click "Combat" filter and verify the page responds
    await page.getByRole('button', { name: 'Combat', exact: true }).first().click();
    // Achievement cards should still be visible (combat category subset)
    await expect(page.getByText(/\d+ \/ \d+ Achievements/)).toBeVisible();

    // Click "All" to reset
    await page.getByRole('button', { name: 'All', exact: true }).first().click();
    await expect(page.getByText(/\d+ \/ \d+ Achievements/)).toBeVisible();
  });

  test('achievement cards show star tier indicators', async ({ gamePage: page }) => {
    await expect(page.getByText(/★/).first()).toBeVisible();
  });

  test('achievement cards show progress values', async ({ gamePage: page }) => {
    // Individual achievement progress (different from the header count)
    // Cards show "0 / 1" or "0 / 10" etc. for each achievement's requirement
    const progressTexts = page.locator('text=/\\d+ \\/ \\d+/');
    const count = await progressTexts.count();
    // Should have more progress elements than just the header (at least header + 1 card)
    expect(count).toBeGreaterThan(1);
  });
});
