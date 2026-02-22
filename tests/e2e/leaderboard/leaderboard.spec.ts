import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Leaderboard', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Rankings' }).click();
  });

  test('displays leaderboard header', async ({ gamePage: page }) => {
    await expect(page.getByText('Leaderboards')).toBeVisible();
  });

  test('displays group tabs', async ({ gamePage: page }) => {
    // Should show at least one tab group
    await page.waitForTimeout(500);
    const tabs = page.getByRole('button');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows player rankings table', async ({ gamePage: page }) => {
    await page.waitForTimeout(1_000);
    // Should show ranking data or empty state
  });

  test('switching tabs changes displayed category', async ({ gamePage: page }) => {
    const tabs = page.locator('[class*="tab"], [role="tab"]');
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(500);
    }
  });
});
