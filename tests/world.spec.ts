import { expect, test } from '@playwright/test';
import { framesRendered, setTabHidden } from './helpers';

test.describe('hub world', () => {
  test('boots to the ready phase', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
  });

  test('renders the world and redraws it as the player walks', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    const canvas = page.locator('app-hub-page canvas');

    const before = await canvas.screenshot();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    const after = await canvas.screenshot();

    expect(before.equals(after)).toBe(false);
  });

  // The pause tests read the engine's own frame counter rather than comparing canvas pixels:
  // under software rendering the compositor may repaint a paused canvas, which made the pixel
  // comparison racy without the loop ever running.
  test('stops the render loop while the tab is hidden', async ({ page }) => {
    await page.goto('/?stats=1');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    await expect.poll(() => framesRendered(page)).toBeGreaterThan(0);

    await setTabHidden(page, true);
    const before = await framesRendered(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');

    expect(await framesRendered(page)).toBe(before);
  });

  test('resumes rendering when the tab comes back', async ({ page }) => {
    await page.goto('/?stats=1');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    await setTabHidden(page, true);
    const hidden = await framesRendered(page);

    await setTabHidden(page, false);

    await expect.poll(() => framesRendered(page)).toBeGreaterThan(hidden);
  });

  test('exposes the world to keyboard users with a labelled application region', async ({
    page,
  }) => {
    await page.goto('/');

    const canvas = page.locator('app-hub-page canvas');
    await expect(canvas).toHaveAttribute('role', 'application');
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await expect(canvas).toHaveAttribute('aria-label', /WASD/);
  });
});
