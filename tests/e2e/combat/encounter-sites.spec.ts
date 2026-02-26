import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Encounter Sites', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
  });

  test('new player sees encounter list', async ({ gamePage: page }) => {
    // Combat tab should show either encounters or "No pending" message
    await expect(page.getByText(/No pending|Encounter|Pending|encounter/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('spawned encounter appears in list', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(forestEdge).toBeTruthy();

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    expect(familiesRes.families.length).toBeGreaterThan(0);

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();
    await page.getByRole('navigation').getByText('Combat').click();

    // Should show at least one encounter with a fight/start button
    await expect(page.getByRole('button', { name: /Start Combat|Fight/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('encounter card shows room info', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(forestEdge).toBeTruthy();

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    expect(familiesRes.families.length).toBeGreaterThan(0);

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();
    await page.getByRole('navigation').getByText('Combat').click();

    // Encounter card should show mob count (e.g., "3/3 mobs")
    await expect(page.getByText(/\d+\/\d+ mobs/).first()).toBeVisible({ timeout: 5_000 });
  });
});
