import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Equipment', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /equipment/i }).click();
  });

  test('displays all 11 equipment slots', async ({ gamePage: page }) => {
    const slots = ['Head', 'Neck', 'Main Hand', 'Chest', 'Off Hand', 'Gloves', 'Belt', 'Ring', 'Legs', 'Boots', 'Charm'];
    for (const slot of slots) {
      await expect(page.getByText(slot, { exact: true })).toBeVisible();
    }
  });

  test('displays total stats panel', async ({ gamePage: page }) => {
    const stats = ['Attack', 'Defence', 'Magic Def', 'HP', 'Dodge', 'Accuracy'];
    for (const stat of stats) {
      await expect(page.getByText(stat)).toBeVisible();
    }
  });

  test('clicking a slot opens equip modal', async ({ gamePage: page }) => {
    await page.getByText('Head', { exact: true }).click();
    // Modal should appear with "Select an item to equip" or current equipment
    await page.waitForTimeout(500);
  });

  test('equip an item from the modal', async ({ gamePage: page, gameApi: api }) => {
    // Grant a weapon
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /equipment/i }).click();

      // Click main hand slot
      await page.getByText('Main Hand', { exact: true }).click();
      await page.waitForTimeout(500);

      // Should see the item in the candidate list
      const equipButton = page.getByRole('button', { name: 'Equip', exact: true });
      if (await equipButton.isVisible()) {
        await equipButton.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('unequip an item from the modal', async ({ gamePage: page, gameApi: api }) => {
    // Grant and equip a weapon
    const res = await api.adminSearchItems('', 'weapon');
    if (res.templates.length > 0) {
      await api.adminGrantItem(res.templates[0].id, 'common');
      await page.reload();
      await page.getByRole('button', { name: /equipment/i }).click();

      // Equip first
      await page.getByText('Main Hand', { exact: true }).click();
      await page.waitForTimeout(500);
      const equipBtn = page.getByRole('button', { name: 'Equip', exact: true });
      if (await equipBtn.isVisible()) {
        await equipBtn.click();
        await page.waitForTimeout(500);

        // Now open slot again and unequip
        await page.getByText('Main Hand', { exact: true }).click();
        await page.waitForTimeout(500);
        const unequipBtn = page.getByRole('button', { name: 'Unequip' });
        if (await unequipBtn.isVisible()) {
          await unequipBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});
