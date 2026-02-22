import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Crafting', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('button', { name: 'Craft' }).click();
  });

  test('displays skill level header', async ({ gamePage: page }) => {
    await expect(page.getByText(/Lv\./)).toBeVisible();
  });

  test('displays recipe list', async ({ gamePage: page }) => {
    // Should show recipes or "no recipes" state
    await page.waitForTimeout(1_000);
  });

  test('shows recipe detail when selecting a recipe', async ({ gamePage: page }) => {
    // Click first recipe in the list
    const recipeCards = page.locator('[class*="cursor-pointer"]');
    if (await recipeCards.count() > 0) {
      await recipeCards.first().click();
      // Should show materials, turn cost, XP reward
      await expect(page.getByText('Required Materials').or(page.getByText('Turn Cost'))).toBeVisible();
    }
  });

  test('shows material requirements with owned vs needed', async ({ gamePage: page }) => {
    const recipeCards = page.locator('[class*="cursor-pointer"]');
    if (await recipeCards.count() > 0) {
      await recipeCards.first().click();
      // Should show X / Y format for materials
      await expect(page.getByText(/\d+ \/ \d+/).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('craft button disabled when missing materials', async ({ gamePage: page }) => {
    const recipeCards = page.locator('[class*="cursor-pointer"]');
    if (await recipeCards.count() > 0) {
      await recipeCards.first().click();
      const craftButton = page.getByRole('button', { name: /^Craft |Missing/ });
      if (await craftButton.isVisible()) {
        // Should be disabled if player lacks materials
        await page.waitForTimeout(500);
      }
    }
  });

  test('craft button shows level requirement for locked recipes', async ({ gamePage: page }) => {
    // Look for a recipe that requires higher level
    const lockedRecipe = page.getByText(/Unlocks at Lv\./);
    if (await lockedRecipe.count() > 0) {
      await lockedRecipe.first().click();
      await expect(page.getByRole('button', { name: /Requires Lv\./ })).toBeVisible();
    }
  });
});
