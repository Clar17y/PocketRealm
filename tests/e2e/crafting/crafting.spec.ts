import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Crafting', () => {
  test.beforeEach(async ({ gamePage: page, gameApi: api }) => {
    // Teleport to Millbrook (town) so crafting facilities are available
    await api.adminDiscoverAllZones();
    const zones = await api.adminGetZones();
    const millbrook = zones.zones.find((z: { name: string }) => z.name === 'Millbrook');
    if (millbrook) await api.adminTeleport(millbrook.id);

    await page.reload();
    await page.waitForSelector('text=Available Turns');
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Crafting', exact: true }).click();
  });

  test('displays crafting skill name and level', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByText(/Lv\.\s*\d+/).first()).toBeVisible();
  });

  test('displays recipe list with entries', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
  });

  test('selecting a recipe shows turn cost', async ({ gamePage: page }) => {
    // Recipes are buttons — click the first one
    const recipeButton = page.getByRole('button', { name: /Lv\.\s*\d+/ }).first();
    await expect(recipeButton).toBeVisible({ timeout: 5_000 });
    await recipeButton.click();
    await expect(page.getByText(/Turn Cost|turns/).first()).toBeVisible();
  });

  test('recipe shows material requirements', async ({ gamePage: page }) => {
    const recipeButton = page.getByRole('button', { name: /Lv\.\s*\d+/ }).first();
    await expect(recipeButton).toBeVisible({ timeout: 5_000 });
    await recipeButton.click();
    // Should show material list with owned/needed counts
    await expect(page.getByText(/\d+ \/ \d+/).first()).toBeVisible({ timeout: 5_000 });
  });

  test('craft button shows disabled state when missing materials', async ({ gamePage: page }) => {
    const recipeButton = page.getByRole('button', { name: /Lv\.\s*\d+/ }).first();
    await expect(recipeButton).toBeVisible({ timeout: 5_000 });
    await recipeButton.click();
    // New player lacks materials — the "Craft <item>" submit button should be disabled
    const craftButton = page.getByRole('button', { name: /^Craft \w/ }).last();
    await expect(craftButton).toBeVisible();
    await expect(craftButton).toBeDisabled();
  });
});
