import { test as authTest } from './auth.fixture.js';
import { ApiHelper } from '../helpers/api.js';
import { Page } from '@playwright/test';

interface GameFixtures {
  gamePage: Page;
  gameApi: ApiHelper;
}

export const test = authTest.extend<GameFixtures>({
  gameApi: async ({ api }, use) => {
    // api is already authenticated from auth fixture
    await use(api);
  },

  gamePage: async ({ authedPage, api }, use) => {
    // Wait for game page to fully load (dashboard renders turns)
    await authedPage.waitForSelector('text=Available Turns', { timeout: 10_000 });
    await use(authedPage);
  },
});

export { expect } from '@playwright/test';
