import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Combat History', () => {
  test('displays combat history tab', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  });

  test('new player sees empty combat history', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Combat').click();
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await expect(page.getByText(/No combat|No log|empty/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('combat log appears after fighting', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);
    await api.adminDiscoverAllZones();

    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(forestEdge).toBeTruthy();

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    expect(familiesRes.families.length).toBeGreaterThan(0);

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    const sitesRes = await api.getCombatSites();
    expect(sitesRes.encounterSites.length).toBeGreaterThan(0);
    await api.fightEncounter(sitesRes.encounterSites[0].encounterSiteId);

    await page.reload();
    await page.getByRole('navigation').getByText('Combat').click();
    await page.getByRole('button', { name: 'History', exact: true }).click();

    // Should show combat history heading and log entries
    await expect(page.getByText('Combat History', { exact: true })).toBeVisible({ timeout: 5_000 });
    // At least one log entry button should be visible
    await expect(page.getByRole('button', { name: /Victory|Defeat/ }).first()).toBeVisible({ timeout: 5_000 });
  });
});
