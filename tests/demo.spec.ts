import { expect, test } from '@playwright/test';

/** M4 (IMPLEMENTATION_PLAN.md §5, §10): both demo kinds are usable. */
test.describe('demos', () => {
  test('an embeddable project shows its live demo in a sandboxed iframe', async ({ page }) => {
    await page.goto('/p/novaverta');

    const frame = page.locator('app-demo-frame iframe');
    await expect(frame).toHaveAttribute('src', 'https://jamie-io.github.io/novaverta/');
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(page.locator('a[data-role="open-tab"]')).toHaveAttribute('target', '_blank');
  });

  test('the in-world demo can be started from the panel and left with Esc', async ({ page }) => {
    await page.goto('/p/deslopify');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');

    await page.locator('button[data-role="try-in-world"]').click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'demo');
    const hint = page.locator('app-hud .prompt');
    await expect(hint).toContainText('Originaltitel');

    // E flips the titles; the world keeps running, so nothing else changes.
    await page.keyboard.press('KeyE');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'demo');

    await page.keyboard.press('Escape');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(hint).not.toContainText('Originaltitel');
  });

  test('the in-world demo can also be started from the video wall itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('app-hub-page canvas').focus();

    // Fast travel to the portal, then sidestep right until the wall next to it is in reach.
    await page.keyboard.press('KeyM');
    await page.locator('button[data-role="travel"][data-slug="deslopify"]').click();
    // Keys are only read once the world has the input back, i.e. after the menu has closed.
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
    await page.keyboard.down('KeyD');
    await expect(page.locator('app-hud .prompt')).toContainText('ausprobieren', {
      timeout: 20_000,
    });
    await page.keyboard.up('KeyD');

    await page.keyboard.press('KeyE');

    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'demo');
  });
});
