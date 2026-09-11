import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Spec §8: a repo world and the panel over it must both survive an axe pass. */
test.describe('accessibility', () => {
  test('a repo world has no automatically detectable violations', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the description panel over a repo world has none either', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The panel embeds the project's own live demo in a sandboxed, cross-origin iframe
      // (`novaverta`'s GitHub Pages site). That page is a separate project with its own
      // accessibility surface; gitplore's own definition of done covers the panel that frames
      // it, not a third-party document it merely links to.
      .exclude('iframe')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
