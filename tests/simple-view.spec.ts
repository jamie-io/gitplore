import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const SYNCED_COUNT = JSON.parse(readFileSync('public/content/repos.json', 'utf8')).length as number;

test.describe('simple view', () => {
  test('the project list shows every project', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Projekte');
    await expect(page.locator('article')).toHaveCount(SYNCED_COUNT);
    // Order follows GitHub's "most recently pushed" sort, which shifts as repositories are
    // worked on, so assert the curated project is present rather than pinning its position.
    await expect(page.locator('article', { hasText: 'Phönix' })).toHaveCount(1);
  });

  test('a detail page shows the README and the links', async ({ page }) => {
    await page.goto('/projects/novaverta');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Phönix');
    await expect(page.locator('app-markdown')).toContainText('NOVA VERTA');
    await expect(page.locator('a[data-role="source"]')).toBeVisible();
  });
});
