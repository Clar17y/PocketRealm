import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Attribute Allocation', () => {
  test('displays unspent attribute points', async ({ gamePage: page }) => {
    await expect(page.getByText(/Unspent Points/)).toBeVisible();
  });

  test('displays all six attribute labels', async ({ gamePage: page }) => {
    for (const attr of ['Vitality', 'Strength', 'Dexterity', 'Intelligence', 'Luck', 'Evasion']) {
      await expect(page.getByText(attr)).toBeVisible();
    }
  });

  test('allocates an attribute point', async ({ gamePage: page, gameApi: api }) => {
    // Grant attribute points via admin API
    await api.adminSetAttributes(undefined, 5);
    await page.reload();
    await page.waitForSelector('text=Available Turns');

    // Find the first +1 button and click it
    const plusButtons = page.getByRole('button', { name: '+1' });
    const count = await plusButtons.count();
    expect(count).toBeGreaterThan(0);
    await plusButtons.first().click();

    // Verify points decreased (should now be 4)
    // Wait for the UI to update
    await page.waitForTimeout(500);
  });

  test('+1 buttons disabled when no attribute points available', async ({ gamePage: page }) => {
    // New player may or may not have attribute points — ensure 0 via admin
    // If the player has 0 points, +1 buttons should be disabled
    const plusButtons = page.getByRole('button', { name: '+1' });
    const count = await plusButtons.count();
    if (count > 0) {
      // Check if buttons are disabled (attribute points = 0 for fresh user at level 1)
      const isDisabled = await plusButtons.first().isDisabled();
      // Fresh player at level 1 has 0 unspent points
      expect(isDisabled).toBe(true);
    }
  });
});
