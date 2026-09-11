import { expect, test } from '@playwright/test';

/** M4 (IMPLEMENTATION_PLAN.md §5, §10): both demo kinds are usable. */
test.describe('demos', () => {
  test('an embeddable project shows its live demo in a sandboxed iframe', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    const frame = page.locator('app-demo-frame iframe');
    await expect(frame).toHaveAttribute('src', 'https://jamie-io.github.io/novaverta/');
    await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
    await expect(page.locator('a[data-role="open-tab"]')).toHaveAttribute('target', '_blank');
  });

  test('the in-world demo starts from the panel and leaves with Esc', async ({ page }) => {
    await page.goto('/p/deslopify/info');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    await page.locator('button[data-role="try-in-world"]').click();

    // Back to the jungle itself, with the demo running.
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');
    const hint = page.locator('app-hud .prompt');
    await expect(hint).toContainText('Originaltitel');

    // E flips the titles; the world keeps running, so nothing else changes.
    await page.keyboard.press('KeyE');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');

    await page.keyboard.press('Escape');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(hint).not.toContainText('Originaltitel');
  });

  test('the in-world demo also starts from the video wall standing in the jungle', async ({
    page,
  }) => {
    await page.goto('/p/deslopify');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await page.locator('app-world-page canvas').focus();

    // The exhibit board sits dead ahead of the arrival point; the wall stands beside it, off to
    // the board's left (spec §5), so the board is reached first and the wall by side-stepping
    // past it.
    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .prompt')).toContainText('ansehen', { timeout: 20_000 });
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyA');
    await expect(page.locator('app-hud .prompt')).toContainText('ausprobieren', {
      timeout: 20_000,
    });
    await page.keyboard.up('KeyA');

    await page.keyboard.press('KeyE');

    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'demo');
  });
});
