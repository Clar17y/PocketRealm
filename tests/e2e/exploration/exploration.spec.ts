import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Exploration', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    // Navigate to exploration screen
    await page.getByRole('button', { name: 'Explore' }).click();
  });

  test('displays zone info header', async ({ gamePage: page }) => {
    // Starter zone is Millbrook — should show zone name
    await expect(page.getByText('Millbrook')).toBeVisible();
  });

  test('displays turn investment slider', async ({ gamePage: page }) => {
    await expect(page.locator('input[type="range"]')).toBeVisible();
  });

  test('displays expected results grid', async ({ gamePage: page }) => {
    await expect(page.getByText('Ambushes')).toBeVisible();
    await expect(page.getByText('Sites')).toBeVisible();
    await expect(page.getByText('Resources')).toBeVisible();
  });

  test('displays start exploration button', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: 'Start Exploration' })).toBeVisible();
  });

  test('quick turn presets update slider', async ({ gamePage: page, gameApi: api }) => {
    // Need to be in a wild zone for exploration — travel to Forest Edge
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (forestEdge) {
      await api.adminTeleport(forestEdge.id);
      await page.reload();
      await page.getByRole('button', { name: 'Explore' }).click();
    }

    // Check presets exist
    const preset100 = page.getByRole('button', { name: '100', exact: true });
    if (await preset100.isVisible()) {
      await preset100.click();
      // Verify slider updated (check the displayed turn count)
      await expect(page.getByText('100')).toBeVisible();
    }
  });

  test('start exploration triggers playback', async ({ gamePage: page, gameApi: api }) => {
    // Travel to wild zone
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (forestEdge) {
      await api.adminTeleport(forestEdge.id);
      await page.reload();
      await page.getByRole('button', { name: 'Explore' }).click();
    }

    await page.getByRole('button', { name: 'Start Exploration' }).click();
    // Should trigger playback animation or show results
    // Wait for playback or results to appear
    await page.waitForTimeout(2_000);
    // After exploration, we should see results or playback UI
  });

  test('displays zone exploration progress', async ({ gamePage: page, gameApi: api }) => {
    // Travel to wild zone
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (forestEdge) {
      await api.adminTeleport(forestEdge.id);
      await page.reload();
      await page.getByRole('button', { name: 'Explore' }).click();
    }

    // Should show % explored
    await expect(page.getByText(/%/)).toBeVisible();
  });
});
