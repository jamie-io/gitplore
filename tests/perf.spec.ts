import { expect, test } from '@playwright/test';
import { framesRendered } from './helpers';

/**
 * Opt-in frame-rate probe: `PERF=1 npx playwright test tests/perf.spec.ts --project=chromium
 * --workers=1`. It is not a gate: SwiftShader frame rates depend on what else the machine is doing.
 * It prints one line per world so a change can be compared with the numbers recorded before it in
 * the performance test record.
 */
const WORLDS = [
  { place: 'Lichtung', url: '/?stats=1' },
  { place: 'Dschungel', url: '/p/deslopify?stats=1' },
  { place: 'Plaza', url: '/p/gitplore?stats=1' },
  { place: 'Showroom', url: '/p/novaverta?stats=1' },
] as const;

const SAMPLE_MS = 5000;

test.describe('frame rate', () => {
  test.skip(!process.env['PERF'], 'set PERF=1 to measure');
  test.describe.configure({ mode: 'serial' });

  for (const world of WORLDS) {
    test(world.place, async ({ page }) => {
      await page.goto(world.url);
      await page.locator('button[data-role="start"]').click();
      await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
      await page.waitForTimeout(3000);

      const before = await framesRendered(page);
      const started = Date.now();
      await page.waitForTimeout(SAMPLE_MS);
      const after = await framesRendered(page);
      const fps = ((after - before) * 1000) / (Date.now() - started);

      console.log(`[fps] ${world.place}: ${fps.toFixed(1)}`);
      expect(fps).toBeGreaterThan(0);
    });
  }
});
