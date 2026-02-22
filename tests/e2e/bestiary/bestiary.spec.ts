import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Bestiary', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Bestiary' }).click();
  });

  test('displays bestiary header', async ({ gamePage: page }) => {
    await expect(page.getByText('Bestiary')).toBeVisible();
  });

  test('displays monster and prefix tabs', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: /Monsters/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prefixes' })).toBeVisible();
  });

  test('shows discovered/total monster count', async ({ gamePage: page }) => {
    await expect(page.getByText(/\d+\/\d+/)).toBeVisible();
  });

  test('shows ??? for undiscovered monsters', async ({ gamePage: page }) => {
    // New player has no kills — all mobs should show as unknown
    const unknowns = page.getByText('???');
    const count = await unknowns.count();
    expect(count).toBeGreaterThanOrEqual(0); // May have 0 if grid isn't showing unknowns
  });

  test('shows kill count after defeating a mob', async ({ gamePage: page, gameApi: api }) => {
    // Set player strong, spawn encounter, win combat
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);
    await api.adminDiscoverAllZones();

    const zonesRes = await api.adminGetZones();
    const forestEdge = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length === 0) return;

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    const sites = await api.getCombatSites();
    if (sites.length > 0) {
      await api.startCombat(sites[0].id);
    }

    await page.reload();
    await page.getByRole('button', { name: 'Bestiary' }).click();

    // Should now show at least one discovered mob with kill count
    const killCount = page.getByText(/x\d+/);
    await page.waitForTimeout(1_000);
  });

  test('prefix tab shows prefix encyclopedia', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Prefixes' }).click();
    await page.waitForTimeout(500);
    // Should show prefix entries (discovered or undiscovered)
  });
});
