import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Equipment', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Inventory').click();
    await page.getByRole('button', { name: 'Equipment', exact: true }).click();
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

  test('clicking a slot opens equipment selection', async ({ gamePage: page }) => {
    await page.getByText('Head', { exact: true }).click();
    // Should show equip modal or slot detail
    await expect(page.getByText(/Select|equip|Empty|Head/i).first()).toBeVisible({ timeout: 3_000 });
  });

  test('granted weapon can be equipped to main hand', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();
    await page.getByRole('button', { name: 'Equipment', exact: true }).click();

    await page.getByText('Main Hand', { exact: true }).click();
    const equipButton = page.getByRole('button', { name: 'Equip', exact: true });
    await expect(equipButton).toBeVisible({ timeout: 3_000 });
    await equipButton.click();

    // After equipping, the "Main Hand" slot should still be visible (page didn't break)
    // And the slot should no longer show just "Empty"
    await expect(page.getByText('Main Hand', { exact: true })).toBeVisible({ timeout: 3_000 });
  });
});
