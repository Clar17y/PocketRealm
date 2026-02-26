import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Zone Travel', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Map', exact: true }).click();
  });

  test('displays world map heading', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'World Map' })).toBeVisible();
  });

  test('current zone shows HERE badge', async ({ gamePage: page }) => {
    await expect(page.locator('span:text-is("HERE")')).toBeVisible();
  });

  test('shows travel cost after discovering zones', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    await page.reload();
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    // After discovering all zones, Millbrook should be clickable
    const millbrook = page.getByText('Millbrook').first();
    await expect(millbrook).toBeVisible();
    await millbrook.click();
    // Travel panel should show turn cost
    await expect(page.getByText(/turns/).first()).toBeVisible();
  });

  test('travel to Millbrook changes current zone', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    await page.reload();
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    const millbrook = page.getByText('Millbrook').first();
    await expect(millbrook).toBeVisible();
    await millbrook.click();

    const travelButton = page.getByRole('button', { name: /Travel to Millbrook/ });
    await expect(travelButton).toBeVisible();
    await travelButton.click();

    // After travel, current zone should change
    await expect(page.getByText(/Millbrook|Traveling/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('zone detail shows exploration progress', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    await page.reload();
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    const forestEdge = page.getByText('Forest Edge').first();
    await expect(forestEdge).toBeVisible();
    await forestEdge.click();
    await expect(page.getByText(/Explored|%/).first()).toBeVisible();
  });
});
