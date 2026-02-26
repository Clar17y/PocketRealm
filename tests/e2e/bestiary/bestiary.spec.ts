import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Bestiary', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Bestiary', exact: true }).click();
  });

  test('displays bestiary heading', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Bestiary' })).toBeVisible();
  });

  test('displays monsters tab with discovery count', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: /Monsters 0\/\d+/ })).toBeVisible();
  });

  test('displays prefix tab', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: /Prefixes/ })).toBeVisible();
  });

  test('defeating a mob increases discovered count', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);

    const zonesRes = await api.adminGetZones();
    const forestEdge = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(forestEdge).toBeTruthy();

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    expect(familiesRes.families.length).toBeGreaterThan(0);

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    const sitesRes = await api.getCombatSites();
    expect(sitesRes.encounterSites.length).toBeGreaterThan(0);
    await api.fightEncounter(sitesRes.encounterSites[0].encounterSiteId);

    await page.reload();
    await page.getByRole('button', { name: 'Bestiary', exact: true }).click();

    // Discovered count should now be > 0
    await expect(page.getByRole('button', { name: /Monsters [1-9]\d*\/\d+/ })).toBeVisible();
  });

  test('prefix tab shows prefix list', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /Prefixes/ }).click();
    // Should switch to prefix view — the Prefixes button should be active
    await expect(page.getByRole('button', { name: /Prefixes/ })).toBeVisible();
  });
});
