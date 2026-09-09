import { expect, test } from '@playwright/test';
import { settledStat, startWorld } from './helpers';

/**
 * The hub is never destroyed and destinations are DOM overlays, so GPU resources must not grow
 * across enter/exit cycles (IMPLEMENTATION_PLAN.md §2, §11; M5 verify column).
 */
test.describe('memory', () => {
  test('renderer memory is flat across five enter/exit cycles', async ({ page }) => {
    await startWorld(page, '/?stats=1');
    const stats = page.locator('app-hud .stats');
    await expect(stats).toHaveAttribute('data-geometries', /^[1-9]\d*$/);

    const cycle = async () => {
      await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
      await page.keyboard.press('KeyM');
      await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
      // The menu is a dialog too, so wait for the project panel by name.
      await expect(page.getByRole('dialog', { name: 'Deslopify' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    };

    // Warm up until a cycle stops changing the numbers: Three counts a geometry only once it has
    // been drawn, and the returning player faces parts of the world the spawn view never showed.
    let geometries = await settledStat(page, 'geometries');
    let textures = await settledStat(page, 'textures');
    for (let warmUp = 0; warmUp < 4; warmUp++) {
      await cycle();
      const g = await settledStat(page, 'geometries');
      const t = await settledStat(page, 'textures');
      const stable = g === geometries && t === textures;
      geometries = g;
      textures = t;
      if (stable) {
        break;
      }
    }

    for (let i = 0; i < 5; i++) {
      await cycle();
    }

    expect(await settledStat(page, 'geometries')).toBe(geometries);
    expect(await settledStat(page, 'textures')).toBe(textures);
  });
});
