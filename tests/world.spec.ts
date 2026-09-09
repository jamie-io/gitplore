import { expect, test } from '@playwright/test';

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

  test('stops the render loop while the tab is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    const canvas = page.locator('app-hub-page canvas');

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);

    const before = await canvas.screenshot();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    const after = await canvas.screenshot();

    expect(before.equals(after)).toBe(true);
  });

  test('resumes rendering when the tab comes back', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-hub-page')).toHaveAttribute('data-phase', 'ready');
    const canvas = page.locator('app-hub-page canvas');

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
    const hidden = await canvas.screenshot();

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');

    expect((await canvas.screenshot()).equals(hidden)).toBe(false);
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
