import { expect, test, type Page } from '@playwright/test';
import { settledStats, startWorld } from './helpers';

/**
 * The start world is now disposed when the visitor walks into a repo world and built again when
 * they come back (spec §2, reversing IMPLEMENTATION_PLAN.md §3). Resources must therefore be flat
 * across start world → repo world → start world, not just across opening and closing an overlay.
 */
/**
 * Waits until the engine has simulated `seconds` of movement. The engine clamps each frame's step
 * to 50 ms (`ENGINE_MAX_FRAME_SECONDS`), so under a slow software renderer a second of wall-clock
 * time moves the visitor less than a second's walk; counting clamped animation frames instead
 * keeps a walk's length the same at any frame rate.
 */
async function simulate(page: Page, seconds: number): Promise<void> {
  await page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        let simulated = 0;
        let last = performance.now();
        const tick = (now: number) => {
          simulated += Math.min((now - last) / 1000, 0.05);
          last = now;
          if (simulated >= target) {
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
}

/** Waits, checking every frame, until the HUD offers `text`: a walk stops within a frame of it. */
async function untilPrompt(page: Page, text: string): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelector('app-hud .prompt')?.textContent?.includes(expected),
    text,
    { polling: 'raf', timeout: 30_000 },
  );
}

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
      // The exact text, not a substring: the jungle's own area reads "Dschungel — Deslopify", so a
      // substring match passed while the jungle was still standing and the start world was being
      // built behind it — and a stats read then could catch the jungle's counts, not the clearing's.
      await expect(page.locator('app-hud .area')).toHaveText('Deslopify');
    };

    // Three agreeing reads over about two seconds: the portal's glTF arch is fetched again after
    // every return (its refcount drops to zero with the start world), and under parallel load
    // that fetch can leave the counts still for longer than one stats interval.
    const QUIET_READS = 3;

    // Both pairs are read for the baseline so each can be compared with itself later.
    const BASELINE_KEYS = ['scene-geometries', 'scene-textures', 'geometries', 'textures'] as const;

    // One cycle first, so a lazily arriving model (the portal glTF) is in place before the
    // baseline — but under heavy parallel load the model's first fetch plus its one-time
    // meshopt-decoder wasm compile can still be in flight after a single cycle, which would let a
    // pre-model count pass as settled — a false settle, not a leak, so cycling continues until
    // two full cycles in a row agree on the count.
    await cycle();
    let baseline = await settledStats(page, BASELINE_KEYS, QUIET_READS);
    for (let warmup = 0; warmup < 5; warmup++) {
      await cycle();
      const next = await settledStats(page, BASELINE_KEYS, QUIET_READS);
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

    const after = await settledStats(page, BASELINE_KEYS, QUIET_READS);
    // The scene counts are ownership: what the graph holds after five builds and disposals. They
    // must be identical to the baseline, and that is the leak guard.
    expect(after['scene-geometries']).toBe(baseline['scene-geometries']);
    expect(after['scene-textures']).toBe(baseline['scene-textures']);

    // `renderer.info.memory` is residency, not ownership: it counts what is uploaded to the GPU
    // right now, which legitimately sits *below* the scene's own totals once a texture stops being
    // drawn, and *above* them when the renderer holds something the graph never owned — the shadow
    // map. Measured across seven cycles the scene stayed at 58/7 while the renderer moved 58/8 →
    // 38/1. So these counts may only be compared with themselves, never with the scene's.
    expect(after.geometries).toBeLessThanOrEqual(baseline.geometries);
    expect(after.textures).toBeLessThanOrEqual(baseline.textures);
  });

  test('five pulls of the seed lever leave memory where it was', async ({ page }) => {
    await startWorld(page, '/?stats=1');
    await page.keyboard.press('KeyM');
    await page.locator('a[data-role="open"][data-slug="deslopify"]').click();
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-hud .area')).toContainText('Dschungel');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');

    // Walk up to the lever as a visitor does. It stands 4.5 m left of the walk, 70 % of the way
    // to the exhibit (`toyPlacements`). Forward-left runs at exactly 45°, so once the visitor is
    // 3.5 m to the left, straight on brings the lever into reach, ahead of the eyes. Not the full
    // 4.5 m: the first mistranslation sign's board ends at x −4.6, between the arrival and the
    // lever, and a body of radius 0.35 m walking at x −4.5 catches its edge and never arrives.
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyA');
    // 3.5 m sideways at 45° of the 4.5 m/s walk, plus half the 0.16 s ramp up to it.
    await simulate(page, 3.5 / (4.5 * Math.SQRT1_2) + 0.08);
    await page.keyboard.up('KeyA');
    await untilPrompt(page, 'Dekoration neu würfeln');
    await page.keyboard.up('KeyW');
    const prompt = page.locator('app-hud .prompt');
    await expect(prompt).toContainText('Dekoration neu würfeln');

    const KEYS = ['scene-geometries', 'scene-textures', 'geometries', 'textures'] as const;
    const baseline = await settledStats(page, KEYS, 3);

    for (let pull = 0; pull < 5; pull++) {
      await page.keyboard.press('KeyE');
      // One stats interval between pulls, so each rebuild is drawn at least once.
      await page.waitForTimeout(700);
      await expect(prompt).toContainText('Dekoration neu würfeln');
    }

    // The same pair rules as above: the scene's counts must be identical, the renderer's may only
    // stay level or fall.
    const after = await settledStats(page, KEYS, 3);
    expect(after['scene-geometries']).toBe(baseline['scene-geometries']);
    expect(after['scene-textures']).toBe(baseline['scene-textures']);
    expect(after.geometries).toBeLessThanOrEqual(baseline.geometries);
    expect(after.textures).toBeLessThanOrEqual(baseline.textures);
  });
});
