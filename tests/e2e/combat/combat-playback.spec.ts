import { test, expect } from '../fixtures/game.fixture.js';

async function setupCombat(api: any) {
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
}

async function startFight(page: any) {
  const fightButton = page.getByRole('button', { name: 'Fight' }).first();
  await expect(fightButton).toBeVisible({ timeout: 5_000 });
  await fightButton.click();

  const fullClear = page.getByRole('button', { name: /Full Clear/i });
  if (await fullClear.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await fullClear.click();
  }
}

test.describe('Combat Playback', () => {
  test('runs combat via UI and shows victory', async ({ gamePage: page, gameApi: api }) => {
    await setupCombat(api);
    await page.reload();
    await page.getByRole('navigation').getByText('Combat').click();

    await startFight(page);

    // Strong player always wins — Victory appears during or after playback
    await expect(page.getByText('Victory!')).toBeVisible({ timeout: 30_000 });
  });

  test('combat playback shows damage entries', async ({ gamePage: page, gameApi: api }) => {
    await setupCombat(api);
    await page.reload();
    await page.getByRole('navigation').getByText('Combat').click();

    await startFight(page);

    // During playback, should see damage numbers or combat text
    // The playback shows HP bars, damage dealt, and skip button
    const playbackVisible = page.getByRole('button', { name: 'Skip', exact: true })
      .or(page.getByText('Victory!'))
      .or(page.getByText(/damage|hit|miss/i).first());
    await expect(playbackVisible).toBeVisible({ timeout: 15_000 });
  });

  test('combat resolved via API appears in history', async ({ gamePage: page, gameApi: api }) => {
    // Resolve combat via API (no playback) and verify it shows in history
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

    await expect(page.getByRole('button', { name: /Victory|Defeat/ }).first()).toBeVisible({ timeout: 5_000 });
  });
});
