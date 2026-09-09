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

/** Fakes the Page Visibility API, which Playwright cannot trigger for real. */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
