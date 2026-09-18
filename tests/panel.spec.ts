import { expect, test } from '@playwright/test';
import { framesRendered, startWorld } from './helpers';

test.describe('project destination', () => {
  test('a deep link opens the panel with the README over that world', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Phönix Industriedienstleistungen');
    // Straight from the bundled README, not from projects.ts.
    await expect(dialog.locator('app-markdown')).toContainText('NOVA VERTA');
    await expect(page.locator('app-world-page canvas')).toBeVisible();
  });

  test('the panel links to the demo and the source', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    await expect(page.locator('a[data-role="demo"]')).toHaveAttribute(
      'href',
      'https://jamie-io.github.io/novaverta/',
    );
    await expect(page.locator('a[data-role="source"]')).toHaveAttribute(
      'href',
      'https://github.com/jamie-io/novaverta',
    );
  });

  test('closing the panel leaves the visitor in the repository’s own world', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('button[data-role="close"]').click();

    await expect(page).toHaveURL(/\/p\/novaverta$/);
    await expect(page.getByRole('dialog', { name: /Phönix/ })).toHaveCount(0);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('app-hud .area')).toContainText('Showroom');
  });

  test('escape closes the panel too', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: /Phönix/ })).toHaveCount(0);
  });

  test('an unknown slug explains itself and leaves the start world standing', async ({ page }) => {
    await page.goto('/p/nope/info');

    await expect(page.getByRole('dialog')).toContainText('nicht gefunden');
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');
  });

  test('opening the panel pauses an active world', async ({ page }) => {
    await startWorld(page, '/p/novaverta?stats=1');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    const running = await framesRendered(page);
    expect(running).toBeGreaterThan(0);

    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .prompt')).toContainText('ansehen', { timeout: 20_000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/p\/novaverta\/info$/);
    await expect(page.getByRole('dialog')).toBeVisible();

    const paused = await framesRendered(page);
    expect(await framesRendered(page)).toBe(paused);

    await page.locator('button[data-role="close"]').click();
    await expect(page).toHaveURL(/\/p\/novaverta$/);
    await expect.poll(() => framesRendered(page)).toBeGreaterThan(paused);
  });
});
