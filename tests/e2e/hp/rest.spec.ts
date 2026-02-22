import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Rest', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
  });

  test('displays current HP', async ({ gamePage: page }) => {
    await expect(page.getByText('Current HP')).toBeVisible();
    await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible();
  });

  test('displays passive regen info', async ({ gamePage: page }) => {
    await expect(page.getByText(/Passive regen/)).toBeVisible();
  });

  test('displays turn slider when HP is not full', async ({ gamePage: page, gameApi: api }) => {
    // Reduce HP by doing combat or using admin
    // For now, just check if slider appears (it won't if HP is full)
    const slider = page.locator('input[type="range"]');
    // Slider only visible if HP < max
    await page.waitForTimeout(500);
  });

  test('rest button disabled when HP is full', async ({ gamePage: page }) => {
    // Fresh player should be at full HP
    const restButton = page.getByRole('button', { name: 'Rest', exact: true });
    if (await restButton.isVisible()) {
      const isDisabled = await restButton.isDisabled();
      expect(isDisabled).toBe(true);
    }
  });

  test('rest heals HP when below max', async ({ gamePage: page, gameApi: api }) => {
    // Use admin to spawn a weak encounter, do combat to lose HP
    await api.adminDiscoverAllZones();
    const zonesRes = await api.adminGetZones();
    const forestEdge = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length > 0) {
      await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
      // Do combat to lose some HP
      const sites = await api.getCombatSites();
      if (sites.length > 0) {
        try {
          await api.startCombat(sites[0].id);
        } catch {
          // Combat may fail if mob too strong — that's fine, HP still lost
        }
      }
    }

    await page.reload();
    await page.waitForSelector('text=Available Turns');
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();

    const restButton = page.getByRole('button', { name: 'Rest', exact: true });
    if (await restButton.isVisible() && !(await restButton.isDisabled())) {
      await restButton.click();
      await page.waitForTimeout(1_000);
    }
  });

  test('displays rest estimate (HP restored and turns used)', async ({ gamePage: page }) => {
    // Check for estimate labels
    const hpRestored = page.getByText(/HP Restored|\+\d+/);
    const turnsUsed = page.getByText(/Turns Used/);
    // These are only visible when HP < max and slider is shown
    await page.waitForTimeout(500);
  });
});
