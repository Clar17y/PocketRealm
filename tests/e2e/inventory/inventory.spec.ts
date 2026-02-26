import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Inventory', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Inventory').click();
  });

  test('displays inventory screen', async ({ gamePage: page }) => {
    // Inventory tab should be active and show item grid or empty state
    await expect(page.getByRole('navigation').getByText('Inventory')).toBeVisible();
    await expect(page.locator('[class*="grid"]').first()).toBeVisible();
  });

  test('granted item appears in inventory', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();

    // The granted item should appear as a clickable grid cell
    const items = page.locator('[class*="grid"] button').first();
    await expect(items).toBeVisible({ timeout: 5_000 });
  });

  test('clicking item opens detail modal with stats', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();

    const items = page.locator('[class*="grid"] button').first();
    await expect(items).toBeVisible({ timeout: 5_000 });
    await items.click();

    // Modal should show item stats (Attack, Durability, etc.)
    await expect(page.getByText(/Attack|Durability|Defence/).first()).toBeVisible({ timeout: 3_000 });
  });

  test('equip button visible in item detail', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();

    const items = page.locator('[class*="grid"] button').first();
    await expect(items).toBeVisible({ timeout: 5_000 });
    await items.click();

    await expect(page.getByRole('button', { name: 'Equip', exact: true })).toBeVisible();
  });

  test('repair button visible in item detail', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();

    const items = page.locator('[class*="grid"] button').first();
    await expect(items).toBeVisible({ timeout: 5_000 });
    await items.click();

    await expect(page.getByRole('button', { name: /Repair/ })).toBeVisible();
  });

  test('salvage button visible in item detail', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Inventory').click();

    const items = page.locator('[class*="grid"] button').first();
    await expect(items).toBeVisible({ timeout: 5_000 });
    await items.click();

    // Salvage requires a town zone — may show "No Facility" if not in town
    await expect(page.getByRole('button', { name: /Salvage|No Facility/ })).toBeVisible();
  });
});
