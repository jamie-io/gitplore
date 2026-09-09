import { expect, test } from '@playwright/test';

/**
 * The hub is never destroyed and destinations are DOM overlays, so GPU resources must not grow
 * across enter/exit cycles (IMPLEMENTATION_PLAN.md §2, §11; M5 verify column).
 */
test.describe('memory', () => {
  test('renderer memory is flat across five enter/exit cycles', async ({ page }) => {
    await page.goto('/?stats=1');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    const stats = page.locator('app-hud .stats');
    await expect(stats).toHaveAttribute('data-geometries', /^[1-9]\d*$/);
    const geometries = await stats.getAttribute('data-geometries');
    const textures = await stats.getAttribute('data-textures');

    for (let cycle = 0; cycle < 5; cycle++) {
      await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
      await page.keyboard.press('KeyM');
      await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
      // The menu is a dialog too, so wait for the project panel by name.
      await expect(page.getByRole('dialog', { name: 'Deslopify' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }

    await page.waitForTimeout(700);
    await expect(stats).toHaveAttribute('data-geometries', geometries!);
    await expect(stats).toHaveAttribute('data-textures', textures!);
  });
});
