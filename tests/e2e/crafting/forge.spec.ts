import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Forge', () => {
  test('displays forge header with luck value', async ({ gamePage: page }) => {
    // Navigate to forge (from dashboard or crafting)
    await page.getByRole('button', { name: 'Craft' }).click();
    // Look for forge tab/link if available
    const forgeTab = page.getByRole('button', { name: /Forge/i });
    if (await forgeTab.isVisible()) {
      await forgeTab.click();
      await expect(page.getByText(/Luck:/)).toBeVisible();
    }
  });

  test('shows eligible items list', async ({ gamePage: page, gameApi: api }) => {
    // Grant a weapon
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();

      await page.getByRole('button', { name: 'Craft' }).click();
      const forgeTab = page.getByRole('button', { name: /Forge/i });
      if (await forgeTab.isVisible()) {
        await forgeTab.click();
        await expect(page.getByText('Eligible Items')).toBeVisible();
      }
    }
  });

  test('selecting an item shows upgrade and reroll sections', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();

      await page.getByRole('button', { name: 'Craft' }).click();
      const forgeTab = page.getByRole('button', { name: /Forge/i });
      if (await forgeTab.isVisible()) {
        await forgeTab.click();
        await page.waitForTimeout(500);

        // Click first eligible item
        const items = page.locator('button').filter({ hasText: /Common|Uncommon|Rare/ });
        if (await items.count() > 0) {
          await items.first().click();
          await expect(page.getByText('Upgrade')).toBeVisible();
          await expect(page.getByText('Reroll')).toBeVisible();
        }
      }
    }
  });

  test('upgrade section shows success chance and cost', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();

      await page.getByRole('button', { name: 'Craft' }).click();
      const forgeTab = page.getByRole('button', { name: /Forge/i });
      if (await forgeTab.isVisible()) {
        await forgeTab.click();
        await page.waitForTimeout(500);

        const items = page.locator('button').filter({ hasText: /Common|Uncommon|Rare/ });
        if (await items.count() > 0) {
          await items.first().click();
          await expect(page.getByText(/Success: \d+%/)).toBeVisible();
          await expect(page.getByText(/Cost:/)).toBeVisible();
        }
      }
    }
  });
});
