import { expect, test } from '@playwright/test';

test.describe('project destination', () => {
  test('a deep link opens the panel with the README over the hub', async ({ page }) => {
    await page.goto('/p/novaverta');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Phönix Industriedienstleistungen');
    // Straight from the bundled README, not from projects.ts.
    await expect(dialog.locator('app-markdown')).toContainText('NOVA VERTA');
    await expect(page.locator('app-hub-page canvas')).toBeVisible();
  });

  test('the panel links to the demo and the source', async ({ page }) => {
    await page.goto('/p/novaverta');

    await expect(page.locator('a[data-role="demo"]')).toHaveAttribute(
      'href',
      'https://jamie-io.github.io/novaverta/',
    );
    await expect(page.locator('a[data-role="source"]')).toHaveAttribute(
      'href',
      'https://github.com/jamie-io/novaverta',
    );
  });

  test('closing returns to the hub and leaves the world running', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('button[data-role="close"]').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
  });

  test('escape closes the panel too', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('an unknown slug explains itself instead of breaking', async ({ page }) => {
    await page.goto('/p/nope');

    await expect(page.getByRole('dialog')).toContainText('nicht gefunden');
  });

  test('walking keys do not move the player while the panel is open', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.getByRole('dialog')).toBeVisible();
    const canvas = page.locator('app-hub-page canvas');

    const before = await canvas.screenshot();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');

    expect((await canvas.screenshot()).equals(before)).toBe(true);
  });
});
