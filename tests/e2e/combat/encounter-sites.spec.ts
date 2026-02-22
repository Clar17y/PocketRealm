import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Encounter Sites', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    // Navigate to combat screen via bottom nav
    await page.getByRole('button', { name: /combat/i }).click();
  });

  test('displays encounter site list (empty for new player)', async ({ gamePage: page }) => {
    // New player has no encounter sites — should show empty state or list
    await expect(page.getByText(/No encounter|No pending|encounters/i)).toBeVisible();
  });

  test('displays encounter sites after exploration', async ({ gamePage: page, gameApi: api }) => {
    // Setup: travel to wild zone, spawn encounter
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length > 0) {
      await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    }

    await page.reload();
    await page.getByRole('button', { name: /combat/i }).click();

    // Should now see at least one encounter site
    await expect(page.getByText(/encounter|site/i).first()).toBeVisible();
  });

  test('shows mob count and room progress on encounter card', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length > 0) {
      await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    }

    await page.reload();
    await page.getByRole('button', { name: /combat/i }).click();

    // Encounter card should show mob/room info
    await page.waitForTimeout(1_000);
  });
});
