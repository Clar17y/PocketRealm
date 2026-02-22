import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Dashboard', () => {
  test('displays available turns', async ({ gamePage: page }) => {
    await expect(page.getByText('Available Turns')).toBeVisible();
    // New player starts with 86,400 turns
    await expect(page.getByText(/[\d,]+/).first()).toBeVisible();
  });

  test('displays health bar', async ({ gamePage: page }) => {
    await expect(page.getByText(/Health|Knocked Out/)).toBeVisible();
  });

  test('displays character level', async ({ gamePage: page }) => {
    await expect(page.getByText('Character Level')).toBeVisible();
  });

  test('displays regen rate', async ({ gamePage: page }) => {
    await expect(page.getByText(/Regen Rate/)).toBeVisible();
  });

  test('navigates to exploration screen', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Explore' }).click();
    await expect(page.getByRole('button', { name: 'Start Exploration' })).toBeVisible();
  });

  test('navigates to gathering screen', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Mine' }).click();
    await expect(page.getByText(/Discovered Nodes/)).toBeVisible();
  });

  test('navigates to crafting screen', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Craft' }).click();
    await expect(page.getByText(/Lv\./)).toBeVisible();
  });

  test('navigates to rest screen', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: /^(Rest|Recover)$/ }).click();
    await expect(page.getByText('Current HP')).toBeVisible();
  });

  test('displays skills grid', async ({ gamePage: page }) => {
    // Skills should be visible on dashboard
    await expect(page.getByText(/melee|Melee/i)).toBeVisible();
  });

  test('displays activity log', async ({ gamePage: page }) => {
    // Activity log section at bottom of dashboard
    await expect(page.getByText(/Activity|Log/i)).toBeVisible();
  });

  test('navigates to skills screen via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Skills' }).click();
    await expect(page.getByText('Total Level')).toBeVisible();
  });

  test('navigates to bestiary via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Bestiary' }).click();
    await expect(page.getByText('Bestiary')).toBeVisible();
  });

  test('navigates to achievements via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Achievements' }).click();
    await expect(page.getByText(/Achievements/)).toBeVisible();
  });

  test('navigates to leaderboard via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Rankings' }).click();
    await expect(page.getByText('Leaderboards')).toBeVisible();
  });

  test('navigates to zone map via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Map' }).click();
    await expect(page.getByText('World Map')).toBeVisible();
  });

  test('navigates to world events via tab', async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Events' }).click();
    await expect(page.getByText('World Events')).toBeVisible();
  });
});
