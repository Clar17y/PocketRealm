import { test, expect } from '../fixtures/game.fixture.js';

test.describe('World Events', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Events', exact: true }).click();
  });

  test('displays world events heading', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'World Events' })).toBeVisible();
  });

  test('displays refresh button', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('shows global events section', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Global Events' })).toBeVisible();
  });

  test('spawning an event makes it visible', async ({ gamePage: page, gameApi: api }) => {
    const templatesRes = await api.adminGetEventTemplates();
    expect(templatesRes.templates.length).toBeGreaterThan(0);

    const zonesRes = await api.adminGetZones();
    expect(zonesRes.zones.length).toBeGreaterThan(0);

    try {
      await api.adminSpawnEvent(0, zonesRes.zones[0].id, 1);
    } catch {
      // 409 if event already active — acceptable
    }

    await page.reload();
    await page.getByRole('button', { name: 'Events', exact: true }).click();

    // Should show event content (timer, zone name, or "GLOBAL" badge)
    await expect(page.getByText(/GLOBAL|Active|expires/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('refresh button reloads without breaking page', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    // After refresh, the heading and refresh button should still be present
    await expect(page.getByRole('heading', { name: 'World Events' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});
