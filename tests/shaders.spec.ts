import { expect, test, type Page } from '@playwright/test';

/**
 * Every world compiles its shaders, on the cheapest tier and on the strongest. A GLSL error does
 * not throw — Three logs it and the object simply never draws — so the console is the only
 * reliable signal in a browser test. The high tier exists in this file because that is the only
 * tier with the post stack: its passes compile nowhere else in the suite.
 */
const WORLDS = [
  { place: 'Lichtung', url: '/' },
  { place: 'Dschungel', url: '/p/deslopify' },
  { place: 'Plaza', url: '/p/gitplore' },
  { place: 'Showroom', url: '/p/novaverta' },
] as const;

/** The tiers the gate covers; the post stack is only on the second, so it is not optional. */
const TIERS = ['low', 'high'] as const;

type Tier = (typeof TIERS)[number] | 'medium';

/**
 * Frames the loop must draw after a tier change. The post stack loads lazily on the first frame
 * that wants it, so the first frames after the switch still go straight to the canvas; by the
 * fourth the composer has drawn, and with it every pass has compiled.
 */
const FRAMES_AFTER_SWITCH = 4;

/**
 * Textures the post stack holds beyond the scene's own: a lower bound, so a pass may grow its
 * mip chain without touching this, while a stack that never loaded cannot reach it.
 */
const POST_STACK_TEXTURES = 10;

/** What the renderer may keep once the post stack is gone: the sun's shadow map. */
const SHADOW_MAP_TEXTURES = 1;

/** SwiftShader draws the high tier at a frame or two per second; the low tier stays quick. */
const HIGH_TIER_TIMEOUT_MS = 240_000;
const FRAME_TIMEOUT_MS = 200_000;

/** Console lines that are not ours to fix. Each entry needs a reason. */
const KNOWN: readonly RegExp[] = [];

/**
 * Picks a tier through the settings dialog, the way a visitor does. Writing the choice into
 * `localStorage` before boot does not work: the settings store that reads it is only created
 * with the dialog, so the stored tier applies the first time the dialog opens, not on start.
 */
async function chooseTier(page: Page, tier: Tier): Promise<void> {
  await page.locator('button[data-role="settings"]').click();
  await page.locator('#settings-quality').selectOption(tier);
  await page.locator('button[data-role="close"]').click();
  await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
}

/** Frames drawn so far, as the HUD publishes them with `?stats=1`. */
async function frames(page: Page): Promise<number> {
  return Number(await page.locator('app-hud .stats').getAttribute('data-frames'));
}

/** Renderer textures that belong to no scene material: the render targets of shadow map and post stack. */
async function rendererOwnedTextures(page: Page): Promise<number> {
  const stats = page.locator('app-hud .stats');
  const textures = Number(await stats.getAttribute('data-textures'));
  const sceneTextures = Number(await stats.getAttribute('data-scene-textures'));
  return textures - sceneTextures;
}

async function waitForFrames(page: Page, count: number): Promise<void> {
  const start = await frames(page);
  await expect
    .poll(() => frames(page), { timeout: FRAME_TIMEOUT_MS })
    .toBeGreaterThanOrEqual(start + count);
}

for (const tier of TIERS) {
  for (const world of WORLDS) {
    test(`${world.place} compiles every shader on the ${tier} tier`, async ({ page }) => {
      if (tier === 'high') {
        test.setTimeout(HIGH_TIER_TIMEOUT_MS);
      }

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

      await page.goto(`${world.url}?stats=1`);
      await page.locator('button[data-role="start"]').click();
      await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('app-hud .area')).toContainText(world.place);

      await chooseTier(page, tier);
      // Programs compile on first draw, so count frames rather than wait a fixed time: on the
      // high tier under SwiftShader a fixed wait would cover barely one frame.
      await waitForFrames(page, FRAMES_AFTER_SWITCH);
      // Landmark models arrive asynchronously and compile on their own first draw.
      await page.waitForTimeout(1500);

      expect(problems).toEqual([]);

      if (tier === 'high') {
        // A green console proves nothing if the stack never loaded. Its render targets count as
        // renderer textures but belong to no scene material, so the gap between the two HUD
        // counts is the stack's footprint: two composer buffers, the AO pass's six, bloom's mips.
        expect(await rendererOwnedTextures(page)).toBeGreaterThanOrEqual(POST_STACK_TEXTURES);

        // Stepping down must give all of it back, or every tier drop leaks a stack.
        await chooseTier(page, 'medium');
        await waitForFrames(page, 2);
        await expect
          .poll(() => rendererOwnedTextures(page), { timeout: FRAME_TIMEOUT_MS })
          .toBeLessThanOrEqual(SHADOW_MAP_TEXTURES);
        expect(problems).toEqual([]);
      }
    });
  }
}
