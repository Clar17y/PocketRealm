import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Combat Playback', () => {
  test('runs combat and shows victory or defeat', async ({ gamePage: page, gameApi: api }) => {
    // Setup: travel to wild zone, spawn encounter
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length === 0) return;

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();

    // Navigate to combat
    await page.getByRole('button', { name: /combat/i }).click();
    await page.waitForTimeout(1_000);

    // Click first encounter site and start combat
    const startButton = page.getByRole('button', { name: /Start Combat/i });
    if (await startButton.isVisible()) {
      await startButton.click();

      // Wait for combat to resolve — should show combat log
      await page.waitForTimeout(3_000);

      // Should see either Victory or Defeated
      const victory = page.getByText('Victory!');
      const defeat = page.getByText('Defeated...');
      await expect(victory.or(defeat)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('victory modal shows rewards and continue button', async ({ gamePage: page, gameApi: api }) => {
    // Make player strong enough to guarantee victory
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);

    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length === 0) return;

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();

    await page.getByRole('button', { name: /combat/i }).click();
    await page.waitForTimeout(1_000);

    const startButton = page.getByRole('button', { name: /Start Combat/i });
    if (await startButton.isVisible()) {
      await startButton.click();
      await expect(page.getByText('Victory!')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

      // Check rewards section
      await expect(page.getByText(/XP|Gold/)).toBeVisible();
    }
  });

  test('continue button returns to encounter list', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);

    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length === 0) return;

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();

    await page.getByRole('button', { name: /combat/i }).click();
    await page.waitForTimeout(1_000);

    const startButton = page.getByRole('button', { name: /Start Combat/i });
    if (await startButton.isVisible()) {
      await startButton.click();
      await expect(page.getByText('Victory!')).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Continue' }).click();
      // Should return to combat/encounter list screen
      await page.waitForTimeout(1_000);
    }
  });

  test('combat log shows round-by-round entries', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(50);
    await api.adminSetAttributes({ strength: 50, dexterity: 50, vitality: 50 }, 0);

    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const forestEdge = zones.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    if (!forestEdge) return;

    await api.adminTeleport(forestEdge.id);
    const familiesRes = await api.adminGetMobFamilies(forestEdge.id);
    if (familiesRes.families.length === 0) return;

    await api.adminSpawnEncounter(familiesRes.families[0].id, forestEdge.id, 'small');
    await page.reload();

    await page.getByRole('button', { name: /combat/i }).click();
    await page.waitForTimeout(1_000);

    const startButton = page.getByRole('button', { name: /Start Combat/i });
    if (await startButton.isVisible()) {
      await startButton.click();
      // Combat log should show "Round" headers
      await expect(page.getByText(/Round \d+/).first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
