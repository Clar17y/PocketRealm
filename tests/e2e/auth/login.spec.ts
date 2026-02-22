import { test, expect } from '@playwright/test';
import { ApiHelper } from '../helpers/api.js';

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

test.describe('Login', () => {
  let testEmail: string;
  let testPassword: string;

  test.beforeAll(async () => {
    const id = uniqueId();
    testEmail = `e2e_login_${id}@test.com`;
    testPassword = 'TestPassword123!';
    const api = new ApiHelper();
    await api.register(`e2e_login_${id}`, testEmail, testPassword);
    await api.dispose();
  });

  test('logs in with valid credentials and redirects to game', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill(testPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('/game');
    await expect(page.getByText('Available Turns')).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill('WrongPassword999!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('[class*="error"]')).toBeVisible();
  });

  test('shows error for non-existent email', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nonexistent@test.com');
    await page.locator('#password').fill('TestPassword123!');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('[class*="error"]')).toBeVisible();
  });

  test('redirects to game if already authenticated', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill(testPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('/game');

    await page.goto('/login');
    await page.waitForURL('/game');
  });
});
