import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Dashboard', () => {
  test('displays available turns with starting amount', async ({ gamePage: page }) => {
    await expect(page.getByText('Available Turns')).toBeVisible();
    // New player starts with ~64,800 turns (header + dashboard both show it)
    await expect(page.getByRole('main').getByText(/6[0-9],\d{3}/)).toBeVisible();
  });

  test('displays health status', async ({ gamePage: page }) => {
    // New player should show "Health" (not "Knocked Out")
    await expect(page.getByText('Health')).toBeVisible();
  });

  test('displays character level 1', async ({ gamePage: page }) => {
    await expect(page.getByText('Character Level')).toBeVisible();
  });

  test('displays regen rate', async ({ gamePage: page }) => {
    await expect(page.getByText('Regen Rate').first()).toBeVisible();
    await expect(page.getByText(/\+\d+\/min/)).toBeVisible();
  });

  test('navigates to exploration screen', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
    await expect(page.getByRole('button', { name: 'Start Exploration' })).toBeVisible();
  });

  test('navigates to gathering screen', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Gathering', exact: true }).click();
    await expect(page.getByText('Discovered Nodes')).toBeVisible();
  });

  test('navigates to crafting screen', async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Explore').click();
    await page.getByRole('button', { name: 'Crafting', exact: true }).click();
    await expect(page.getByText(/Lv\./).first()).toBeVisible();
  });

  test('navigates to rest screen', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
    await expect(page.getByText('Current HP')).toBeVisible();
  });

  test('displays skills section with skill names', async ({ gamePage: page }) => {
    await expect(page.getByText('Melee').first()).toBeVisible();
    await expect(page.getByText('Mining').first()).toBeVisible();
  });

  test('displays recent activity section', async ({ gamePage: page }) => {
    await expect(page.getByRole('heading', { name: 'Recent Activity' })).toBeVisible();
    // New player should show "No recent activity"
    await expect(page.getByText('No recent activity')).toBeVisible();
  });

  test('navigates to skills screen via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Skills', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible();
  });

  test('navigates to bestiary via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Bestiary', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bestiary' })).toBeVisible();
  });

  test('navigates to achievements via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Achievements', exact: true }).click();
    await expect(page.getByText(/\d+ \/ \d+ Achievements/)).toBeVisible();
  });

  test('navigates to leaderboard via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Rankings', exact: true }).click();
    await expect(page.getByText(/Leaderboard/)).toBeVisible();
  });

  test('navigates to zone map via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'World Map' })).toBeVisible();
  });

  test('navigates to world events via sub-tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Events', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'World Events' })).toBeVisible();
  });
});
