import { test, expect } from '@playwright/test';

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('Register', () => {
  test('registers a new user and redirects to game', async ({ page }) => {
    const id = uniqueId();
    await page.goto('/register');
    await page.locator('#username').fill(`e2e_reg_${id}`);
    await page.locator('#email').fill(`e2e_reg_${id}@test.com`);
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForURL('/game');
    await expect(page.getByText('Available Turns')).toBeVisible();
  });

  test('shows error for duplicate username', async ({ page }) => {
    const id = uniqueId();
    const username = `e2e_dup_${id}`;
    const email1 = `e2e_dup1_${id}@test.com`;
    const email2 = `e2e_dup2_${id}@test.com`;

    // Register first user
    await page.goto('/register');
    await page.locator('#username').fill(username);
    await page.locator('#email').fill(email1);
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForURL('/game');

    // Clear tokens and try duplicate
    await page.evaluate(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    });
    await page.goto('/register');
    await page.locator('#username').fill(username);
    await page.locator('#email').fill(email2);
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.locator('[class*="error"]')).toBeVisible();
  });

  test('shows validation for short username', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#username').fill('ab');
    await page.locator('#email').fill('short@test.com');
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Register' }).click();
    // HTML5 validation prevents submission — check we're still on register
    await expect(page).toHaveURL(/\/register/);
  });

  test('shows validation for weak password', async ({ page }) => {
    await page.goto('/register');
    await page.locator('#username').fill('validuser');
    await page.locator('#email').fill('weak@test.com');
    await page.locator('#password').fill('short');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('redirects to game if already authenticated', async ({ page }) => {
    const id = uniqueId();
    // Register first
    await page.goto('/register');
    await page.locator('#username').fill(`e2e_redir_${id}`);
    await page.locator('#email').fill(`e2e_redir_${id}@test.com`);
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Register' }).click();
    await page.waitForURL('/game');

    // Try to visit register again
    await page.goto('/register');
    await page.waitForURL('/game');
  });
});
