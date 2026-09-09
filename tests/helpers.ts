import type { Page } from '@playwright/test';

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

/**
 * A HUD stat once it has stopped changing: models arrive asynchronously, so the first reading
 * after boot is not yet the steady state.
 */
export async function settledStat(page: Page, name: 'geometries' | 'textures'): Promise<string> {
  const stats = page.locator('app-hud .stats');
  let previous = await stats.getAttribute(`data-${name}`);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(STATS_SETTLE_MS);
    const current = await stats.getAttribute(`data-${name}`);
    if (current === previous) {
      return current ?? '';
    }
    previous = current;
  }
  throw new Error(`${name} never settled`);
}

/** Fakes the Page Visibility API, which Playwright cannot trigger for real. */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Boots the hub and clicks through the loading screen's start gate, as a visitor would. */
export async function startWorld(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.locator('button[data-role="start"]').click();
  await page.locator('app-hub-page canvas').focus();
}
