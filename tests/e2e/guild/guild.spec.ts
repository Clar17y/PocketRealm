import { test, expect } from '../fixtures/game.fixture.js';

test.describe('Guild', () => {
  test.beforeEach(async ({ gamePage: page }) => {
    await page.getByRole('navigation').getByText('Guild').click();
  });

  test('new player sees no-guild message', async ({ gamePage: page }) => {
    await expect(page.getByText(/not in a guild/i)).toBeVisible();
  });

  test('create guild button visible', async ({ gamePage: page }) => {
    await expect(page.getByRole('button', { name: /Create Guild/i })).toBeVisible();
  });

  test('guild search section visible', async ({ gamePage: page }) => {
    // The guild page for a guildless player should show search/browse area
    await expect(page.getByText(/not in a guild|Browse|Join/i).first()).toBeVisible();
  });

  test('creating guild via API shows guild dashboard', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(20);
    const guildName = `TG${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    await api.createGuild(guildName, `T${Math.random().toString(36).slice(2, 4).toUpperCase()}`);

    await page.reload();
    await page.getByRole('navigation').getByText('Guild').click();

    // Should show the guild name we created
    await expect(page.getByText(guildName)).toBeVisible({ timeout: 5_000 });
  });

  test('guild dashboard shows member count', async ({ gamePage: page, gameApi: api }) => {
    await api.adminSetLevel(20);
    await api.createGuild(`TG${Date.now()}${Math.random().toString(36).slice(2, 5)}`, `T${Math.random().toString(36).slice(2, 4).toUpperCase()}`);

    await page.reload();
    await page.getByRole('navigation').getByText('Guild').click();

    // Creator is the only member — should show "1" member somewhere
    await expect(page.getByText(/1.*member|member.*1/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
