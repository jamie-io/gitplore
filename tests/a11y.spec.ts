import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startWorld } from './helpers';

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

  test('the settings dialog has no automatically detectable violations', async ({ page }) => {
    await startWorld(page);
    await page.locator('button[data-role="settings"]').click();
    await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible();

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

  test("a README's task lists survive the same pass", async ({ page }) => {
    // Deslopify is the only README with GFM task lists, and `marked` renders those as bare
    // disabled checkboxes — form controls with no accessible name. Scanning only novaverta hid
    // eleven `label` violations from this suite until a Lighthouse run found them.
    await page.goto('/p/deslopify/info');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.markdown input[type="checkbox"]').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the document declares the language it is actually written in', async ({ page }) => {
    // WCAG 3.1.1. The interface is German throughout, so an `en` document made every screen
    // reader pronounce it with an English voice. axe cannot detect a wrong language, only a
    // missing one, which is why this is asserted rather than scanned.
    await page.goto('/projects');

    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});
