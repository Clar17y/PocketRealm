import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Knockout & Recovery', () => {
  test('rest screen shows HP state', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
    // New player should show "Current HP" (not knocked out)
    await expect(page.getByText('Current HP')).toBeVisible();
  });

  test('full HP player does not see recover button', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
    // At full HP, the recover button should not be visible
    const recoverButton = page.getByRole('button', { name: 'Recover', exact: true });
    await expect(recoverButton).not.toBeVisible();
  });

  test('rest button shows correct label based on HP state', async ({ gamePage: page }) => {
    // Dashboard should show "Rest" for healthy player (not "Recover")
    const restButton = page.getByRole('button', { name: 'Rest', exact: true });
    await expect(restButton).toBeVisible();
  });
});
