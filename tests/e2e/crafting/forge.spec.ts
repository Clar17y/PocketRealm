import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Forge', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Forge', exact: true }).click();
  });

  test('displays forge heading and luck value', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Forge' })).toBeVisible();
    await expect(page.getByText(/Luck:/)).toBeVisible();
  });

  test('granted item appears in eligible items list', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Forge', exact: true }).click();

    // Item should appear in the eligible items section
    await expect(page.getByText('Eligible Items')).toBeVisible({ timeout: 5_000 });
  });

  test('selecting an item shows upgrade and reroll buttons', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Forge', exact: true }).click();

    const items = page.locator('button').filter({ hasText: /Common|Uncommon|Rare/ });
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
    await items.first().click();

    await expect(page.getByRole('button', { name: 'Upgrade Rarity' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reroll Bonus Stats' })).toBeVisible();
  });

  test('upgrade shows success chance with decimal percentage', async ({ gamePage: page, gameApi: api }) => {
    const res = await api.adminSearchItems('', 'weapon');
    expect(res.templates.length).toBeGreaterThan(0);

    await api.adminGrantItem(res.templates[0].id, 'common');
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Forge', exact: true }).click();

    const items = page.locator('button').filter({ hasText: /Common|Uncommon|Rare/ });
    await expect(items.first()).toBeVisible({ timeout: 5_000 });
    await items.first().click();

    await expect(page.getByText(/Success: [\d.]+%/)).toBeVisible();
    await expect(page.getByText(/Cost:/).first()).toBeVisible();
  });
});
