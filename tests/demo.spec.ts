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

  test('the in-world demo starts at the wall without capturing input', async ({ page }) => {
    await page.goto('/p/deslopify/info');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    await page.locator('button[data-role="try-in-world"]').click();

    // Back to the jungle itself, facing the wall, with ordinary world input still active.
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify an · Entslopt \d+\/8/);
    await expect(page.locator('app-hud .prompt')).toContainText('Deslopify ausschalten');

    // E toggles wall state; it is still the world, not a captured demo, that handles the key.
    await page.keyboard.press('KeyE');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify aus · Entslopt \d+\/8/);

    await page.keyboard.press('KeyE');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify an · Entslopt \d+\/8/);
  });
});
