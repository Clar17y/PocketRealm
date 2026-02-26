import { test as authTest } from './auth.fixture.js';
import { ApiHelper } from '../helpers/api.js';
import { Page } from '@playwright/test';

interface GameFixtures {
  gamePage: Page;
  gameApi: ApiHelper;
}

export const test = authTest.extend<GameFixtures>({
  gameApi: async ({ api }, use) => {
    await use(api);
  },

  gamePage: async ({ authedPage }, use) => {
    // Tutorial is already skipped via API in auth fixture
    await authedPage.waitForSelector('text=Available Turns', { timeout: 10_000 });
    await use(authedPage);
  },
});

export { expect } from '@playwright/test';
