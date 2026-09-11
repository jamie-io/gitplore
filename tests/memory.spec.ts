import { expect, test } from '@playwright/test';
import { settledStats, startWorld } from './helpers';

/**
 * The start world is now disposed when the visitor walks into a repo world and built again when
 * they come back (spec §2, reversing IMPLEMENTATION_PLAN.md §3). Resources must therefore be flat
 * across start world → repo world → start world, not just across opening and closing an overlay.
 */
test.describe('memory', () => {
  test('nothing leaks across five world changes', async ({ page }) => {
    await startWorld(page, '/?stats=1');
    const stats = page.locator('app-hud .stats');
    await expect(stats).toHaveAttribute('data-scene-geometries', /^[1-9]\d*$/);

    const cycle = async () => {
      await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
      await page.keyboard.press('KeyM');
      await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
      await expect(page).toHaveURL(/\/p\/deslopify$/);
      await expect(page.locator('app-hud .area')).toContainText('Dschungel');

      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('app-hud .area')).toContainText('Deslopify');
    };

    // One cycle first, so a lazily arriving model (the portal glTF) is in place before the
    // baseline — but `settledStats` only needs two 700 ms-apart reads to agree to call a value
    // settled, and under heavy parallel load the model's first fetch plus its one-time
    // meshopt-decoder wasm compile can still be in flight after a single cycle. That lets it
    // declare the pre-model count "stable" before the model ever arrives — a false settle, not a
    // leak, so cycling continues until two full cycles in a row agree on the count.
    await cycle();
    let baseline = await settledStats(page, ['scene-geometries', 'scene-textures']);
    for (let warmup = 0; warmup < 5; warmup++) {
      await cycle();
      const next = await settledStats(page, ['scene-geometries', 'scene-textures']);
      if (
        next['scene-geometries'] === baseline['scene-geometries'] &&
        next['scene-textures'] === baseline['scene-textures']
      ) {
        break;
      }
      baseline = next;
    }

    for (let i = 0; i < 5; i++) {
      await cycle();
    }

    const after = await settledStats(page, [
      'scene-geometries',
      'scene-textures',
      'geometries',
      'textures',
    ]);
    expect(after['scene-geometries']).toBe(baseline['scene-geometries']);
    expect(after['scene-textures']).toBe(baseline['scene-textures']);
    expect(after.geometries).toBeLessThanOrEqual(baseline['scene-geometries']);
    expect(after.textures).toBeLessThanOrEqual(baseline['scene-textures']);
  });
});
