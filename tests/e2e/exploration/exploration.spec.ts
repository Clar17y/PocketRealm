import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Exploration', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
  });

  test('displays current zone name as heading', async ({ gamePage: page }) => {
    // New player starts in Forest Edge
    await expect(page.getByText('Forest Edge').first()).toBeVisible();
  });

  test('displays turn investment slider', async ({ gamePage: page }) => {
    await expect(page.getByRole('slider').or(page.locator('input[type="range"]')).first()).toBeVisible();
  });

  test('displays expected outcome labels', async ({ gamePage: page }) => {
    await expect(page.getByText('Ambushes')).toBeVisible();
    await expect(page.getByText('Sites')).toBeVisible();
    await expect(page.getByText('Resources')).toBeVisible();
  });

  test('displays start exploration button', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: 'Start Exploration' })).toBeVisible();
  });

  test('start exploration produces results', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Start Exploration' }).click();
    // Should show exploration playback or results
    await expect(page.getByText(/Exploring|Results|Complete/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows zone exploration percentage', async ({ gamePage: page }) => {
    // Zone progress shows "X% explored" or similar
    await expect(page.getByText(/\d+(\.\d+)?%/).first()).toBeVisible();
  });
});
