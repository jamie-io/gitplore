import { expect, test } from '@playwright/test';

/**
 * Every world compiles its shaders. A GLSL error does not throw — Three logs it and the object
 * simply never draws — so the console is the only reliable signal in a browser test.
 */
const WORLDS = [
  { place: 'Lichtung', url: '/' },
  { place: 'Dschungel', url: '/p/deslopify' },
  { place: 'Plaza', url: '/p/gitplore' },
  { place: 'Showroom', url: '/p/novaverta' },
] as const;

/** Console lines that are not ours to fix. Each entry needs a reason. */
const KNOWN: readonly RegExp[] = [];

for (const world of WORLDS) {
  test(`${world.place} compiles every shader`, async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      const relevant =
        message.type() === 'error' ||
        (message.type() === 'warning' && /THREE\.|WebGL|GL_|shader/i.test(text));
      if (relevant && !KNOWN.some((pattern) => pattern.test(text))) {
        problems.push(`${message.type()}: ${text}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    await page.goto(world.url);
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('app-hud .area')).toContainText(world.place);
    // Programs compile on first draw; give the loop a moment to draw everything once.
    await page.waitForTimeout(1500);

    expect(problems).toEqual([]);
  });
}
