import { expect, test } from '@playwright/test';
import { framesRendered, setTabHidden, startWorld } from './helpers';

test.describe('hub world', () => {
  test('boots to the ready phase', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
  });

  test('shows a start gate once the world is ready, with the controls explained', async ({
    page,
  }) => {
    await page.goto('/');

    const gate = page.getByRole('dialog', { name: 'Gitplore' });
    await expect(gate).toContainText('WASD');
    await gate.locator('button[data-role="start"]').click();
    await expect(gate).toHaveCount(0);
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-input-mode', 'world');
  });

  test('renders the world and redraws it as the player walks', async ({ page }) => {
    await startWorld(page);
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
    await startWorld(page, '/?stats=1');
    await expect.poll(() => framesRendered(page)).toBeGreaterThan(0);

    await setTabHidden(page, true);
    const before = await framesRendered(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');

    expect(await framesRendered(page)).toBe(before);
  });

  test('resumes rendering when the tab comes back', async ({ page }) => {
    await startWorld(page, '/?stats=1');
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

test.describe('focus management', () => {
  test('closing the settings hands focus back to the world', async ({ page }) => {
    await startWorld(page);

    await page.locator('button[data-role="settings"]').click();
    await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('app-hub-page canvas')).toBeFocused();
  });
});
