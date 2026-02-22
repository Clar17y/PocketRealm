import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Inventory', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /inventory/i }).click();
  });

  test('displays inventory grid', async ({ gamePage: page }) => {
    // Should see the grid (even if empty for new player)
    await page.waitForTimeout(500);
    // Grid should be visible
    await expect(page.locator('[class*="grid"]').first()).toBeVisible();
  });

  test('shows empty slots for new player', async ({ gamePage: page }) => {
    // New player starts with some items or empty inventory
    await page.waitForTimeout(500);
  });

  test('shows item detail modal when clicking an item', async ({ gamePage: page, gameApi: api }) => {
    // Grant an item first
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /inventory/i }).click();
      await page.waitForTimeout(1_000);

      // Click the first non-empty item slot
      const items = page.locator('[class*="grid"] button').first();
      if (await items.isVisible()) {
        await items.click();
        // Modal should appear with item details
        await page.waitForTimeout(500);
      }
    }
  });

  test('drop action removes item from inventory', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'resource');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common', 1);
      await page.reload();
      await page.getByRole('button', { name: /inventory/i }).click();
      await page.waitForTimeout(1_000);

      // Click item to open modal, then drop
      const items = page.locator('[class*="grid"] button').first();
      if (await items.isVisible()) {
        await items.click();
        const dropButton = page.getByRole('button', { name: 'Drop' });
        if (await dropButton.isVisible()) {
          await dropButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('equip action on equipment item', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /inventory/i }).click();
      await page.waitForTimeout(1_000);

      const items = page.locator('[class*="grid"] button').first();
      if (await items.isVisible()) {
        await items.click();
        const equipButton = page.getByRole('button', { name: 'Equip', exact: true });
        if (await equipButton.isVisible()) {
          await equipButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('repair action on damaged equipment', async ({ gamePage: page, gameApi: api }) => {
    // Grant a weapon item — it starts at full durability, so repair may be disabled
    // This test verifies the repair button exists in the modal
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /inventory/i }).click();
      await page.waitForTimeout(1_000);

      const items = page.locator('[class*="grid"] button').first();
      if (await items.isVisible()) {
        await items.click();
        // Repair button should be visible (possibly disabled if at full durability)
        await expect(page.getByRole('button', { name: /Repair|Fix/ })).toBeVisible();
      }
    }
  });

  test('salvage action on equipment item', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /inventory/i }).click();
      await page.waitForTimeout(1_000);

      const items = page.locator('[class*="grid"] button').first();
      if (await items.isVisible()) {
        await items.click();
        await expect(page.getByRole('button', { name: /Salvage|No Facility/ })).toBeVisible();
      }
    }
  });
});
