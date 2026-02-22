import { test, expect } from '../fixtures/auth.fixture.js';

test.describe('Logout', () => {
  test('logs out and redirects to login', async ({ authedPage: page }) => {
    // Find and click logout (usually in settings or nav)
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /logout/i }).click();
    await page.waitForURL('/login');
  });

  test('clears tokens from localStorage on logout', async ({ authedPage: page }) => {
    // Verify tokens exist before logout
    const tokenBefore = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(tokenBefore).toBeTruthy();

    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /logout/i }).click();
    await page.waitForURL('/login');

    const tokenAfter = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(tokenAfter).toBeNull();
  });

  test('cannot access game after logout', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('button', { name: /logout/i }).click();
    await page.waitForURL('/login');

    await page.goto('/game');
    await page.waitForURL('/login');
  });
});
