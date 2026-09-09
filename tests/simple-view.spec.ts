import { expect, test } from '@playwright/test';

test.describe('simple view', () => {
  test('the project list shows every project', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projekte');
    await expect(page.locator('article')).toHaveCount(3);
    await expect(page.locator('article').first()).toContainText('Phönix');
  });

  test('a detail page shows the README and the links', async ({ page }) => {
    await page.goto('/projects/novaverta');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Phönix');
    await expect(page.locator('app-markdown')).toContainText('NOVA VERTA');
    await expect(page.locator('a[data-role="source"]')).toBeVisible();
  });
});
