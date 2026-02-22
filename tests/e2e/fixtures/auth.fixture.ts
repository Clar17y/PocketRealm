import { test as base, Page } from '@playwright/test';
import { ApiHelper } from '../helpers/api.js';

interface AuthFixtures {
  authedPage: Page;
  api: ApiHelper;
  testUser: { username: string; email: string; password: string };
}

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    const id = uniqueId();
    await use({
      username: `e2e_${id}`,
      email: `e2e_${id}@test.com`,
      password: 'TestPassword123!',
    });
  },

  api: async ({ testUser }, use) => {
    const api = new ApiHelper();
    await api.register(testUser.username, testUser.email, testUser.password);
    await use(api);
    await api.dispose();
  },

  authedPage: async ({ page, api, testUser }, use) => {
    // Login via UI so localStorage tokens are set
    await page.goto('/login');
    await page.locator('#email').fill(testUser.email);
    await page.locator('#password').fill(testUser.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('/game');
    await use(page);
  },
});

export { expect } from '@playwright/test';
