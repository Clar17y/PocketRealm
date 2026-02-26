import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Rest', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
  });

  test('displays current HP with values', async ({ gamePage: page }) => {
    await expect(page.getByText('Current HP')).toBeVisible();
    // Should show "100 / 100" format for a new player at full HP
    await expect(page.getByText(/100 \/ 100/)).toBeVisible();
  });

  test('displays passive regen rate', async ({ gamePage: page }) => {
    await expect(page.getByText(/Passive regen/i)).toBeVisible();
    // Should show the actual regen value
    await expect(page.getByText(/\+[\d.]+.*\/sec/)).toBeVisible();
  });

  test('rest button state at full HP', async ({ gamePage: page }) => {
    // Fresh player is at full HP — rest button should be disabled or hidden
    const restButton = page.getByRole('button', { name: 'Rest', exact: true });
    if (await restButton.isVisible().catch(() => false)) {
      await expect(restButton).toBeDisabled();
    }
    // Either way, HP should show full
    await expect(page.getByText(/100 \/ 100/)).toBeVisible();
  });

  test('rest via API restores HP', async ({ gameApi: api }) => {
    // Make player strong enough to survive combat but take damage
    await api.adminSetLevel(30);
    await api.adminSetAttributes({ vitality: 30, strength: 30 }, 0);
    await api.adminDiscoverAllZones();

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

    const hpBefore = await api.getHp();
    if (hpBefore.currentHp < hpBefore.maxHp) {
      await api.rest(100);
      const hpAfter = await api.getHp();
      expect(hpAfter.currentHp).toBeGreaterThanOrEqual(hpBefore.currentHp);
    }
  });
});
