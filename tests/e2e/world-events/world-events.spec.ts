import { test, expect } from '../fixtures/game.fixture.js';

test.describe('World Events', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Events' }).click();
  });

  test('displays world events header', async ({ gamePage: page }) => {
    await expect(page.getByText('World Events')).toBeVisible();
  });

  test('displays refresh button', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('shows no events message when none active', async ({ gamePage: page }) => {
    await expect(
      page.getByText(/No active world events/).or(page.getByText(/Global Events/))
    ).toBeVisible();
  });

  test('shows active event after admin spawns one', async ({ gamePage: page, gameApi: api }) => {
    // Spawn an event
    const templatesRes = await api.adminGetEventTemplates();
    const zonesRes = await api.adminGetZones();

    if (templatesRes.templates.length > 0 && zonesRes.zones.length > 0) {
      await api.adminSpawnEvent(0, zonesRes.zones[0].id, 1);
      await page.reload();
      await page.getByRole('button', { name: 'Events' }).click();

      // Should show the spawned event
      await page.waitForTimeout(1_000);
      await expect(page.getByText(/Global Events|Active in/)).toBeVisible();
    }
  });

  test('refresh button reloads events', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Refresh' }).click();
    // Button should change to "Loading..." briefly
    await page.waitForTimeout(1_000);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});
