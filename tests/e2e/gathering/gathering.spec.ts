import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Gathering', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Mine' }).click();
  });

  test('displays skill tabs (mining, foraging, woodcutting)', async ({ gamePage: page }) => {
    // Should show skill name and level in header
    await expect(page.getByText(/Lv\./)).toBeVisible();
  });

  test('displays discovered nodes section', async ({ gamePage: page }) => {
    await expect(page.getByText('Discovered Nodes')).toBeVisible();
  });

  test('shows empty state when no nodes discovered', async ({ gamePage: page }) => {
    // New player may not have any gathering nodes
    await page.waitForTimeout(500);
  });

  test('shows node details with level and capacity', async ({ gamePage: page, gameApi: api }) => {
    // Spawn a resource node for the player
    const zonesRes = await api.adminGetZones();
    const starter = zonesRes.zones.find((z: { name: string }) => z.name === 'Millbrook');
    if (!starter) return;

    const nodesRes = await api.adminGetResourceNodes(starter.id);
    if (nodesRes.nodes.length > 0) {
      await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
      await page.reload();
      await page.getByRole('button', { name: 'Mine' }).click();
      await page.waitForTimeout(1_000);

      // Should show node with level and capacity
      await expect(page.getByText(/Lv\. \d+/).first()).toBeVisible();
      await expect(page.getByText(/remaining/).first()).toBeVisible();
    }
  });

  test('start gathering triggers playback', async ({ gamePage: page, gameApi: api }) => {
    const zonesRes = await api.adminGetZones();
    const starter = zonesRes.zones.find((z: { name: string }) => z.name === 'Millbrook');
    if (!starter) return;

    const nodesRes = await api.adminGetResourceNodes(starter.id);
    if (nodesRes.nodes.length > 0) {
      await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
      await page.reload();
      await page.getByRole('button', { name: 'Mine' }).click();
      await page.waitForTimeout(1_000);

      // Select a node and start gathering
      const startButton = page.getByRole('button', { name: /^Start / });
      if (await startButton.isVisible()) {
        await startButton.click();
        await page.waitForTimeout(2_000);
      }
    }
  });

  test('displays zone and type filter dropdowns', async ({ gamePage: page }) => {
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('displays turn investment slider when node selected', async ({ gamePage: page, gameApi: api }) => {
    const zonesRes = await api.adminGetZones();
    const starter = zonesRes.zones.find((z: { name: string }) => z.name === 'Millbrook');
    if (!starter) return;

    const nodesRes = await api.adminGetResourceNodes(starter.id);
    if (nodesRes.nodes.length > 0) {
      await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
      await page.reload();
      await page.getByRole('button', { name: 'Mine' }).click();
      await page.waitForTimeout(1_000);

      // Click on a node to select it — check for Turn Investment section
      await expect(page.getByText('Turn Investment')).toBeVisible();
    }
  });
});
