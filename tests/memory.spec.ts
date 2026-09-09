import { expect, test } from '@playwright/test';
import { settledStat, startWorld } from './helpers';

/**
 * The hub is never destroyed and destinations are DOM overlays, so resources must not grow across
 * enter/exit cycles (IMPLEMENTATION_PLAN.md §2, §11; M5 verify column).
 *
 * Two yardsticks: what the scene graph owns must stay flat, and the GPU must never hold more
 * geometries than the scene owns — anything uploaded but no longer referenced is a leak. The raw
 * `renderer.info.memory` count alone is view-dependent (a geometry counts once it has been drawn),
 * so it is not compared for equality.
 */
test.describe('memory', () => {
  test('nothing leaks across five enter/exit cycles', async ({ page }) => {
    await startWorld(page, '/?stats=1');
    const stats = page.locator('app-hud .stats');
    await expect(stats).toHaveAttribute('data-scene-geometries', /^[1-9]\d*$/);

    const cycle = async () => {
      await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
      await page.keyboard.press('KeyM');
      await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
      // The menu is a dialog too, so wait for the project panel by name.
      await expect(page.getByRole('dialog', { name: 'Deslopify' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    };

    // One cycle first, so lazily arriving models (portal glTF) are in place before the baseline.
    await cycle();
    const geometries = await settledStat(page, 'scene-geometries');
    const textures = await settledStat(page, 'scene-textures');

    for (let i = 0; i < 5; i++) {
      await cycle();
    }

    expect(await settledStat(page, 'scene-geometries')).toBe(geometries);
    expect(await settledStat(page, 'scene-textures')).toBe(textures);
    expect(Number(await settledStat(page, 'geometries'))).toBeLessThanOrEqual(Number(geometries));
    expect(Number(await settledStat(page, 'textures'))).toBeLessThanOrEqual(Number(textures));
  });
});
