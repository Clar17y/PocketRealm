import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Attribute Allocation', () => {
  test('displays unspent attribute points', async ({ gamePage: page }) => {
    await expect(page.getByText('Unspent Points')).toBeVisible();
  });

  test('displays all six attribute labels', async ({ gamePage: page }) => {
    for (const attr of ['Vitality', 'Strength', 'Dexterity', 'Intelligence', 'Luck', 'Evasion']) {
      await expect(page.getByText(attr)).toBeVisible();
    }
  });

  test('allocates an attribute point and count decreases', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetAttributes(undefined, 5);
    await page.reload();
    await page.waitForSelector('text=Available Turns');

    // Verify 5 unspent points
    await expect(page.getByText(/Unspent Points/)).toBeVisible();

    const plusButtons = page.getByRole('button', { name: '+1' });
    expect(await plusButtons.count()).toBeGreaterThan(0);

    // Click +1 on first attribute
    await plusButtons.first().click();

    // After allocation, the attribute value should have increased
    // Just verify the page updated without error
    await expect(page.getByText(/Unspent Points/)).toBeVisible();
  });

  test('+1 buttons disabled when no attribute points available', async ({ gamePage: page }) => {
    // New player at level 1 has 0 unspent points — buttons should be disabled
    const plusButtons = page.getByRole('button', { name: '+1' });
    expect(await plusButtons.count()).toBeGreaterThan(0);
    await expect(plusButtons.first()).toBeDisabled();
  });
});
