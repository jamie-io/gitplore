import { expect, test } from '@playwright/test';

test.describe('shell', () => {
  test('desktop reaches the hub route', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'desktop-only');

    await page.goto('/');

    await expect(page.locator('app-world-page canvas')).toBeVisible();
  });

  test('a phone is redirected from the hub to the project list', async ({ page }) => {
    test.skip(test.info().project.name !== 'iphone', 'mobile-only');

    await page.goto('/');

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole('heading', { name: 'Projekte' })).toBeVisible();
  });

  test('a phone deep link lands on the project detail page', async ({ page }) => {
    test.skip(test.info().project.name !== 'iphone', 'mobile-only');

    await page.goto('/p/gitplore');

    await expect(page).toHaveURL(/\/projects\/gitplore$/);
  });
});
