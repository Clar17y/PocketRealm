import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Admin Panel', () => {
  test('admin tab visible for admin users', async ({ gamePage: page }) => {
    // Test users are promoted to admin in the fixture
    const adminTab = page.getByRole('button', { name: 'Admin', exact: true });
    await expect(adminTab).toBeVisible();
  });

  test('admin panel shows section tabs', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await expect(page.getByText('Player')).toBeVisible();
    await expect(page.getByText('Items')).toBeVisible();
    await expect(page.getByText('World')).toBeVisible();
    await expect(page.getByText('Zones')).toBeVisible();
    await expect(page.getByText('Resources')).toBeVisible();
  });

  test('admin player tab shows turn grant input', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Player' }).click();
    await expect(page.getByRole('button', { name: 'Grant' }).first()).toBeVisible();
  });

  test('admin items tab shows search functionality', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Items' }).click();
    await expect(page.getByPlaceholder('Search name...')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
  });

  test('admin zones tab shows discover all and teleport', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Admin', exact: true }).click();
    await page.getByRole('button', { name: 'Zones' }).click();
    await expect(page.getByRole('button', { name: 'Discover All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Teleport' }).first()).toBeVisible();
  });
});
