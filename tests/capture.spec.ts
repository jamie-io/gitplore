import { expect, test } from '@playwright/test';

/**
 * Opt-in stills of every world at every quality tier, for art review:
 * `CAPTURE=1 npx playwright test tests/capture.spec.ts --project=chromium --workers=1`.
 * Reduced motion is forced so the stills are repeatable. SwiftShader renders the high tier slowly
 * but correctly, so no GPU is needed. Images land in captures/worlds/ (git-ignored) rather than
 * test-results/, which Playwright empties at the start of every run.
 */
const WORLDS = [
  { slug: 'lichtung', url: '/' },
  { slug: 'dschungel', url: '/p/deslopify' },
  { slug: 'plaza', url: '/p/gitplore' },
  { slug: 'showroom', url: '/p/novaverta' },
] as const;

const TIERS = ['low', 'medium', 'high'] as const;

test.describe('world captures', () => {
  test.skip(!process.env['CAPTURE'], 'set CAPTURE=1 to capture');
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  for (const world of WORLDS) {
    for (const tier of TIERS) {
      test(`${world.slug} at ${tier}`, async ({ page }) => {
        await page.setViewportSize({ width: 1600, height: 900 });
        await page.addInitScript((qualityOverride) => {
          localStorage.setItem(
            'gitplore.settings',
            JSON.stringify({ qualityOverride, sensitivity: 1, reducedMotionOverride: true }),
          );
        }, tier);

        await page.goto(world.url);
        await page.locator('button[data-role="start"]').click();
        await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
        await page.waitForTimeout(6000);
        const canvas = page.locator('app-world-page canvas');
        await canvas.screenshot({ path: `captures/worlds/${world.slug}-${tier}-arrival.png` });

        await canvas.focus();
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(1800);
        await page.keyboard.up('ArrowLeft');
        await page.waitForTimeout(1500);
        await canvas.screenshot({ path: `captures/worlds/${world.slug}-${tier}-turned.png` });
      });
    }
  }
});
