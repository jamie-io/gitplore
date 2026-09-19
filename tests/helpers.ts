import { expect, type Page } from '@playwright/test';

/** How often the HUD samples the engine (`STATS_INTERVAL_MS` in hud.ts), plus slack. */
const STATS_SETTLE_MS = 700;

/**
 * Number of frames the engine has drawn, as published by the HUD stats overlay (`?stats=1`).
 * Waits one stats interval first so the value reflects the current loop state.
 */
export async function framesRendered(page: Page): Promise<number> {
  await page.waitForTimeout(STATS_SETTLE_MS);
  const value = await page.locator('app-hud .stats').getAttribute('data-frames');
  return Number(value);
}

/** The HUD stats exposed as `data-*` attributes by `?stats=1`. */
type StatName = 'geometries' | 'textures' | 'scene-geometries' | 'scene-textures';

/**
 * HUD stats once they have stopped changing: models arrive asynchronously, so the first reading
 * after boot is not yet the steady state. All requested stats are read from the same sample, both
 * so they are consistent with each other and so one settle costs one wait, not one per stat.
 *
 * `quietReads` is how many consecutive re-reads, one stats interval apart, must agree before the
 * value counts as settled. One is enough on an idle machine; under parallel load a model fetch or
 * a long main-thread task can hold the counts still for more than one interval mid-change.
 */
export async function settledStats<T extends StatName>(
  page: Page,
  names: readonly T[],
  quietReads = 1,
): Promise<Record<T, number>> {
  const stats = page.locator('app-hud .stats');
  const read = async () => Promise.all(names.map((name) => stats.getAttribute(`data-${name}`)));

  let previous = await read();
  let quiet = 0;
  for (let i = 0; i < 20 + quietReads; i++) {
    await page.waitForTimeout(STATS_SETTLE_MS);
    const current = await read();
    quiet = current.every((value, index) => value === previous[index]) ? quiet + 1 : 0;
    if (quiet >= quietReads) {
      return Object.fromEntries(
        names.map((name, index) => [name, Number(current[index])]),
      ) as Record<T, number>;
    }
    previous = current;
  }
  throw new Error(`stats never settled: ${names.join(', ')}`);
}

/** Fakes the Page Visibility API, which Playwright cannot trigger for real. */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Boots whatever world `url` names and clicks through the loading screen's start gate. */
export async function startWorld(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.locator('button[data-role="start"]').click();
  // Keys are only read once the world has the input; a keydown before that is simply dropped.
  await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
  await page.locator('app-world-page canvas').focus();
}
