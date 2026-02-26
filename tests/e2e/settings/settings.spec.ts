import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Settings', () => {
  test('settings item visible in username dropdown', async ({ gamePage: page, testUser }) => {
    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible();
  });

  test('clicking settings opens settings screen', async ({ gamePage: page, testUser }) => {
    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page.getByText(/Settings|Preferences/i).first()).toBeVisible();
  });

  test('displays auto-potion setting', async ({ gamePage: page, testUser }) => {
    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page.getByText(/Auto.?Potion|Potion/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('displays low HP warning setting', async ({ gamePage: page, testUser }) => {
    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page.getByText(/Low HP|HP Warning/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
