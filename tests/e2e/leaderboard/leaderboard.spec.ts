import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Leaderboard', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Rankings', exact: true }).click();
  });

  test('displays leaderboard heading', async ({ gamePage: page }) => {
    await expect(page.getByText(/Leaderboard/)).toBeVisible();
  });

  test('displays category selection tabs', async ({ gamePage: page }) => {
    // Should show specific leaderboard category options
    const categoryButtons = page.locator('button').filter({ hasText: /Level|Kills|Wins|Skill/ });
    const count = await categoryButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows ranking entries or empty state', async ({ gamePage: page }) => {
    // Should show at least the current player in rankings, or an explicit empty state
    // The test player exists so there should be at least 1 entry
    await expect(page.getByText(/\d+/).first()).toBeVisible();
  });

  test('clicking a category tab updates the view', async ({ gamePage: page }) => {
    const categoryButtons = page.locator('button').filter({ hasText: /Level|Kills|Wins|Skill/ });
    const count = await categoryButtons.count();
    expect(count).toBeGreaterThan(0);

    // Click second category tab
    if (count > 1) {
      await categoryButtons.nth(1).click();
      // Leaderboard should still be rendered
      await expect(page.getByText(/Leaderboard/)).toBeVisible();
    }
  });
});
