import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Gathering', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Gathering', exact: true }).click();
  });

  test('displays gathering skill name and level', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByText(/Lv\.\s*\d+/).first()).toBeVisible();
  });

  test('displays discovered nodes section', async ({ gamePage: page }) => {
    await expect(page.getByText('Discovered Nodes')).toBeVisible();
  });

  test('spawned node shows level and capacity', async ({ gamePage: page, gameApi: api }) => {
    // Teleport to Forest Edge first (where resource nodes exist)
    await api.adminDiscoverAllZones();
    const zonesRes = await api.adminGetZones();
    const millbrook = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(millbrook).toBeTruthy();
    await api.adminTeleport(millbrook.id);

    const nodesRes = await api.adminGetResourceNodes(millbrook.id);
    expect(nodesRes.nodes.length).toBeGreaterThan(0);

    await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Gathering', exact: true }).click();

    await expect(page.getByText(/remaining/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('start gathering produces results', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    const zonesRes = await api.adminGetZones();
    const millbrook = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(millbrook).toBeTruthy();
    await api.adminTeleport(millbrook.id);

    const nodesRes = await api.adminGetResourceNodes(millbrook.id);
    expect(nodesRes.nodes.length).toBeGreaterThan(0);

    await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Gathering', exact: true }).click();

    const startButton = page.getByRole('button', { name: /^Start / });
    await expect(startButton).toBeVisible({ timeout: 5_000 });
    await startButton.click();
    await expect(page.getByText(/Gathering|Results|Complete|yield/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('displays zone filter dropdown', async ({ gamePage: page }) => {
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
  });

  test('turn investment section visible with spawned node', async ({ gamePage: page, gameApi: api }) => {
    await api.adminDiscoverAllZones();
    const zonesRes = await api.adminGetZones();
    const millbrook = zonesRes.zones.find((z: { name: string }) => z.name === 'Forest Edge');
    expect(millbrook).toBeTruthy();
    await api.adminTeleport(millbrook.id);

    const nodesRes = await api.adminGetResourceNodes(millbrook.id);
    expect(nodesRes.nodes.length).toBeGreaterThan(0);

    await api.adminSpawnResourceNode(nodesRes.nodes[0].id);
    await page.reload();
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Gathering', exact: true }).click();

    await expect(page.getByText('Turn Investment')).toBeVisible({ timeout: 5_000 });
  });
});
