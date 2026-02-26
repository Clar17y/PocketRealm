import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Logout', () => {
  test('logs out and redirects to login', async ({ authedPage: page, testUser }) => {
    // Wait for game to load
    await page.waitForSelector('text=Available Turns', { timeout: 10_000 });

    // Open the username dropdown in the header
    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    await page.waitForURL('/login');
  });

  test('clears tokens from localStorage on logout', async ({ authedPage: page, testUser }) => {
    await page.waitForSelector('text=Available Turns', { timeout: 10_000 });

    // Verify tokens exist before logout
    const tokenBefore = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(tokenBefore).toBeTruthy();

    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    await page.waitForURL('/login');

    const tokenAfter = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(tokenAfter).toBeNull();
  });

  test('cannot access game after logout', async ({ authedPage: page, testUser }) => {
    await page.waitForSelector('text=Available Turns', { timeout: 10_000 });

    await page.getByRole('button', { name: new RegExp(testUser.username) }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    await page.waitForURL('/login');

    await page.goto('/game');
    await page.waitForURL('/login');
  });
});
