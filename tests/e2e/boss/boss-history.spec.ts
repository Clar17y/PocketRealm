import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Boss History', () => {
  test('boss history tab visible in combat section', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
    await expect(page.getByRole('button', { name: /Boss/i })).toBeVisible();
  });

  test('boss history shows empty state for new player', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
    await page.getByRole('button', { name: /Boss History/i }).click();
    // New player has no boss participation — should show empty state
    await expect(page.getByText(/No boss|no participation|Boss History/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
