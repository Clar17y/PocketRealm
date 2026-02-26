import { test, expect } from '../fixtures/game.fixture.js';

test.describe('PvP Arena', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
    await page.getByRole('button', { name: 'Arena', exact: true }).click();
  });

  test('displays arena screen with rating', async ({ gamePage: page }) => {
    await expect(page.getByText(/Arena|PvP/i).first()).toBeVisible();
    // Player should have a starting PvP rating displayed
    await expect(page.getByText(/Rating|ELO|\d{3,4}/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows opponent ladder or empty state', async ({ gamePage: page }) => {
    // Should show opponent list or "no opponents" message
    await expect(page.getByText(/Opponent|Ladder|No opponent|Challenge/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows PvP history section', async ({ gamePage: page }) => {
    const historyTab = page.getByRole('button', { name: /History/i }).first();
    await expect(historyTab).toBeVisible();
    await historyTab.click();
    // Should show history content or empty state
    await expect(page.getByText(/History|No match|record/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('arena tab is accessible from combat section', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: 'Arena', exact: true })).toBeVisible();
  });
});
